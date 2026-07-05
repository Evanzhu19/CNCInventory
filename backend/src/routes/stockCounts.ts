import { Router } from "express";
import { z } from "zod";
import { StockCountStatus, StockInType, UserRole } from "../generated/prisma/enums.js";
import { applyStockOutBatchTracking } from "../lib/batchTracking.js";
import { applyStockIn, applyStockOut, writeOperationLog } from "../lib/inventory.js";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { toBigIntId, toNumber } from "../lib/serialize.js";

const router = Router();

const countRoles = [UserRole.PROCUREMENT_MANAGER, UserRole.CNC_SUPERVISOR] as const;

function isCncSupervisorUser(role: UserRole | undefined) {
  return role === UserRole.CNC_SUPERVISOR;
}

const stockCountItemInclude = {
  item: {
    select: {
      id: true,
      itemCode: true,
      name: true,
      specification: true,
      unit: true,
      category: { select: { name: true } },
    },
  },
};

router.get("/", requireRole(...countRoles), async (req, res, next) => {
  try {
    const data = await prisma.stockCount.findMany({
      take: 50,
      where: isCncSupervisorUser(req.user?.role) ? { createdById: req.user!.id } : {},
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { id: true, realName: true } },
        approvedBy: { select: { id: true, realName: true } },
        _count: { select: { items: true } },
      },
    });
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", requireRole(...countRoles), async (req, res, next) => {
  try {
    const id = toBigIntId(String(req.params.id));
    const stockCount = await prisma.stockCount.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, realName: true } },
        approvedBy: { select: { id: true, realName: true } },
        items: { include: stockCountItemInclude, orderBy: { id: "asc" } },
      },
    });
    if (!stockCount) {
      res.status(404).json({ message: "盘点单不存在" });
      return;
    }
    if (isCncSupervisorUser(req.user?.role) && stockCount.createdBy.id !== req.user!.id) {
      res.status(403).json({ message: "只能查看自己创建的盘点单" });
      return;
    }
    res.json({ data: stockCount });
  } catch (error) {
    next(error);
  }
});

// Create a new stock count, pre-filled with current inventory snapshot
router.post("/", requireRole(...countRoles), async (req, res, next) => {
  try {
    const body = z.object({
      itemIds: z.array(z.string()).min(1).optional(),
    }).parse(req.body);

    const warehouseId = BigInt(1);
    const countNo = `CNT-${Date.now()}`;

    const stockCount = await prisma.$transaction(async (tx) => {
      const inventoryRows = await tx.inventory.findMany({
        where: {
          warehouseId,
          ...(body.itemIds?.length ? { itemId: { in: body.itemIds.map(toBigIntId) } } : {}),
        },
        include: { item: { select: { id: true, status: true } } },
      });

      const activeRows = inventoryRows.filter((row) => row.item.status === 1);

      const created = await tx.stockCount.create({
        data: {
          countNo,
          warehouseId,
          countTime: new Date(),
          createdById: req.user!.id,
          status: StockCountStatus.DRAFT,
          items: {
            create: activeRows.map((row) => ({
              itemId: row.itemId,
              systemAvailableQty: row.availableQty,
              systemBorrowedQty: row.borrowedQty,
              systemPendingQty: row.pendingQty,
              actualAvailableQty: row.availableQty,
              actualBorrowedQty: row.borrowedQty,
              actualPendingQty: row.pendingQty,
              availableDiffQty: 0,
              borrowedDiffQty: 0,
              pendingDiffQty: 0,
            })),
          },
        },
        include: {
          createdBy: { select: { id: true, realName: true } },
          items: { include: stockCountItemInclude },
        },
      });

      await writeOperationLog(tx, req.user?.id, "stock_count", "create", "stock_counts", created.id, {
        countNo,
        itemCount: activeRows.length,
      });

      return created;
    });

    res.status(201).json({ data: stockCount });
  } catch (error) {
    next(error);
  }
});

const updateItemSchema = z.object({
  id: z.string(),
  actualAvailableQty: z.coerce.number().int().min(0),
  actualBorrowedQty: z.coerce.number().int().min(0),
  actualPendingQty: z.coerce.number().int().min(0),
  explanation: z.string().optional().nullable(),
});

