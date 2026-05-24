import { Router } from "express";
import { z } from "zod";
import { ItemTrackingMode, RecoveryStatus } from "../generated/prisma/enums.js";
import { UserRole } from "../generated/prisma/enums.js";
import { applyRecoveryBatchTracking } from "../lib/batchTracking.js";
import { applyRecovery, writeOperationLog } from "../lib/inventory.js";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { toBigIntId } from "../lib/serialize.js";

const router = Router();

const recoverySchema = z.object({
  itemId: z.string().min(1),
  relatedStockOutItemId: z.string().optional().nullable(),
  qty: z.coerce.number().positive(),
  returnedBy: z.string().min(1).max(50),
  recoveryTime: z.string().datetime().optional(),
  recoveryStatus: z.nativeEnum(RecoveryStatus),
  remark: z.string().optional().nullable(),
});

router.get("/", requireRole(UserRole.PROCUREMENT_MANAGER), async (_req, res, next) => {
  try {
    const data = await prisma.recoveryRecord.findMany({
      take: 100,
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

export default router;
