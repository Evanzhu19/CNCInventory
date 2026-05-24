import { Router } from "express";
import { z } from "zod";
import { UserRole } from "../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";
import { toNumber } from "../lib/serialize.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

const baseRangeQuerySchema = z.object({
  range: z.enum(["month", "half_year", "year"]).default("month"),
  anchorMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

const analyticsReportQuerySchema = baseRangeQuerySchema.extend({
  itemPage: z.coerce.number().int().min(1).default(1),
  itemPageSize: z.coerce.number().int().min(1).max(100).default(20),
  sourcePage: z.coerce.number().int().min(1).default(1),
  sourcePageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const analyticsHistoryQuerySchema = baseRangeQuerySchema.extend({
  type: z.enum(["stock_in", "stock_out", "recovery", "loss"]),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

type AnalyticsRange = z.infer<typeof baseRangeQuerySchema>["range"];

type ItemSummary = {
  itemId: string;
  itemCode: string;
  itemName: string;
  specification: string | null;
  stockInQty: number;
  stockInAmount: number;
  stockOutQty: number;
  recoveryQty: number;
  lossQty: number;
  netUsageQty: number;
  lossRate: number;
};

type SourceSummary = {
  supplierName: string | null;
  purchaseChannel: string | null;
  purchasedQty: number;
  purchasedAmount: number;
  attributedUsageQty: number;
  attributedRecoveryQty: number;
  attributedLossQty: number;
  netUsageQty: number;
  lossRate: number;
};

type MonthlySummary = {
  month: string;
  stockInQty: number;
  stockInAmount: number;
  stockOutQty: number;
  recoveryQty: number;
  lossQty: number;
  netUsageQty: number;
};

function parseAnchorMonth(value?: string) {
  if (!value) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  return new Date(year, month - 1, 1);
}

function buildDateRange(range: AnalyticsRange, anchorMonth?: string) {
  const anchor = parseAnchorMonth(anchorMonth);
  const monthSpan = range === "month" ? 1 : range === "half_year" ? 6 : 12;
  const start = new Date(anchor.getFullYear(), anchor.getMonth() - (monthSpan - 1), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);

  return { start, end };
}

function formatMonth(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function listMonths(start: Date, end: Date) {
  const months: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);

  while (cursor < end) {
    months.push(formatMonth(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

function sourceKey(supplierName?: string | null, purchaseChannel?: string | null) {
  return `${supplierName?.trim() ?? ""}::${purchaseChannel?.trim() ?? ""}`;
}

function roundMetric(value: number, precision = 3) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(precision));
}

function paginateArray<T>(rows: T[], page: number, pageSize: number) {
  const total = rows.length;
  const startIndex = (page - 1) * pageSize;
  const data = rows.slice(startIndex, startIndex + pageSize);

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

router.get(
  "/report",
  requireRole(UserRole.PROCUREMENT_MANAGER, UserRole.GENERAL_MANAGER),
  async (req, res, next) => {
    try {
      const query = analyticsReportQuerySchema.parse(req.query);
      const { start, end } = buildDateRange(query.range, query.anchorMonth);
      const startMonth = formatMonth(start);
      const endMonth = formatMonth(new Date(end.getFullYear(), end.getMonth() - 1, 1));
      const monthKeys = listMonths(start, end);

      const [stockInItems, stockOutItems, recoveries, losses, sourceHistory] = await Promise.all([
        prisma.stockInItem.findMany({
          where: {
            stockIn: {
              inTime: {
                gte: start,
                lt: end,
              },
            },
          },
          include: {
            item: {
              select: {
                id: true,
                itemCode: true,
                name: true,
                specification: true,
              },
            },
            supplier: {
              select: {
                name: true,
              },
            },
            stockIn: {
              select: {
                id: true,
                inNo: true,
                inTime: true,
                supplier: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        }),
        prisma.stockOutItem.findMany({
          where: {
            stockOut: {
              outTime: {
                gte: start,
                lt: end,
              },
            },
          },
          include: {
            item: {
              select: {
                id: true,
                itemCode: true,
                name: true,
                specification: true,
              },
            },
            stockOut: {
              select: {
                id: true,
                outNo: true,
                outTime: true,
                receiverName: true,
                department: true,
                purpose: true,
              },
            },
            batchAllocations: {
              include: {
                stockInItem: {
                  include: {
                    supplier: {
                      select: {
                        name: true,
                      },
                    },
                    stockIn: {
                      select: {
                        supplier: {
                          select: {
                            name: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        }),
        prisma.recoveryRecord.findMany({
          where: {
            recoveryTime: {
              gte: start,
              lt: end,
            },
          },
          include: {
            item: {
              select: {
                id: true,
                itemCode: true,
                name: true,
                specification: true,
              },
            },
            operator: {
              select: {
                id: true,
                realName: true,
              },
            },
            batchAllocations: {
              include: {
                stockInItem: {
                  include: {
                    supplier: {
                      select: {
                        name: true,
                      },
                    },
                    stockIn: {
                      select: {
                        supplier: {
                          select: {
                            name: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: [{ recoveryTime: "desc" }, { id: "desc" }],
        }),
        prisma.lossRecord.findMany({
          where: {
            recordTime: {
              gte: start,
              lt: end,
            },
          },
          include: {
            item: {
              select: {
                id: true,
                itemCode: true,
                name: true,
                specification: true,
              },
            },
            operator: {
              select: {
                id: true,
                realName: true,
              },
            },
            batchAllocations: {
              include: {
                stockInItem: {
                  include: {
                    supplier: {
                      select: {
                        name: true,
                      },
                    },
                    stockIn: {
                      select: {
                        supplier: {
                          select: {
                            name: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: [{ recordTime: "desc" }, { id: "desc" }],
        }),
        prisma.stockInItem.findMany({
          where: {
            stockIn: {
              inTime: {
                lt: end,
              },
            },
          },
          include: {
            supplier: {
              select: {
                name: true,
              },
            },
            stockIn: {
              select: {
                inTime: true,
                supplier: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        }),
      ]);

      const monthlyMap = new Map<string, MonthlySummary>(
        monthKeys.map((month) => [
          month,
          {
            month,
            stockInQty: 0,
            stockInAmount: 0,
            stockOutQty: 0,
            recoveryQty: 0,
            lossQty: 0,
            netUsageQty: 0,
          },
        ]),
      );
      const itemMap = new Map<string, ItemSummary>();
      const sourceMap = new Map<string, SourceSummary>();
      const sourceHistoryByItem = new Map<
        string,
        Array<{
          inTime: Date;
          supplierName: string | null;
          purchaseChannel: string | null;
        }>
      >();

      function ensureItemSummary(
        itemId: string,
        itemCode: string,
        itemName: string,
        specification: string | null,
      ) {
        const existing = itemMap.get(itemId);
        if (existing) {
          return existing;
        }

        const created: ItemSummary = {
          itemId,
          itemCode,
          itemName,
          specification,
          stockInQty: 0,
          stockInAmount: 0,
          stockOutQty: 0,
          recoveryQty: 0,
          lossQty: 0,
          netUsageQty: 0,
          lossRate: 0,
        };
        itemMap.set(itemId, created);
        return created;
      }

      function ensureSourceSummary(supplierName: string | null, purchaseChannel: string | null) {
        const key = sourceKey(supplierName, purchaseChannel);
        const existing = sourceMap.get(key);
        if (existing) {
          return existing;
        }

        const created: SourceSummary = {
          supplierName,
          purchaseChannel,
          purchasedQty: 0,
          purchasedAmount: 0,
          attributedUsageQty: 0,
          attributedRecoveryQty: 0,
          attributedLossQty: 0,
          netUsageQty: 0,
          lossRate: 0,
        };
        sourceMap.set(key, created);
        return created;
      }

      function attributeSourceUsage(
        supplierName: string | null,
        purchaseChannel: string | null,
        metric: "usage" | "recovery" | "loss",
        qty: number,
      ) {
        const source = ensureSourceSummary(supplierName, purchaseChannel);

        if (metric === "usage") {
          source.attributedUsageQty += qty;
          return;
        }

        if (metric === "recovery") {
          source.attributedRecoveryQty += qty;
          return;
        }

        source.attributedLossQty += qty;
      }

      for (const row of sourceHistory) {
        const itemId = row.itemId.toString();
        const history = sourceHistoryByItem.get(itemId) ?? [];
        history.push({
          inTime: row.stockIn.inTime,
          supplierName: row.supplier?.name ?? row.stockIn.supplier?.name ?? null,
          purchaseChannel: row.purchaseChannel ?? null,
        });
        sourceHistoryByItem.set(itemId, history);
      }

      for (const history of sourceHistoryByItem.values()) {
        history.sort((a, b) => a.inTime.getTime() - b.inTime.getTime());
      }

      function resolveLatestSource(itemId: string, eventTime: Date) {
        const history = sourceHistoryByItem.get(itemId);
        if (!history?.length) {
          return { supplierName: null, purchaseChannel: null };
        }

        const firstEntry = history[0];
        if (!firstEntry) {
          return { supplierName: null, purchaseChannel: null };
        }

        let matched = firstEntry;
        for (const entry of history) {
          if (entry.inTime.getTime() <= eventTime.getTime()) {
            matched = entry;
            continue;
          }
          break;
        }

        return {
          supplierName: matched.supplierName,
          purchaseChannel: matched.purchaseChannel,
        };
      }

      let stockInQtyTotal = 0;
      let stockInAmountTotal = 0;
      let stockOutQtyTotal = 0;
      let recoveryQtyTotal = 0;
      let lossQtyTotal = 0;

      for (const row of stockInItems) {
        const qty = toNumber(row.qty);
        const amount = toNumber(row.totalPrice);
        const itemId = row.item.id.toString();
        const month = formatMonth(row.stockIn.inTime);
        const bucket = monthlyMap.get(month);
        const item = ensureItemSummary(itemId, row.item.itemCode, row.item.name, row.item.specification ?? null);
        const source = ensureSourceSummary(row.supplier?.name ?? row.stockIn.supplier?.name ?? null, row.purchaseChannel ?? null);

        stockInQtyTotal += qty;
        stockInAmountTotal += amount;
        item.stockInQty += qty;
        item.stockInAmount += amount;
        source.purchasedQty += qty;
        source.purchasedAmount += amount;

        if (bucket) {
          bucket.stockInQty += qty;
          bucket.stockInAmount += amount;
        }
      }

      for (const row of stockOutItems) {
        const qty = toNumber(row.qty);
        const itemId = row.item.id.toString();
        const month = formatMonth(row.stockOut.outTime);
        const bucket = monthlyMap.get(month);
        const item = ensureItemSummary(itemId, row.item.itemCode, row.item.name, row.item.specification ?? null);

        stockOutQtyTotal += qty;
        item.stockOutQty += qty;

        let attributedQty = 0;
        for (const allocation of row.batchAllocations) {
          const sourceQty = toNumber(allocation.qty);
          attributedQty += sourceQty;
          attributeSourceUsage(
            allocation.stockInItem.supplier?.name ?? allocation.stockInItem.stockIn.supplier?.name ?? null,
            allocation.stockInItem.purchaseChannel ?? null,
            "usage",
            sourceQty,
          );
        }

        if (attributedQty < qty) {
          const sourceRef = resolveLatestSource(itemId, row.stockOut.outTime);
          attributeSourceUsage(sourceRef.supplierName, sourceRef.purchaseChannel, "usage", qty - attributedQty);
        }

        if (bucket) {
          bucket.stockOutQty += qty;
          bucket.netUsageQty += qty;
        }
      }

      for (const row of recoveries) {
        const qty = toNumber(row.qty);
        const itemId = row.item.id.toString();
        const month = formatMonth(row.recoveryTime);
        const bucket = monthlyMap.get(month);
        const item = ensureItemSummary(itemId, row.item.itemCode, row.item.name, row.item.specification ?? null);

        recoveryQtyTotal += qty;
        item.recoveryQty += qty;

        let attributedQty = 0;
        for (const allocation of row.batchAllocations) {
          const sourceQty = toNumber(allocation.qty);
          attributedQty += sourceQty;
          attributeSourceUsage(
            allocation.stockInItem.supplier?.name ?? allocation.stockInItem.stockIn.supplier?.name ?? null,
            allocation.stockInItem.purchaseChannel ?? null,
            "recovery",
            sourceQty,
          );
        }

        if (attributedQty < qty) {
          const sourceRef = resolveLatestSource(itemId, row.recoveryTime);
          attributeSourceUsage(sourceRef.supplierName, sourceRef.purchaseChannel, "recovery", qty - attributedQty);
        }

        if (bucket) {
          bucket.recoveryQty += qty;
          bucket.netUsageQty -= qty;
        }
      }

      for (const row of losses) {
        const qty = toNumber(row.qty);
        const itemId = row.item.id.toString();
        const month = formatMonth(row.recordTime);
        const bucket = monthlyMap.get(month);
        const item = ensureItemSummary(itemId, row.item.itemCode, row.item.name, row.item.specification ?? null);

        lossQtyTotal += qty;
        item.lossQty += qty;

        let attributedQty = 0;
        for (const allocation of row.batchAllocations) {
          const sourceQty = toNumber(allocation.qty);
          attributedQty += sourceQty;
          attributeSourceUsage(
            allocation.stockInItem.supplier?.name ?? allocation.stockInItem.stockIn.supplier?.name ?? null,
            allocation.stockInItem.purchaseChannel ?? null,
            "loss",
            sourceQty,
          );
        }

        if (attributedQty < qty) {
          const sourceRef = resolveLatestSource(itemId, row.recordTime);
          attributeSourceUsage(sourceRef.supplierName, sourceRef.purchaseChannel, "loss", qty - attributedQty);
        }

        if (bucket) {
          bucket.lossQty += qty;
        }
      }

      const itemRows = Array.from(itemMap.values())
        .map((item) => {
          item.netUsageQty = item.stockOutQty - item.recoveryQty;
          item.lossRate = item.stockOutQty > 0 ? item.lossQty / item.stockOutQty : 0;
          return {
            ...item,
            stockInQty: roundMetric(item.stockInQty),
            stockInAmount: roundMetric(item.stockInAmount, 2),
            stockOutQty: roundMetric(item.stockOutQty),
            recoveryQty: roundMetric(item.recoveryQty),
            lossQty: roundMetric(item.lossQty),
            netUsageQty: roundMetric(item.netUsageQty),
            lossRate: roundMetric(item.lossRate * 100, 2),
          };
        })
        .sort((a, b) => b.netUsageQty - a.netUsageQty || b.lossQty - a.lossQty)
      const items = paginateArray(itemRows, query.itemPage, query.itemPageSize);

      const sourceRows = Array.from(sourceMap.values())
        .map((source) => {
          source.netUsageQty = source.attributedUsageQty - source.attributedRecoveryQty;
          source.lossRate = source.attributedUsageQty > 0 ? source.attributedLossQty / source.attributedUsageQty : 0;
          return {
            supplierName: source.supplierName,
            purchaseChannel: source.purchaseChannel,
            purchasedQty: roundMetric(source.purchasedQty),
            purchasedAmount: roundMetric(source.purchasedAmount, 2),
            attributedUsageQty: roundMetric(source.attributedUsageQty),
            attributedRecoveryQty: roundMetric(source.attributedRecoveryQty),
            attributedLossQty: roundMetric(source.attributedLossQty),
            netUsageQty: roundMetric(source.netUsageQty),
            lossRate: roundMetric(source.lossRate * 100, 2),
          };
        })
        .sort((a, b) => b.attributedLossQty - a.attributedLossQty || b.netUsageQty - a.netUsageQty)
      const sources = paginateArray(sourceRows, query.sourcePage, query.sourcePageSize);

      const monthly = Array.from(monthlyMap.values()).map((bucket) => ({
        ...bucket,
        stockInQty: roundMetric(bucket.stockInQty),
        stockInAmount: roundMetric(bucket.stockInAmount, 2),
        stockOutQty: roundMetric(bucket.stockOutQty),
        recoveryQty: roundMetric(bucket.recoveryQty),
        lossQty: roundMetric(bucket.lossQty),
        netUsageQty: roundMetric(bucket.netUsageQty),
      }));

      res.json({
        range: query.range,
        anchorMonth: endMonth,
        period: {
          startMonth,
          endMonth,
          startDate: start,
          endDate: new Date(end.getTime() - 1),
        },
        totals: {
          stockInQty: roundMetric(stockInQtyTotal),
          stockInAmount: roundMetric(stockInAmountTotal, 2),
          stockOutQty: roundMetric(stockOutQtyTotal),
          recoveryQty: roundMetric(recoveryQtyTotal),
          lossQty: roundMetric(lossQtyTotal),
          netUsageQty: roundMetric(stockOutQtyTotal - recoveryQtyTotal),
          recoveryRate: roundMetric(stockOutQtyTotal > 0 ? (recoveryQtyTotal / stockOutQtyTotal) * 100 : 0, 2),
          lossRate: roundMetric(stockOutQtyTotal > 0 ? (lossQtyTotal / stockOutQtyTotal) * 100 : 0, 2),
        },
        monthly,
        itemRanking: items,
        sourceAnalysis: sources,
        notes: {
          sourceAttribution:
            "新产生的业务会按批次精确追踪到入库来源；旧数据若还没有批次分配关系，会回退到兼容归因口径。",
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/history",
  requireRole(UserRole.PROCUREMENT_MANAGER, UserRole.GENERAL_MANAGER),
  async (req, res, next) => {
    try {
      const query = analyticsHistoryQuerySchema.parse(req.query);
      const { start, end } = buildDateRange(query.range, query.anchorMonth);
      const skip = (query.page - 1) * query.pageSize;

      if (query.type === "stock_in") {
        const where = {
          stockIn: {
            inTime: {
              gte: start,
              lt: end,
            },
          },
        };
        const [total, rows] = await Promise.all([
          prisma.stockInItem.count({ where }),
          prisma.stockInItem.findMany({
            where,
            include: {
              item: {
                select: {
                  id: true,
                  itemCode: true,
                  name: true,
                  specification: true,
                },
              },
              supplier: {
                select: {
                  name: true,
                },
              },
              stockIn: {
                select: {
                  inNo: true,
                  inTime: true,
                  supplier: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip,
            take: query.pageSize,
          }),
        ]);

        res.json({
          type: query.type,
          data: rows.map((row) => ({
            id: row.id,
            inNo: row.stockIn.inNo,
            inTime: row.stockIn.inTime,
            qty: row.qty,
            unitPrice: row.unitPrice,
            totalPrice: row.totalPrice,
            purchaseChannel: row.purchaseChannel,
            supplierName: row.supplier?.name ?? row.stockIn.supplier?.name ?? null,
            item: row.item,
          })),
          pagination: {
            page: query.page,
            pageSize: query.pageSize,
            total,
            totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
          },
        });
        return;
      }

      if (query.type === "stock_out") {
        const where = {
          stockOut: {
            outTime: {
              gte: start,
              lt: end,
            },
          },
        };
        const [total, rows] = await Promise.all([
          prisma.stockOutItem.count({ where }),
          prisma.stockOutItem.findMany({
            where,
            include: {
              item: {
                select: {
                  id: true,
                  itemCode: true,
                  name: true,
                  specification: true,
                },
              },
              stockOut: {
                select: {
                  outNo: true,
                  outTime: true,
                  receiverName: true,
                  department: true,
                  purpose: true,
                },
              },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip,
            take: query.pageSize,
          }),
        ]);

        res.json({
          type: query.type,
          data: rows.map((row) => ({
            id: row.id,
            outNo: row.stockOut.outNo,
            outTime: row.stockOut.outTime,
            qty: row.qty,
            receiverName: row.stockOut.receiverName,
            department: row.stockOut.department,
            purpose: row.stockOut.purpose,
            item: row.item,
          })),
          pagination: {
            page: query.page,
            pageSize: query.pageSize,
            total,
            totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
          },
        });
        return;
      }

      if (query.type === "recovery") {
        const where = {
          recoveryTime: {
            gte: start,
            lt: end,
          },
        };
        const [total, rows] = await Promise.all([
          prisma.recoveryRecord.count({ where }),
          prisma.recoveryRecord.findMany({
            where,
            include: {
              item: {
                select: {
                  id: true,
                  itemCode: true,
                  name: true,
                  specification: true,
                },
              },
              operator: {
                select: {
                  id: true,
                  realName: true,
                },
              },
            },
            orderBy: [{ recoveryTime: "desc" }, { id: "desc" }],
            skip,
            take: query.pageSize,
          }),
        ]);

        res.json({
          type: query.type,
          data: rows.map((row) => ({
            id: row.id,
            recoveryTime: row.recoveryTime,
            qty: row.qty,
            returnedBy: row.returnedBy,
            recoveryStatus: row.recoveryStatus,
            remark: row.remark,
            operator: row.operator,
            item: row.item,
          })),
          pagination: {
            page: query.page,
            pageSize: query.pageSize,
            total,
            totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
          },
        });
        return;
      }

      const where = {
        recordTime: {
          gte: start,
          lt: end,
        },
      };
      const [total, rows] = await Promise.all([
        prisma.lossRecord.count({ where }),
        prisma.lossRecord.findMany({
          where,
          include: {
            item: {
              select: {
                id: true,
                itemCode: true,
                name: true,
                specification: true,
              },
            },
            operator: {
              select: {
                id: true,
                realName: true,
              },
            },
          },
          orderBy: [{ recordTime: "desc" }, { id: "desc" }],
          skip,
          take: query.pageSize,
        }),
      ]);

      res.json({
        type: query.type,
        data: rows.map((row) => ({
          id: row.id,
          recordTime: row.recordTime,
          qty: row.qty,
          lossType: row.lossType,
          sourceBucket: row.sourceBucket,
          responsiblePerson: row.responsiblePerson,
          remark: row.remark,
          operator: row.operator,
          item: row.item,
        })),
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