router.patch("/:id", requireRole(...countRoles), async (req, res, next) => {
  try {
    const id = toBigIntId(String(req.params.id));
    const body = z.object({ items: z.array(updateItemSchema) }).parse(req.body);
    const cncMode = isCncSupervisorUser(req.user?.role);

    const stockCount = await prisma.$transaction(async (tx) => {
      const existing = await tx.stockCount.findUnique({ where: { id }, select: { status: true, createdById: true } });
      if (!existing) throw new Error("盘点单不存在");
      if (existing.status !== StockCountStatus.DRAFT) throw new Error("只能修改草稿状态的盘点单");
      if (cncMode && existing.createdById !== req.user!.id) throw new Error("只能修改自己创建的盘点单");

      for (const item of body.items) {
        const itemId = toBigIntId(item.id);
        const systemRow = await tx.stockCountItem.findUnique({ where: { id: itemId }, select: { systemAvailableQty: true, systemBorrowedQty: true, systemPendingQty: true } });
        if (!systemRow) throw new Error("盘点明细不存在");

        // CNC主管盘点只允许调整可用数量，在外/待处理保持系统值
        const actualBorrowedQty = cncMode ? toNumber(systemRow.systemBorrowedQty) : item.actualBorrowedQty;
        const actualPendingQty = cncMode ? toNumber(systemRow.systemPendingQty) : item.actualPendingQty;

        await tx.stockCountItem.update({
          where: { id: itemId },
          data: {
            actualAvailableQty: item.actualAvailableQty,
            actualBorrowedQty,
            actualPendingQty,
            availableDiffQty: item.actualAvailableQty - toNumber(systemRow.systemAvailableQty),
            borrowedDiffQty: actualBorrowedQty - toNumber(systemRow.systemBorrowedQty),
            pendingDiffQty: actualPendingQty - toNumber(systemRow.systemPendingQty),
            explanation: item.explanation ?? null,
          },
        });
      }

      return tx.stockCount.findUnique({
        where: { id },
        include: {
          createdBy: { select: { id: true, realName: true } },
          items: { include: stockCountItemInclude, orderBy: { id: "asc" } },
        },
      });
    });

    res.json({ data: stockCount });
  } catch (error) {
    next(error);
  }
});

