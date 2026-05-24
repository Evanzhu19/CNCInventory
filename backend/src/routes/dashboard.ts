import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { toNumber } from "../lib/serialize.js";

const router = Router();

router.get("/summary", async (_req, res, next) => {
  try {
    const [
      itemCount,
      inventorySum,
      pendingPurchaseRequests,
      pendingRecoveries,
      recentStockIns,
      recentStockOuts,
      lowStockCountRows,
      lowStockIdRows,
    ] = await Promise.all([
      prisma.item.count({ where: { status: 1 } }),
      prisma.inventory.aggregate({
        _sum: {
          availableQty: true,
          borrowedQty: true,
          pendingQty: true,
        },
      }),
      prisma.purchaseRequest.count({ where: { status: "PENDING" } }),
      prisma.recoveryRecord.count({ where: { recoveryStatus: { in: ["PENDING_INSPECTION", "REPAIRABLE"] } } }),
      prisma.stockIn.findMany({
        take: 5,
        orderBy: { inTime: "desc" },
        include: { supplier: true, operator: { select: { realName: true } } },
      }),
      prisma.stockOut.findMany({
        take: 5,
        orderBy: { outTime: "desc" },
        include: { operator: { select: { realName: true } } },
      }),
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count
        FROM inventory inv
        INNER JOIN items item ON item.id = inv.item_id
        WHERE item.status = 1
          AND inv.available_qty < item.safe_stock
      `,
      prisma.$queryRaw<Array<{ id: bigint }>>`
        SELECT inv.id
        FROM inventory inv
        INNER JOIN items item ON item.id = inv.item_id
        WHERE item.status = 1
          AND inv.available_qty < item.safe_stock
        ORDER BY inv.updated_at DESC
        LIMIT 10
      `,
    ]);

    const lowStockIds = lowStockIdRows.map((row) => row.id);
    const lowStockRows = lowStockIds.length
      ? await prisma.inventory.findMany({
          where: {
            id: {
              in: lowStockIds,
            },
          },
          include: {
            item: {
              include: {
                category: true,
              },
            },
          },
        })
      : [];
    const lowStockMap = new Map(lowStockRows.map((row) => [row.id.toString(), row]));
    const lowStock = lowStockIds
      .map((id) => lowStockMap.get(id.toString()))
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .map((row) => ({
        ...row,
        status:
          toNumber(row.availableQty) <= 0
            ? "out_of_stock"
            : toNumber(row.availableQty) < toNumber(row.item.safeStock)
              ? "low_stock"
              : "normal",
      }));

    res.json({
      itemCount,
      availableQty: inventorySum._sum.availableQty ?? 0,
      borrowedQty: inventorySum._sum.borrowedQty ?? 0,
      pendingQty: inventorySum._sum.pendingQty ?? 0,
      pendingPurchaseRequests,
      pendingRecoveries,
      lowStockCount: Number(lowStockCountRows[0]?.count ?? 0),
      lowStock,
      recentStockIns,
      recentStockOuts,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
