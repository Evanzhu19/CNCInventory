import { Router } from "express";
import { z } from "zod";
import { UserRole } from "../generated/prisma/enums.js";
import { applyStockOutBatchTracking } from "../lib/batchTracking.js";
import { applyStockOut, writeOperationLog } from "../lib/inventory.js";
import { prisma } from "../lib/prisma.js";
import { addDuplicateLineIssue, findDuplicateIndexes } from "../lib/requestGuards.js";
import { requireRole } from "../middleware/auth.js";
import { toBigIntId, toNumber } from "../lib/serialize.js";

const router = Router();

const stockOutSchema = z.object({
  receiverId: z.string().optional().nullable(),
  receiverName: z.string().min(1).max(50),
  department: z.string().max(50).optional().nullable(),
  purpose: z.string().max(200).optional().nullable(),
  outTime: z.string().datetime().optional(),
  remark: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        itemId: z.string().min(1),
        qty: z.coerce.number().int().positive(),
      }),
    )
    .min(1),
}).superRefine((data, ctx) => {
  for (const index of findDuplicateIndexes(data.items.map((item) => item.itemId))) {
    addDuplicateLineIssue(ctx, ["items", index, "itemId"], "同一物品不能在同一张出库单里重复出现");
  }
});

router.get("/my", async (req, res, next) => {
  try {
    const data = await prisma.stockOut.findMany({
      take: 200,
      where: { receiverId: req.user!.id },
      orderBy: { outTime: "desc" },
      include: {
        items: { include: { item: { select: { id: true, itemCode: true, name: true, specification: true, unit: true } } } },
      },
    });
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

const dateRangeSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

router.get("/", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const { startDate, endDate } = dateRangeSchema.parse(req.query);
    const data = await prisma.stockOut.findMany({
      where: {
        outTime: {
          ...(startDate ? { gte: new Date(`${startDate}T00:00:00.000`) } : {}),
          ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999`) } : {}),
        },
      },
      orderBy: { outTime: "desc" },
      include: {
        operator: { select: { id: true, realName: true } },
        receiver: { select: { id: true, realName: true } },
        items: { include: { item: true } },
      },
    });

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const data = stockOutSchema.parse(req.body);
    const warehouseId = BigInt(1);
    const outNo = `OUT-${Date.now()}`;

    const stockOut = await prisma.$transaction(async (tx) => {
      const itemQueues = new Map<string, Array<{ itemId: bigint; qty: number; trackingMode: import("../generated/prisma/enums.js").ItemTrackingMode }>>();

      for (const item of data.items) {
        const dbItem = await tx.item.findUnique({
          where: { id: toBigIntId(item.itemId) },
          select: { id: true, trackingMode: true },
        });
        if (!dbItem) {
          throw new Error("物品不存在");
        }
        const queue = itemQueues.get(item.itemId) ?? [];
        queue.push({
          itemId: dbItem.id,
          qty: item.qty,
          trackingMode: dbItem.trackingMode,
        });
        itemQueues.set(item.itemId, queue);
        await applyStockOut(tx, dbItem.id, warehouseId, item.qty, dbItem.trackingMode);
      }

      const created = await tx.stockOut.create({
        data: {
          outNo,
          warehouseId,
          receiverId: data.receiverId ? toBigIntId(data.receiverId) : null,
          receiverName: data.receiverName,
          department: data.department,
          purpose: data.purpose,
          operatorId: req.user!.id,
          outTime: data.outTime ? new Date(data.outTime) : new Date(),
          remark: data.remark,
          items: {
            create: data.items.map((item) => ({
              itemId: toBigIntId(item.itemId),
              qty: item.qty,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      const createdItems = await tx.stockOutItem.findMany({
        where: { stockOutId: created.id },
        orderBy: { id: "asc" },
      });

      for (const createdItem of createdItems) {
        const queue = itemQueues.get(createdItem.itemId.toString());
        const current = queue?.shift();

        if (!current) {
          throw new Error("批次分配失败：出库明细与输入数据不匹配");
        }

        await applyStockOutBatchTracking(tx, createdItem.id, current.itemId, current.qty, current.trackingMode);
      }

      await writeOperationLog(tx, req.user?.id, "stock_out", "create", "stock_out", created.id, {
        outNo,
        receiverName: data.receiverName,
        itemCount: data.items.length,
      });

      return created;
    });

    res.status(201).json({ data: stockOut });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const stockOutId = toBigIntId(String(req.params.id));
    const warehouseId = BigInt(1);

    await prisma.$transaction(async (tx) => {
      const stockOut = await tx.stockOut.findUnique({
        where: { id: stockOutId },
        include: {
          items: {
            include: {
              item: { select: { trackingMode: true } },
              batchAllocations: true,
            },
          },
        },
      });

      if (!stockOut) {
        throw new Error("出库单不存在");
      }

      // Validate CLOSED_LOOP items: check borrowedQtyBalance still covers the full allocation
      // (if items were recovered after stock-out, borrowedQtyBalance is reduced and we can't safely reverse)
      for (const outItem of stockOut.items) {
        if (outItem.item.trackingMode !== "CLOSED_LOOP") continue;
        for (const allocation of outItem.batchAllocations) {
          const stockInItem = await tx.stockInItem.findUnique({
            where: { id: allocation.stockInItemId },
            select: { borrowedQtyBalance: true },
          });
          if (!stockInItem || toNumber(stockInItem.borrowedQtyBalance) < toNumber(allocation.qty) - 0.0001) {
            throw new Error("该出库单中的物品已有回收或损耗记录，无法直接删除。请先删除相关回收/损耗记录。");
          }
        }
      }

      for (const outItem of stockOut.items) {
        const qty = toNumber(outItem.qty);
        const trackingMode = outItem.item.trackingMode;

        // Restore batch balances on stock-in items
        for (const allocation of outItem.batchAllocations) {
          await tx.stockInItem.update({
            where: { id: allocation.stockInItemId },
            data: {
              availableQtyBalance: { increment: toNumber(allocation.qty) },
              ...(trackingMode === "CLOSED_LOOP"
                ? { borrowedQtyBalance: { decrement: toNumber(allocation.qty) } }
                : {}),
            },
          });
        }

        // Restore inventory totals
        await tx.inventory.update({
          where: { itemId_warehouseId: { itemId: outItem.itemId, warehouseId } },
          data: {
            availableQty: { increment: qty },
            ...(trackingMode === "CLOSED_LOOP" ? { borrowedQty: { decrement: qty } } : {}),
          },
        });
      }

      await tx.stockOutItemBatchAllocation.deleteMany({
        where: { stockOutItem: { stockOutId } },
      });
      await tx.stockOutItem.deleteMany({ where: { stockOutId } });
      await tx.stockOut.delete({ where: { id: stockOutId } });

      await writeOperationLog(tx, req.user?.id, "stock_out", "delete", "stock_out", stockOutId, {
        outNo: stockOut.outNo,
      });
    });

    res.json({ message: "出库单已删除" });
  } catch (error) {
    next(error);
  }
});

export default router;
