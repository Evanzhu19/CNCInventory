import { Router } from "express";
import { z } from "zod";
import { InventoryBucket, RecoveryStatus, UserRole } from "../generated/prisma/enums.js";
import { writeOperationLog } from "../lib/inventory.js";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { toBigIntId, toNumber } from "../lib/serialize.js";

const router = Router();

const dateRangeSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

router.get("/", requireRole(UserRole.GENERAL_MANAGER, UserRole.ADMIN), async (req, res, next) => {
  try {
    const { startDate, endDate } = dateRangeSchema.parse(req.query);
    const data = await prisma.deleteRequest.findMany({
      where: startDate || endDate ? {
        requestTime: {
          ...(startDate ? { gte: new Date(`${startDate}T00:00:00.000`) } : {}),
          ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999`) } : {}),
        },
      } : undefined,
      orderBy: { requestTime: "desc" },
      include: {
        requester: { select: { id: true, realName: true } },
        reviewer: { select: { id: true, realName: true } },
      },
    });
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/approve", requireRole(UserRole.GENERAL_MANAGER, UserRole.ADMIN), async (req, res, next) => {
  try {
    const requestId = toBigIntId(String(req.params.id));
    const { reviewNote } = z.object({ reviewNote: z.string().optional() }).parse(req.body);

    const deleteReq = await prisma.deleteRequest.findUnique({ where: { id: requestId } });
    if (!deleteReq) {
      res.status(404).json({ message: "审批申请不存在" });
      return;
    }
    if (deleteReq.status !== "PENDING") {
      res.status(400).json({ message: "该申请已处理" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      if (deleteReq.targetType === "recovery") {
        const recoveryId = deleteReq.targetId;
        const record = await tx.recoveryRecord.findUnique({
          where: { id: recoveryId },
          include: { batchAllocations: true },
        });
        if (!record) throw new Error("回收记录已不存在");

        const qty = toNumber(record.qty);
        const targetBucket =
          record.recoveryStatus === RecoveryStatus.REUSABLE || record.recoveryStatus === RecoveryStatus.ROUGHING_REUSABLE
            ? InventoryBucket.AVAILABLE
            : record.recoveryStatus === RecoveryStatus.PENDING_INSPECTION || record.recoveryStatus === RecoveryStatus.REPAIRABLE
              ? InventoryBucket.PENDING
              : null;

        // Validate: recovered items must not have been re-used since recovery
        if (targetBucket !== null) {
          for (const alloc of record.batchAllocations) {
            const allocQty = toNumber(alloc.qty);
            const stockInItem = await tx.stockInItem.findUnique({
              where: { id: alloc.stockInItemId },
              select: { availableQtyBalance: true, pendingQtyBalance: true },
            });
            if (!stockInItem) continue;
            const balance =
              targetBucket === InventoryBucket.AVAILABLE
                ? toNumber(stockInItem.availableQtyBalance)
                : toNumber(stockInItem.pendingQtyBalance);
            if (balance < allocQty - 0.0001) {
              throw new Error("该回收记录对应的物品回收后已被再次出库，无法撤销。请先撤销后续出库操作。");
            }
          }
        }

        for (const alloc of record.batchAllocations) {
          const allocQty = toNumber(alloc.qty);
          await tx.stockInItem.update({
            where: { id: alloc.stockInItemId },
            data: {
              borrowedQtyBalance: { increment: allocQty },
              ...(targetBucket === InventoryBucket.AVAILABLE ? { availableQtyBalance: { decrement: allocQty } } : {}),
              ...(targetBucket === InventoryBucket.PENDING ? { pendingQtyBalance: { decrement: allocQty } } : {}),
            },
          });
        }
        await tx.recoveryBatchAllocation.deleteMany({ where: { recoveryRecordId: recoveryId } });

        const returnsToAvailable =
          record.recoveryStatus === RecoveryStatus.REUSABLE || record.recoveryStatus === RecoveryStatus.ROUGHING_REUSABLE;
        const goesToPending =
          record.recoveryStatus === RecoveryStatus.PENDING_INSPECTION || record.recoveryStatus === RecoveryStatus.REPAIRABLE;
        await tx.inventory.update({
          where: { itemId_warehouseId: { itemId: record.itemId, warehouseId: record.warehouseId } },
          data: {
            borrowedQty: { increment: qty },
            availableQty: returnsToAvailable ? { decrement: qty } : undefined,
            pendingQty: goesToPending ? { decrement: qty } : undefined,
          },
        });

        await tx.recoveryRecord.delete({ where: { id: recoveryId } });

        await writeOperationLog(tx, req.user?.id, "recovery", "delete_approved", "recovery_records", recoveryId, {
          requestId: requestId.toString(),
        });
      } else if (deleteReq.targetType === "purchase_list") {
        const purchaseListId = deleteReq.targetId;
        const list = await tx.purchaseList.findUnique({
          where: { id: purchaseListId },
          include: {
            items: {
              select: {
                id: true,
                requestItemLinks: {
                  select: { purchaseRequestItem: { select: { purchaseRequestId: true } } },
                },
              },
            },
          },
        });
        if (!list) throw new Error("采购清单已不存在");

        const requestIds = new Set<bigint>();
        for (const item of list.items) {
          for (const link of item.requestItemLinks) {
            requestIds.add(link.purchaseRequestItem.purchaseRequestId);
          }
        }

        await tx.purchaseListItem.updateMany({
          where: { purchaseListId },
          data: { status: "CANCELLED" },
        });
        await tx.purchaseList.update({
          where: { id: purchaseListId },
          data: { status: "CANCELLED" },
        });
        // Remove junction rows so linked PRs can be deleted or re-merged later
        await tx.purchaseListRequestItem.deleteMany({
          where: { purchaseListItemId: { in: list.items.map((item) => item.id) } },
        });
        if (requestIds.size > 0) {
          // MERGED requests go back to PENDING so they can be re-submitted
          await tx.purchaseRequest.updateMany({
            where: { id: { in: Array.from(requestIds) }, status: "MERGED" },
            data: { status: "PENDING" },
          });
          // PURCHASED requests (items fully received before cancellation) become CANCELLED
          await tx.purchaseRequest.updateMany({
            where: { id: { in: Array.from(requestIds) }, status: "PURCHASED" },
            data: { status: "CANCELLED" },
          });
        }

        await writeOperationLog(tx, req.user?.id, "purchase_list", "cancel_approved", "purchase_lists", purchaseListId, {
          requestId: requestId.toString(),
          listNo: list.listNo,
        });
      } else {
        throw new Error(`未知的删除类型: ${deleteReq.targetType}`);
      }

      await tx.deleteRequest.update({
        where: { id: requestId },
        data: {
          status: "APPROVED",
          reviewedBy: req.user!.id,
          reviewedAt: new Date(),
          reviewNote: reviewNote ?? null,
        },
      });
    });

    const responseMessage =
      deleteReq.targetType === "purchase_list"
        ? "已批准，采购清单已取消。请通知采购主管前往「库存盘点」页面手动核对并调整相关物品的库存数量。"
        : "已批准，操作已自动执行";
    res.json({ message: responseMessage });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/reject", requireRole(UserRole.GENERAL_MANAGER, UserRole.ADMIN), async (req, res, next) => {
  try {
    const requestId = toBigIntId(String(req.params.id));
    const { reviewNote } = z.object({ reviewNote: z.string().min(1, "请填写拒绝原因") }).parse(req.body);

    const deleteReq = await prisma.deleteRequest.findUnique({ where: { id: requestId } });
    if (!deleteReq) {
      res.status(404).json({ message: "审批申请不存在" });
      return;
    }
    if (deleteReq.status !== "PENDING") {
      res.status(400).json({ message: "该申请已处理" });
      return;
    }

    await prisma.deleteRequest.update({
      where: { id: requestId },
      data: {
        status: "REJECTED",
        reviewedBy: req.user!.id,
        reviewedAt: new Date(),
        reviewNote,
      },
    });

    res.json({ message: "已拒绝" });
  } catch (error) {
    next(error);
  }
});

export default router;
