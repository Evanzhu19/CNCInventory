import { Router } from "express";
import { UserRole } from "../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";
import { toNumber } from "../lib/serialize.js";

const router = Router();

router.get("/summary", async (req, res, next) => {
  try {
    const isCncSupervisor = req.user?.role === UserRole.CNC_SUPERVISOR;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    if (isCncSupervisor) {
      // CNC主管：以"我"为中心的视图
      const [myRequestsByStatus, myRecentRequests, borrowedQty] = await Promise.all([
        prisma.purchaseRequest.groupBy({
          by: ["status"],
          where: { requesterId: req.user!.id },
          _count: { _all: true },
        }),
        prisma.purchaseRequest.findMany({
          take: 8,
          where: { requesterId: req.user!.id },
          orderBy: { requestTime: "desc" },
          select: {
            id: true,
            requestNo: true,
            status: true,
            priority: true,
            requestTime: true,
            items: {
              select: {
                requestedName: true,
                requestedQty: true,
                requestedSpecification: true,
                purchaseListLinks: {
                  take: 1,
                  select: {
                    purchaseListItem: {
                      select: {
                        purchaseList: {
                          select: { status: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
        prisma.inventory.aggregate({ _sum: { borrowedQty: true } }),
      ]);

      const statusCount = Object.fromEntries(
        myRequestsByStatus.map((r) => [r.status, r._count._all]),
      );

      return res.json({
        role: "CNC_SUPERVISOR",
        myRequestsPending: statusCount["PENDING"] ?? 0,
        myRequestsMerged: statusCount["MERGED"] ?? 0,
        myRequestsPurchased: statusCount["PURCHASED"] ?? 0,
        myRequestsCancelled: statusCount["CANCELLED"] ?? 0,
        borrowedQty: borrowedQty._sum.borrowedQty ?? 0,
        myRecentRequests,
      });
    }

    // 采购主管 / 总经理 / 管理员：管理视图
    const [
      itemCount,
      inventorySum,
      pendingPurchaseRequests,
      pendingRecoveries,
      activePurchaseLists,
      monthlyAmount,
      recentStockIns,
      recentStockOuts,
      lowStockCountRows,
      lowStockIdRows,
    ] = await Promise.all([
      prisma.item.count({ where: { status: 1 } }),
      prisma.inventory.aggregate({
        _sum: { borrowedQty: true },
      }),
      prisma.purchaseRequest.count({ where: { status: "PENDING" } }),
      prisma.recoveryRecord.count({
        where: { recoveryStatus: { in: ["PENDING_INSPECTION", "REPAIRABLE"] } },
      }),
      prisma.purchaseList.count({
        where: { status: { in: ["PENDING", "PURCHASING"] } },
      }),
      prisma.stockIn.aggregate({
        _sum: { totalAmount: true },
        where: { inTime: { gte: monthStart, lt: monthEnd } },
      }),
      prisma.stockIn.findMany({
        take: 5,
        orderBy: { inTime: "desc" },
        select: {
          id: true,
          inNo: true,
          inTime: true,
          totalAmount: true,
          supplier: { select: { name: true } },
        },
      }),
      prisma.stockOut.findMany({
        take: 5,
        orderBy: { outTime: "desc" },
        select: { id: true, outNo: true, outTime: true, receiverName: true },
      }),
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count
        FROM inventory inv
        INNER JOIN items item ON item.id = inv.item_id
        WHERE item.status = 1 AND inv.available_qty < item.safe_stock
      `,
      prisma.$queryRaw<Array<{ id: bigint }>>`
        SELECT inv.id
        FROM inventory inv
        INNER JOIN items item ON item.id = inv.item_id
        WHERE item.status = 1 AND inv.available_qty < item.safe_stock
        ORDER BY inv.available_qty ASC
        LIMIT 10
      `,
    ]);

    const lowStockIds = lowStockIdRows.map((row) => row.id);
    const lowStockRows = lowStockIds.length
      ? await prisma.inventory.findMany({
          where: { id: { in: lowStockIds } },
          include: { item: { include: { category: true } } },
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
      role: req.user?.role,
      itemCount,
      borrowedQty: inventorySum._sum.borrowedQty ?? 0,
      pendingPurchaseRequests,
      pendingRecoveries,
      activePurchaseLists,
      monthlyPurchaseAmount: monthlyAmount._sum.totalAmount ?? 0,
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
