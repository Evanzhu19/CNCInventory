import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";
import {
  PurchaseListItemStatus,
  PurchaseListStatus,
  PurchaseRequestStatus,
  StockInType,
  UserRole,
} from "../generated/prisma/enums.js";
import { applyStockIn, writeOperationLog } from "../lib/inventory.js";
import { syncLatestPurchasePriceForItems } from "../lib/itemPurchaseDefaults.js";
import { prisma } from "../lib/prisma.js";
import { addDuplicateLineIssue, findDuplicateIndexes } from "../lib/requestGuards.js";
import { normalizeSupplierInput, resolveSupplierId } from "../lib/suppliers.js";
import { toBigIntId, toNumber } from "../lib/serialize.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();
type Tx = Prisma.TransactionClient;

const editablePurchaseListItemStatusSchema = z
  .nativeEnum(PurchaseListItemStatus)
  .refine((status) => status !== PurchaseListItemStatus.STOCKED_IN, {
    message: "已入库状态只能通过到货入库生成",
  });

const createPurchaseListSchema = z
  .object({
    purchaseRequestIds: z.array(z.string().min(1)).min(1),
    remark: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    for (const index of findDuplicateIndexes(data.purchaseRequestIds)) {
      addDuplicateLineIssue(ctx, ["purchaseRequestIds", index], "同一采购申请不能重复加入采购清单");
    }
  });

const supplierInputSchema = z.object({
  supplierId: z.string().optional().nullable(),
  supplierName: z.string().max(100).optional().nullable(),
});

const updatePurchaseListSchema = z.object({
  remark: z.string().optional().nullable(),
  items: z
    .array(
      supplierInputSchema.extend({
        id: z.string().min(1),
        referencePrice: z.coerce.number().min(0).optional().nullable(),
        status: editablePurchaseListItemStatusSchema.optional(),
        remark: z.string().optional().nullable(),
      }),
    )
    .default([]),
});

const purchaseListStockInSchema = supplierInputSchema
  .extend({
    inTime: z.string().datetime().optional(),
    remark: z.string().optional().nullable(),
    items: z
      .array(
        z.object({
          purchaseListItemId: z.string().min(1),
          qty: z.coerce.number().positive(),
          unitPrice: z.coerce.number().min(0).optional().nullable(),
          purchaseChannel: z.string().max(100).optional().nullable(),
          remark: z.string().optional().nullable(),
        }),
      )
      .min(1),
  })
  .refine((data) => Boolean(data.supplierId || data.supplierName?.trim()), {
    message: "供应商必填",
    path: ["supplierName"],
  })
  .superRefine((data, ctx) => {
    for (const index of findDuplicateIndexes(data.items.map((item) => item.purchaseListItemId))) {
      addDuplicateLineIssue(ctx, ["items", index, "purchaseListItemId"], "同一采购清单明细不能重复提交入库");
    }
  });

function uniqueBigIntIds(values: string[]) {
  return Array.from(new Set(values.map((value) => toBigIntId(value))));
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  return Number(value);
}

function nullableText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function buildPurchaseListGroupKey(item: {
  itemId: bigint | null;
  requestedName: string;
  requestedSpecification: string | null;
  requestedBrand: string | null;
  requestedUnit: string | null;
}) {
  if (item.itemId) {
    return `item:${item.itemId.toString()}`;
  }

  return [
    "manual",
    item.requestedName.trim().toLowerCase(),
    item.requestedSpecification?.trim().toLowerCase() ?? "",
    item.requestedBrand?.trim().toLowerCase() ?? "",
    item.requestedUnit?.trim().toLowerCase() ?? "",
  ].join("|");
}

