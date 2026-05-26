import { Router } from "express";
import { z } from "zod";
import { InventoryBucket, LossType } from "../generated/prisma/enums.js";
import { UserRole } from "../generated/prisma/enums.js";
import { applyLossBatchTracking } from "../lib/batchTracking.js";
import { applyLoss, writeOperationLog } from "../lib/inventory.js";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { toBigIntId } from "../lib/serialize.js";

const router = Router();

const lossSchema = z.object({
  itemId: z.string().min(1),
  qty: z.coerce.number().int().positive(),
  lossType: z.nativeEnum(LossType),
  sourceBucket: z.nativeEnum(InventoryBucket),
  relatedStockOutItemId: z.string().optional().nullable(),
  relatedRecoveryId: z.string().optional().nullable(),
  responsiblePerson: z.string().max(50).optional().nullable(),
  recordTime: z.string().datetime().optional(),
  remark: z.string().optional().nullable(),
});

const dateRangeSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

router.get("/", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const { startDate, endDate } = dateRangeSchema.parse(req.query);
    const data = await prisma.lossRecord.findMany({
      where: {
        recordTime: {
          ...(startDate ? { gte: new Date(`${startDate}T00:00:00.000`) } : {}),
          ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999`) } : {}),
        },
      },
      orderBy: { recordTime: "desc" },
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
    const data = lossSchema.parse(req.body);
    const warehouseId = BigInt(1);

    const loss = await prisma.$transaction(async (tx) => {
      const itemId = toBigIntId(data.itemId);
      const relatedStockOutItemId = data.relatedStockOutItemId ? toBigIntId(data.relatedStockOutItemId) : null;
      const relatedRecoveryId = data.relatedRecoveryId ? toBigIntId(data.relatedRecoveryId) : null;

      if (relatedStockOutItemId) {
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
          throw new Error("损耗物品与关联出库明细不一致");
        }

        if (data.sourceBucket === InventoryBucket.BORROWED) {
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
                sourceBucket: InventoryBucket.BORROWED,
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
            throw new Error("损耗数量超过该出库明细的剩余可处理数量");
          }
        }
      }

      if (relatedRecoveryId) {
        const relatedRecovery = await tx.recoveryRecord.findUnique({
          where: { id: relatedRecoveryId },
          select: {
            itemId: true,
            qty: true,
          },
        });

        if (!relatedRecovery) {
          throw new Error("关联的回收记录不存在");
        }

        if (relatedRecovery.itemId !== itemId) {
          throw new Error("损耗物品与关联回收记录不一致");
        }

        if (data.sourceBucket === InventoryBucket.PENDING) {
          const pendingLossSum = await tx.lossRecord.aggregate({
            where: {
              relatedRecoveryId,
              sourceBucket: InventoryBucket.PENDING,
            },
            _sum: {
              qty: true,
            },
          });

          if (Number(pendingLossSum._sum.qty ?? 0) + data.qty > Number(relatedRecovery.qty)) {
            throw new Error("损耗数量超过该回收记录的剩余待处理数量");
          }
        }
      }

      const created = await tx.lossRecord.create({
        data: {
          itemId,
          warehouseId,
          qty: data.qty,
          lossType: data.lossType,
          sourceBucket: data.sourceBucket,
          relatedStockOutItemId,
          relatedRecoveryId,
          responsiblePerson: data.responsiblePerson,
          operatorId: req.user!.id,
          recordTime: data.recordTime ? new Date(data.recordTime) : new Date(),
          remark: data.remark,
        },
      });

      await applyLossBatchTracking(tx, created.id, itemId, data.qty, data.sourceBucket);
      await applyLoss(tx, itemId, warehouseId, data.qty, data.sourceBucket);

      await writeOperationLog(tx, req.user?.id, "loss", "create", "loss_records", created.id, {
        itemId: itemId.toString(),
        qty: data.qty,
        lossType: data.lossType,
        sourceBucket: data.sourceBucket,
      });

      return created;
    });

    res.status(201).json({ data: loss });
  } catch (error) {
    next(error);
  }
});

export default router;
