import { Router } from "express";
import { z } from "zod";
import { ItemTrackingMode, InventoryBucket, RecoveryStatus } from "../generated/prisma/enums.js";
import { UserRole } from "../generated/prisma/enums.js";
import { applyRecoveryBatchTracking } from "../lib/batchTracking.js";
import { applyRecovery, writeOperationLog } from "../lib/inventory.js";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { toBigIntId, toNumber } from "../lib/serialize.js";

const router = Router();

const recoverySchema = z.object({
  itemId: z.string().min(1),
  relatedStockOutItemId: z.string().optional().nullable(),
  qty: z.coerce.number().int().positive(),
  returnedBy: z.string().min(1).max(50),
  recoveryTime: z.string().datetime().optional(),
  recoveryStatus: z.nativeEnum(RecoveryStatus),
  remark: z.string().optional().nullable(),
});

const dateRangeSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

router.get("/", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const { startDate, endDate } = dateRangeSchema.parse(req.query);
    const data = await prisma.recoveryRecord.findMany({
      where: {
        recoveryTime: {
          ...(startDate ? { gte: new Date(`${startDate}T00:00:00.000`) } : {}),
          ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999`) } : {}),
        },
      },
      orderBy: { recoveryTime: "desc" },
      include: {
        item: true,
        operator: { select: { id: true, realName: true } },
      },
    });
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const data = recoverySchema.parse(req.body);
    const warehouseId = BigInt(1);

    const recovery = await prisma.$transaction(async (tx) => {
      const itemId = toBigIntId(data.itemId);
      const item = await tx.item.findUnique({
        where: { id: itemId },
        select: {
          trackingMode: true,
        },
      });

      if (!item) {
        throw new Error("物品不存在");
      }

      if (item.trackingMode !== ItemTrackingMode.CLOSED_LOOP) {
        throw new Error("消耗品不支持回收");
      }

      if (data.relatedStockOutItemId) {
        const relatedStockOutItemId = toBigIntId(data.relatedStockOutItemId);
        const relatedStockOutItem = await tx.stockOutItem.findUnique({
          where: { id: relatedStockOutItemId },
          select: {
            itemId: true,
            qty: true,
          },
        });

        if (!relatedStockOutItem) {
          throw new Error("关联的出库明细不存在");
        }

        if (relatedStockOutItem.itemId !== itemId) {
          throw new Error("回收物品与关联出库明细不一致");
        }

        const [recoverySum, borrowedLossSum] = await Promise.all([
          tx.recoveryRecord.aggregate({
            where: {
              relatedStockOutItemId,
            },
            _sum: {
              qty: true,
            },
          }),
          tx.lossRecord.aggregate({
            where: {
              relatedStockOutItemId,
              sourceBucket: "BORROWED",
            },
            _sum: {
              qty: true,
            },
          }),
        ]);

        const consumedQty =
          Number(recoverySum._sum.qty ?? 0) +
          Number(borrowedLossSum._sum.qty ?? 0);

        if (consumedQty + data.qty > Number(relatedStockOutItem.qty)) {
          throw new Error("回收数量超过该出库明细的剩余可回收数量");
        }
      }

      const created = await tx.recoveryRecord.create({
        data: {
          itemId,
          warehouseId,
          relatedStockOutItemId: data.relatedStockOutItemId ? toBigIntId(data.relatedStockOutItemId) : null,
          qty: data.qty,
          returnedBy: data.returnedBy,
          operatorId: req.user!.id,
          recoveryTime: data.recoveryTime ? new Date(data.recoveryTime) : new Date(),
          recoveryStatus: data.recoveryStatus,
          remark: data.remark,
        },
      });

      await applyRecoveryBatchTracking(tx, created.id, itemId, data.qty, data.recoveryStatus);
      await applyRecovery(tx, itemId, warehouseId, data.qty, data.recoveryStatus);

      await writeOperationLog(tx, req.user?.id, "recovery", "create", "recovery_records", created.id, {
        itemId: itemId.toString(),
        qty: data.qty,
        recoveryStatus: data.recoveryStatus,
      });

      return created;
    });

    res.status(201).json({ data: recovery });
  } catch (error) {
    next(error);
  }
});

function isSameCalendarMonth(date: Date): boolean {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

router.delete("/:id", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const recoveryId = toBigIntId(String(req.params.id));

    const record = await prisma.recoveryRecord.findUnique({
      where: { id: recoveryId },
      include: {
        item: { select: { name: true, itemCode: true } },
        batchAllocations: true,
      },
    });

    if (!record) {
      res.status(404).json({ message: "回收记录不存在" });
      return;
    }

    // Check for existing pending delete request
    const existing = await prisma.deleteRequest.findFirst({
      where: { targetType: "recovery", targetId: recoveryId, status: "PENDING" },
    });
    if (existing) {
      res.status(409).json({ message: "已有待审批的删除申请，请等待总经理审批" });
      return;
    }

    if (isSameCalendarMonth(record.recoveryTime)) {
      // Same month: delete directly with full reversal
      await prisma.$transaction(async (tx) => {
        const qty = toNumber(record.qty);
        const targetBucket =
          record.recoveryStatus === RecoveryStatus.REUSABLE || record.recoveryStatus === RecoveryStatus.ROUGHING_REUSABLE
            ? InventoryBucket.AVAILABLE
            : record.recoveryStatus === RecoveryStatus.PENDING_INSPECTION || record.recoveryStatus === RecoveryStatus.REPAIRABLE
              ? InventoryBucket.PENDING
              : null;

        // Validate: if the recovered items were moved into available/pending,
        // ensure they haven't since been stocked out/consumed (which would reduce the balance below what we need to reverse)
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
              throw new Error("该回收记录对应的物品回收后已被再次出库，无法撤销回收记录。请先撤销后续出库操作。");
            }
          }
        }

        // Reverse batch tracking allocations
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

        // Reverse inventory
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

        await writeOperationLog(tx, req.user?.id, "recovery", "delete", "recovery_records", recoveryId, {
          itemCode: record.item.itemCode,
          itemName: record.item.name,
          qty,
          recoveryStatus: record.recoveryStatus,
        });
      });

      res.json({ message: "回收记录已删除" });
    } else {
      // Cross-month: create a delete request for GM approval
      const qty = toNumber(record.qty);
      await prisma.deleteRequest.create({
        data: {
          targetType: "recovery",
          targetId: recoveryId,
          targetDesc: {
            itemCode: record.item.itemCode,
            itemName: record.item.name,
            qty,
            recoveryStatus: record.recoveryStatus,
            recoveryTime: record.recoveryTime.toISOString(),
          },
          requestedBy: req.user!.id,
        },
      });

      res.json({ message: "跨月删除申请已提交，请等待总经理审批后自动执行" });
    }
  } catch (error) {
    next(error);
  }
});

router.get("/my", async (req, res, next) => {
  try {
    const data = await prisma.recoveryRecord.findMany({
      take: 200,
      where: { returnedBy: req.user!.realName },
      orderBy: { recoveryTime: "desc" },
      include: {
        item: { select: { id: true, itemCode: true, name: true, specification: true, unit: true } },
      },
    });
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

export default router;