// Confirm: apply actual qty differences to inventory.
// 采购主管的盘点单：直接调整库存数字。
// CNC主管创建的盘点单：盘盈生成入库单（调整入库），盘亏生成出库单，全部走出入库流水。
router.post("/:id/confirm", requireRole(...countRoles), async (req, res, next) => {
  try {
    const id = toBigIntId(String(req.params.id));
    const warehouseId = BigInt(1);

    const resultMessage = await prisma.$transaction(async (tx) => {
      const stockCount = await tx.stockCount.findUnique({
        where: { id },
        include: {
          createdBy: { select: { id: true, realName: true, role: true } },
          items: { include: { item: { select: { trackingMode: true, name: true } } } },
        },
      });
      if (!stockCount) throw new Error("盘点单不存在");
      if (stockCount.status !== StockCountStatus.DRAFT) throw new Error("只能确认草稿状态的盘点单");
      if (isCncSupervisorUser(req.user?.role) && stockCount.createdBy.id !== req.user!.id) {
        throw new Error("只能确认自己创建的盘点单");
      }

      const cncCount = stockCount.createdBy.role === UserRole.CNC_SUPERVISOR;
      let message = "盘点已确认，库存已调整";

      if (cncCount) {
        const hasBucketDiff = stockCount.items.some(
          (item) => toNumber(item.borrowedDiffQty) !== 0 || toNumber(item.pendingDiffQty) !== 0,
        );
        if (hasBucketDiff) throw new Error("CNC主管的盘点单只能调整可用数量，请检查在外/待处理差异");

        const gains = stockCount.items.filter((item) => toNumber(item.availableDiffQty) > 0);
        const losses = stockCount.items.filter((item) => toNumber(item.availableDiffQty) < 0);

        if (gains.length > 0) {
          const inNo = `CNT-IN-${Date.now()}`;
          await tx.stockIn.create({
            data: {
              inNo,
              inType: StockInType.ADJUSTMENT,
              warehouseId,
              operatorId: req.user!.id,
              inTime: new Date(),
              totalAmount: 0,
              remark: `盘点盘盈：${stockCount.countNo}`,
              items: {
                create: gains.map((item) => ({
                  itemId: item.itemId,
                  qty: toNumber(item.availableDiffQty),
                  availableQtyBalance: toNumber(item.availableDiffQty),
                  unitPrice: 0,
                  totalPrice: 0,
                  remark: item.explanation ?? `盘点盘盈：${stockCount.countNo}`,
                })),
              },
            },
          });
          for (const item of gains) {
            await applyStockIn(tx, item.itemId, warehouseId, toNumber(item.availableDiffQty));
          }
        }

        if (losses.length > 0) {
          const outNo = `CNT-OUT-${Date.now()}`;
          const stockOut = await tx.stockOut.create({
            data: {
              outNo,
              warehouseId,
              receiverId: stockCount.createdBy.id,
              receiverName: stockCount.createdBy.realName,
              purpose: `盘点盘亏：${stockCount.countNo}`,
              operatorId: req.user!.id,
              outTime: new Date(),
              remark: `盘点单 ${stockCount.countNo} 差异出库`,
              items: {
                create: losses.map((item) => ({
                  itemId: item.itemId,
                  qty: Math.abs(toNumber(item.availableDiffQty)),
                })),
              },
            },
            include: { items: { orderBy: { id: "asc" } } },
          });

          for (const outItem of stockOut.items) {
            const countItem = losses.find((item) => item.itemId === outItem.itemId);
            if (!countItem) throw new Error("盘点差异出库明细不匹配");
            const qty = Math.abs(toNumber(countItem.availableDiffQty));
            await applyStockOut(tx, outItem.itemId, warehouseId, qty, countItem.item.trackingMode);
            await applyStockOutBatchTracking(tx, outItem.id, outItem.itemId, qty, countItem.item.trackingMode);
          }
        }

        message =
          gains.length > 0 || losses.length > 0
            ? "盘点已确认，差异已生成出入库单"
            : "盘点已确认，无差异";
      } else {
        for (const item of stockCount.items) {
          const hasDiff =
            toNumber(item.availableDiffQty) !== 0 ||
            toNumber(item.borrowedDiffQty) !== 0 ||
            toNumber(item.pendingDiffQty) !== 0;

          if (!hasDiff) continue;

          await tx.inventory.update({
            where: { itemId_warehouseId: { itemId: item.itemId, warehouseId } },
            data: {
              availableQty: { increment: toNumber(item.availableDiffQty) },
              borrowedQty: { increment: toNumber(item.borrowedDiffQty) },
              pendingQty: { increment: toNumber(item.pendingDiffQty) },
            },
          });
        }
      }

      await tx.stockCount.update({
        where: { id },
        data: {
          status: StockCountStatus.CONFIRMED,
          approvedById: req.user!.id,
          approvedAt: new Date(),
        },
      });

      await writeOperationLog(tx, req.user?.id, "stock_count", "confirm", "stock_counts", id, {
        countNo: stockCount.countNo,
        mode: cncCount ? "document" : "direct",
        itemsWithDiff: stockCount.items.filter(
          (i) => toNumber(i.availableDiffQty) !== 0 || toNumber(i.borrowedDiffQty) !== 0,
        ).length,
      });

      return message;
    });

    res.json({ message: resultMessage });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/void", requireRole(...countRoles), async (req, res, next) => {
  try {
    const id = toBigIntId(String(req.params.id));
    await prisma.$transaction(async (tx) => {
      const existing = await tx.stockCount.findUnique({ where: { id }, select: { status: true, countNo: true, createdById: true } });
      if (!existing) throw new Error("盘点单不存在");
      if (existing.status === StockCountStatus.CONFIRMED) throw new Error("已确认的盘点单不能作废");
      if (isCncSupervisorUser(req.user?.role) && existing.createdById !== req.user!.id) {
        throw new Error("只能作废自己创建的盘点单");
      }

      await tx.stockCount.update({ where: { id }, data: { status: StockCountStatus.VOIDED } });
      await writeOperationLog(tx, req.user?.id, "stock_count", "void", "stock_counts", id, { countNo: existing.countNo });
    });
    res.json({ message: "盘点单已作废" });
  } catch (error) {
    next(error);
  }
});

export default router;