async function syncPurchaseListStatus(tx: Tx, listId: bigint) {
  const purchaseList = await tx.purchaseList.findUnique({
    where: { id: listId },
    include: {
      items: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (!purchaseList) {
    return;
  }

  const itemStatuses = purchaseList.items.map((item) => item.status);
  let nextStatus: PurchaseListStatus = PurchaseListStatus.PENDING;

  if (itemStatuses.length > 0 && itemStatuses.every((status) => status === PurchaseListItemStatus.CANCELLED)) {
    nextStatus = PurchaseListStatus.CANCELLED;
  } else if (
    itemStatuses.length > 0 &&
    itemStatuses.every(
      (status) => status === PurchaseListItemStatus.STOCKED_IN || status === PurchaseListItemStatus.CANCELLED,
    )
  ) {
    nextStatus = PurchaseListStatus.COMPLETED;
  } else if (
    itemStatuses.some((status) => status === PurchaseListItemStatus.ARRIVED || status === PurchaseListItemStatus.STOCKED_IN)
  ) {
    nextStatus = PurchaseListStatus.ARRIVED;
  } else if (itemStatuses.some((status) => status === PurchaseListItemStatus.ORDERED)) {
    nextStatus = PurchaseListStatus.PURCHASING;
  }

  if (purchaseList.status !== nextStatus) {
    await tx.purchaseList.update({
      where: { id: listId },
      data: { status: nextStatus },
    });
  }
}

async function syncPurchaseRequestStatuses(
  tx: Tx,
  requestIds: bigint[],
) {
  if (requestIds.length === 0) {
    return;
  }

  const requests = await tx.purchaseRequest.findMany({
    where: {
      id: {
        in: requestIds,
      },
    },
    include: {
      items: {
        include: {
          purchaseListLinks: {
            include: {
              purchaseListItem: {
                select: {
                  status: true,
                },
              },
            },
          },
        },
      },
    },
  });

  for (const request of requests) {
    if (request.status === PurchaseRequestStatus.CANCELLED) {
      continue;
    }

    const hasItems = request.items.length > 0;
    const everyItemMerged = hasItems && request.items.every((item) => item.purchaseListLinks.length > 0);
    const everyItemStockedIn =
      hasItems &&
      request.items.every((item) =>
        item.purchaseListLinks.some((link) => link.purchaseListItem.status === PurchaseListItemStatus.STOCKED_IN),
      );

    const nextStatus = everyItemStockedIn
      ? PurchaseRequestStatus.PURCHASED
      : everyItemMerged
        ? PurchaseRequestStatus.MERGED
        : PurchaseRequestStatus.PENDING;

    if (request.status !== nextStatus) {
      await tx.purchaseRequest.update({
        where: { id: request.id },
        data: { status: nextStatus },
      });
    }
  }
}

function purchaseListInclude() {
  return {
    creator: { select: { id: true, realName: true } },
    stockIns: {
      orderBy: { inTime: "desc" as const },
      select: {
        id: true,
        inNo: true,
        inTime: true,
        totalAmount: true,
        supplier: {
          select: {
            name: true,
          },
        },
      },
    },
    items: {
      orderBy: { id: "asc" as const },
      include: {
        item: true,
        referenceSupplier: true,
        stockInItems: {
          orderBy: { id: "desc" as const },
          include: {
            stockIn: {
              select: {
                id: true,
                inNo: true,
                inTime: true,
              },
            },
          },
        },
        requestItemLinks: {
          orderBy: { id: "asc" as const },
          include: {
            purchaseRequestItem: {
              include: {
                purchaseRequest: {
                  select: {
                    id: true,
                    requestNo: true,
                    status: true,
                    requester: {
                      select: {
                        id: true,
                        realName: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

router.get("/", requireRole(UserRole.PROCUREMENT_MANAGER), async (_req, res, next) => {
  try {
    const data = await prisma.purchaseList.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
      include: purchaseListInclude(),
    });

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const data = createPurchaseListSchema.parse(req.body);
    const purchaseRequestIds = uniqueBigIntIds(data.purchaseRequestIds);
    const listNo = `PL-${Date.now()}`;

    const purchaseList = await prisma.$transaction(async (tx) => {
      const requests = await tx.purchaseRequest.findMany({
        where: {
          id: {
            in: purchaseRequestIds,
          },
        },
        include: {
          items: {
            include: {
              item: true,
            },
          },
        },
      });

      if (requests.length !== purchaseRequestIds.length) {
        throw new Error("部分采购申请不存在");
      }

      const invalidRequests = requests.filter((request) => request.status !== PurchaseRequestStatus.PENDING);
      if (invalidRequests.length > 0) {
        throw new Error("只能从待处理采购申请生成采购清单");
      }

      const requestItems = requests.flatMap((request) => request.items);
      if (requestItems.length === 0) {
        throw new Error("选中的采购申请没有明细");
      }

      const existingLinks = await tx.purchaseListRequestItem.findMany({
        where: {
          purchaseRequestItemId: {
            in: requestItems.map((item) => item.id),
          },
        },
        select: {
          purchaseRequestItemId: true,
        },
      });

      if (existingLinks.length > 0) {
        throw new Error("选中的采购申请已关联到采购清单");
      }

      const groups = new Map<
        string,
        {
          itemId: bigint | null;
          itemName: string;
          specification: string | null;
          brand: string | null;
          unit: string | null;
          qty: number;
          referencePrice: number | null;
          referenceSupplierId: bigint | null;
          requestItems: Array<{ id: bigint; qty: number }>;
        }
      >();

      for (const requestItem of requestItems) {
        const key = buildPurchaseListGroupKey(requestItem);
        const current = groups.get(key);
        const qty = toNumber(requestItem.requestedQty);
        const nextValue = current ?? {
          itemId: requestItem.itemId,
          itemName: requestItem.item?.name ?? requestItem.requestedName,
          specification: requestItem.item?.specification ?? requestItem.requestedSpecification,
          brand: requestItem.item?.brand ?? requestItem.requestedBrand,
          unit: requestItem.item?.unit ?? requestItem.requestedUnit,
          qty: 0,
          referencePrice: nullableNumber(requestItem.item?.defaultPrice),
          referenceSupplierId: requestItem.item?.defaultSupplierId ?? null,
          requestItems: [],
        };

        nextValue.qty += qty;
        nextValue.requestItems.push({ id: requestItem.id, qty });
        groups.set(key, nextValue);
      }

      const created = await tx.purchaseList.create({
        data: {
          listNo,
          createdBy: req.user!.id,
          remark: data.remark,
          items: {
            create: Array.from(groups.values()).map((group) => ({
              itemId: group.itemId,
              itemName: group.itemName,
              specification: group.specification,
              brand: group.brand,
              unit: group.unit,
              qty: group.qty,
              referencePrice: group.referencePrice,
              referenceSupplierId: group.referenceSupplierId,
              requestItemLinks: {
                create: group.requestItems.map((requestItem) => ({
                  purchaseRequestItemId: requestItem.id,
                  qty: requestItem.qty,
                })),
              },
            })),
          },
        },
        include: purchaseListInclude(),
      });

      await tx.purchaseRequest.updateMany({
        where: {
          id: {
            in: purchaseRequestIds,
          },
        },
        data: {
          status: PurchaseRequestStatus.MERGED,
        },
      });

      await writeOperationLog(tx, req.user?.id, "purchase_list", "create", "purchase_lists", created.id, {
        listNo,
        purchaseRequestIds: purchaseRequestIds.map((id) => id.toString()),
        itemCount: created.items.length,
      });

      return created;
    });

    res.status(201).json({ data: purchaseList });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const purchaseListId = toBigIntId(String(req.params.id));
    const data = updatePurchaseListSchema.parse(req.body);

    const purchaseList = await prisma.$transaction(async (tx) => {
      const existing = await tx.purchaseList.findUnique({
        where: { id: purchaseListId },
        include: {
          items: {
            include: {
              requestItemLinks: {
                select: {
                  purchaseRequestItem: {
                    select: {
                      purchaseRequestId: true,
                    },
                  },
                },
              },
              stockInItems: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      });

      if (!existing) {
        throw new Error("采购清单不存在");
      }

      const existingItemMap = new Map(existing.items.map((item) => [item.id.toString(), item]));
      const touchedRequestIds = new Set<bigint>();

      for (const item of existing.items) {
        for (const link of item.requestItemLinks) {
          touchedRequestIds.add(link.purchaseRequestItem.purchaseRequestId);
        }
      }

      for (const item of data.items) {
        const current = existingItemMap.get(item.id);
        if (!current) {
          throw new Error("采购清单明细不存在");
        }

        if (current.stockInItems.length > 0 && item.status !== undefined && item.status !== current.status) {
          throw new Error("已有入库记录的清单明细不能手动修改状态");
        }

        const referenceSupplierId =
          item.supplierId || item.supplierName?.trim()
            ? await resolveSupplierId(tx, normalizeSupplierInput(item))
            : null;

        await tx.purchaseListItem.update({
          where: { id: current.id },
          data: {
            referencePrice: item.referencePrice,
            referenceSupplierId,
            status: item.status,
            remark: nullableText(item.remark),
          },
        });
      }

      await tx.purchaseList.update({
        where: { id: purchaseListId },
        data: {
          remark: data.remark,
        },
      });

      await syncPurchaseListStatus(tx, purchaseListId);
      await syncPurchaseRequestStatuses(tx, Array.from(touchedRequestIds));

      const updated = await tx.purchaseList.findUnique({
        where: { id: purchaseListId },
        include: purchaseListInclude(),
      });

      await writeOperationLog(tx, req.user?.id, "purchase_list", "update", "purchase_lists", purchaseListId, {
        itemCount: data.items.length,
      });

      return updated;
    });

    res.json({ data: purchaseList });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/stock-in", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const purchaseListId = toBigIntId(String(req.params.id));
    const data = purchaseListStockInSchema.parse(req.body);
    const selectedItemIds = uniqueBigIntIds(data.items.map((item) => item.purchaseListItemId));
    const payloadItemMap = new Map(data.items.map((item) => [item.purchaseListItemId, item]));
    const warehouseId = BigInt(1);
    const inNo = `IN-${Date.now()}`;

    const stockIn = await prisma.$transaction(async (tx) => {
      const supplierId = await resolveSupplierId(tx, normalizeSupplierInput(data));
      const purchaseList = await tx.purchaseList.findUnique({
        where: { id: purchaseListId },
        include: {
          items: {
            where: {
              id: {
                in: selectedItemIds,
              },
            },
            include: {
              stockInItems: {
                select: {
                  id: true,
                  qty: true,
                },
              },
              requestItemLinks: {
                select: {
                  purchaseRequestItem: {
                    select: {
                      purchaseRequestId: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!purchaseList) {
        throw new Error("采购清单不存在");
      }

      if (purchaseList.status === PurchaseListStatus.CANCELLED) {
        throw new Error("已取消的采购清单不能转入库");
      }

      if (purchaseList.items.length !== selectedItemIds.length) {
        throw new Error("部分采购清单明细不存在");
      }

      const touchedRequestIds = new Set<bigint>();
      let totalAmount = 0;
      const stockInItems = [];
      const nextItemStatuses: Array<{ id: bigint; status: PurchaseListItemStatus }> = [];

      for (const purchaseListItem of purchaseList.items) {
        if (!purchaseListItem.itemId) {
          throw new Error(`清单明细 ${purchaseListItem.itemName} 未关联物品主数据，不能直接入库`);
        }

        if (
          purchaseListItem.status === PurchaseListItemStatus.CANCELLED ||
          purchaseListItem.status === PurchaseListItemStatus.STOCKED_IN
        ) {
          throw new Error("只能对未取消且未入库的清单明细执行到货入库");
        }

        const payload = payloadItemMap.get(purchaseListItem.id.toString());
        if (!payload) {
          throw new Error("缺少采购清单明细入库参数");
        }

        const totalQty = toNumber(purchaseListItem.qty);
        const stockedInQty = purchaseListItem.stockInItems.reduce((sum, item) => sum + toNumber(item.qty), 0);
        const remainingQty = totalQty - stockedInQty;
        const qty = payload.qty;

        if (remainingQty <= 0) {
          throw new Error(`清单明细 ${purchaseListItem.itemName} 已全部入库`);
        }

        if (qty > remainingQty) {
          throw new Error(`清单明细 ${purchaseListItem.itemName} 本次入库数量超过剩余待入库数量`);
        }

        const unitPrice = payload.unitPrice ?? nullableNumber(purchaseListItem.referencePrice) ?? 0;

        totalAmount += qty * unitPrice;
        stockInItems.push({
          itemId: purchaseListItem.itemId,
          supplierId,
          purchaseListItemId: purchaseListItem.id,
          qty,
          availableQtyBalance: qty,
          borrowedQtyBalance: 0,
          pendingQtyBalance: 0,
          unitPrice,
          totalPrice: qty * unitPrice,
          purchaseChannel: nullableText(payload.purchaseChannel),
          remark: nullableText(payload.remark),
        });
        nextItemStatuses.push({
          id: purchaseListItem.id,
          status: stockedInQty + qty >= totalQty ? PurchaseListItemStatus.STOCKED_IN : PurchaseListItemStatus.ARRIVED,
        });

        for (const link of purchaseListItem.requestItemLinks) {
          touchedRequestIds.add(link.purchaseRequestItem.purchaseRequestId);
        }
      }

      const created = await tx.stockIn.create({
        data: {
          inNo,
          inType: StockInType.PURCHASE,
          warehouseId,
          operatorId: req.user!.id,
          supplierId,
          purchaseListId,
          inTime: data.inTime ? new Date(data.inTime) : new Date(),
          totalAmount,
          remark: nullableText(data.remark),
          items: {
            create: stockInItems,
          },
        },
        include: {
          supplier: true,
          items: {
            include: {
              item: true,
              supplier: true,
            },
          },
        },
      });

      for (const item of stockInItems) {
        await applyStockIn(tx, item.itemId, warehouseId, item.qty);
      }
      await syncLatestPurchasePriceForItems(
        tx,
        stockInItems.map((item) => item.itemId),
      );

      for (const item of nextItemStatuses) {
        await tx.purchaseListItem.update({
          where: { id: item.id },
          data: {
            status: item.status,
          },
        });
      }

      await syncPurchaseListStatus(tx, purchaseListId);
      await syncPurchaseRequestStatuses(tx, Array.from(touchedRequestIds));

      await writeOperationLog(tx, req.user?.id, "purchase_list", "stock_in", "purchase_lists", purchaseListId, {
        inNo,
        purchaseListId: purchaseListId.toString(),
        itemCount: stockInItems.length,
        totalAmount,
      });

      return created;
    });

    res.status(201).json({ data: stockIn });
  } catch (error) {
    next(error);
  }
});

export default router;
