import { Router } from "express";
import { z } from "zod";
import { StockCountStatus, UserRole } from "../generated/prisma/enums.js";
import { writeOperationLog } from "../lib/inventory.js";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { toBigIntId, toNumber } from "../lib/serialize.js";

const router = Router();

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

router.get("/", requireRole(UserRole.PROCUREMENT_MANAGER), async (_req, res, next) => {
  try {
    const data = await prisma.stockCount.findMany({
      take: 50,
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

router.get("/:id", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
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
    res.json({ data: stockCount });
  } catch (error) {
    next(error);
  }
});

// Create a new stock count, pre-filled with current inventory snapshot
router.post("/", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
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

router.patch("/:id", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const id = toBigIntId(String(req.params.id));
    const body = z.object({ items: z.array(updateItemSchema) }).parse(req.body);

    const stockCount = await prisma.$transaction(async (tx) => {
      const existing = await tx.stockCount.findUnique({ where: { id }, select: { status: true } });
      if (!existing) throw new Error("盘点单不存在");
      if (existing.status !== StockCountStatus.DRAFT) throw new Error("只能修改草稿状态的盘点单");

      for (const item of body.items) {
        const itemId = toBigIntId(item.id);
        const systemRow = await tx.stockCountItem.findUnique({ where: { id: itemId }, select: { systemAvailableQty: true, systemBorrowedQty: true, systemPendingQty: true } });
        if (!systemRow) throw new Error("盘点明细不存在");

        await tx.stockCountItem.update({
          where: { id: itemId },
          data: {
            actualAvailableQty: item.actualAvailableQty,
            actualBorrowedQty: item.actualBorrowedQty,
            actualPendingQty: item.actualPendingQty,
            availableDiffQty: item.actualAvailableQty - toNumber(systemRow.systemAvailableQty),
            borrowedDiffQty: item.actualBorrowedQty - toNumber(systemRow.systemBorrowedQty),
            pendingDiffQty: item.actualPendingQty - toNumber(systemRow.systemPendingQty),
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

// Confirm: apply actual qty differences to inventory
router.post("/:id/confirm", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const id = toBigIntId(String(req.params.id));
    const warehouseId = BigInt(1);

    await prisma.$transaction(async (tx) => {
      const stockCount = await tx.stockCount.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!stockCount) throw new Error("盘点单不存在");
      if (stockCount.status !== StockCountStatus.DRAFT) throw new Error("只能确认草稿状态的盘点单");

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
        itemsWithDiff: stockCount.items.filter(
          (i) => toNumber(i.availableDiffQty) !== 0 || toNumber(i.borrowedDiffQty) !== 0,
        ).length,
      });
    });

    res.json({ message: "盘点已确认，库存已调整" });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/void", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const id = toBigIntId(String(req.params.id));
    await prisma.$transaction(async (tx) => {
      const existing = await tx.stockCount.findUnique({ where: { id }, select: { status: true, countNo: true } });
      if (!existing) throw new Error("盘点单不存在");
      if (existing.status === StockCountStatus.CONFIRMED) throw new Error("已确认的盘点单不能作废");

      await tx.stockCount.update({ where: { id }, data: { status: StockCountStatus.VOIDED } });
      await writeOperationLog(tx, req.user?.id, "stock_count", "void", "stock_counts", id, { countNo: existing.countNo });
    });
    res.json({ message: "盘点单已作废" });
  } catch (error) {
    next(error);
  }
});

export default router;
