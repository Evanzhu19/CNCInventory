import { Router } from "express";
import { z } from "zod";
import { ItemTrackingMode } from "../generated/prisma/enums.js";
import { UserRole } from "../generated/prisma/enums.js";
import { writeOperationLog } from "../lib/inventory.js";
import { prisma } from "../lib/prisma.js";
import { normalizeSupplierInput, resolveOptionalSupplierId } from "../lib/suppliers.js";
import { requireRole } from "../middleware/auth.js";
import { toBigIntId, toNumber } from "../lib/serialize.js";

const router = Router();

const supplierInputSchema = z.object({
  defaultSupplierId: z.string().optional().nullable(),
  defaultSupplierName: z.string().max(100).optional().nullable(),
});

const itemSchema = supplierInputSchema.extend({
  itemCode: z.string().max(50).optional().nullable(),
  name: z.string().min(1).max(100),
  specification: z.string().max(200).optional().nullable(),
  brand: z.string().max(100).optional().nullable(),
  categoryId: z.string().min(1),
  unit: z.string().min(1).max(20),
  trackingMode: z.nativeEnum(ItemTrackingMode).default(ItemTrackingMode.CLOSED_LOOP),
  safeStock: z.coerce.number().min(0).default(0),
  remark: z.string().optional().nullable(),
});

function nullableText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

router.get("/", async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const where = search
      ? {
          OR: [
            { itemCode: { contains: search } },
            { name: { contains: search } },
            { specification: { contains: search } },
            { brand: { contains: search } },
          ],
        }
      : {};

    const items = await prisma.item.findMany({
      where,
      include: {
        category: true,
        defaultSupplier: true,
        inventories: true,
      },
      orderBy: { id: "desc" },
    });

    res.json({ data: items });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const itemId = toBigIntId(req.params.id);

    const [item, inventory, latestPurchase, priceStats, priceHistory, recentStockOuts] = await Promise.all([
      prisma.item.findUnique({
        where: { id: itemId },
        include: {
          category: true,
          defaultSupplier: true,
        },
      }),
      prisma.inventory.findUnique({
        where: {
          itemId_warehouseId: {
            itemId,
            warehouseId: BigInt(1),
          },
        },
      }),
      prisma.stockInItem.findFirst({
        where: {
          itemId,
          unitPrice: { gt: 0 },
          stockIn: {
            inType: "PURCHASE",
          },
        },
        include: {
          stockIn: {
            select: {
              inNo: true,
              inTime: true,
              supplier: { select: { name: true } },
            },
          },
          supplier: { select: { name: true } },
        },
        orderBy: [{ stockIn: { inTime: "desc" } }, { id: "desc" }],
      }),
      prisma.stockInItem.aggregate({
        where: {
          itemId,
          unitPrice: { gt: 0 },
          stockIn: {
            inType: "PURCHASE",
          },
        },
        _avg: { unitPrice: true },
        _min: { unitPrice: true },
        _max: { unitPrice: true },
        _count: { unitPrice: true },
      }),
      prisma.stockInItem.findMany({
        where: {
          itemId,
          unitPrice: { gt: 0 },
          stockIn: {
            inType: "PURCHASE",
          },
        },
        include: {
          stockIn: {
            select: {
              inNo: true,
              inTime: true,
              supplier: { select: { name: true } },
            },
          },
          supplier: { select: { name: true } },
        },
        orderBy: [{ stockIn: { inTime: "desc" } }, { id: "desc" }],
        take: 20,
      }),
      prisma.stockOutItem.findMany({
        where: { itemId },
        include: {
          stockOut: {
            select: {
              outNo: true,
              outTime: true,
              receiverName: true,
              purpose: true,
            },
          },
        },
        orderBy: [{ stockOut: { outTime: "desc" } }, { id: "desc" }],
        take: 10,
      }),
    ]);

    if (!item) {
      res.status(404).json({ message: "物品不存在" });
      return;
    }

    res.json({
      data: {
        item,
        inventory,
        priceSummary: {
          latestPrice: latestPurchase?.unitPrice ?? null,
          latestSupplier: latestPurchase?.supplier?.name ?? latestPurchase?.stockIn.supplier?.name ?? null,
          latestPurchaseTime: latestPurchase?.stockIn.inTime ?? null,
          averagePrice: priceStats._avg.unitPrice ?? null,
          minPrice: priceStats._min.unitPrice ?? null,
          maxPrice: priceStats._max.unitPrice ?? null,
          priceRecordCount: priceStats._count.unitPrice,
        },
        priceHistory,
        recentStockOuts,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/",
  requireRole(UserRole.CNC_SUPERVISOR, UserRole.PROCUREMENT_MANAGER),
  async (req, res, next) => {
  try {
    const data = itemSchema.parse(req.body);
    const itemCode = data.itemCode?.trim() || `ITEM-${Date.now()}`;

    const item = await prisma.$transaction(async (tx) => {
      const defaultSupplierId = await resolveOptionalSupplierId(tx, normalizeSupplierInput({
        supplierId: data.defaultSupplierId,
        supplierName: data.defaultSupplierName,
      }));

      const created = await tx.item.create({
        data: {
          itemCode,
          name: data.name.trim(),
          specification: nullableText(data.specification),
          brand: nullableText(data.brand),
          categoryId: toBigIntId(data.categoryId),
          unit: data.unit.trim(),
          trackingMode: data.trackingMode,
          safeStock: data.safeStock,
          defaultSupplierId,
          remark: nullableText(data.remark),
        },
      });

      await tx.inventory.create({
        data: {
          itemId: created.id,
          warehouseId: BigInt(1),
          availableQty: 0,
          borrowedQty: 0,
          pendingQty: 0,
        },
      });

      return created;
    });

    res.status(201).json({ data: item });
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/:id",
  requireRole(UserRole.PROCUREMENT_MANAGER),
  async (req, res, next) => {
    try {
      const itemId = toBigIntId(String(req.params.id));
      const data = itemSchema.parse(req.body);

      const existing = await prisma.item.findUnique({
        where: { id: itemId },
        select: { id: true, itemCode: true },
      });

      if (!existing) {
        res.status(404).json({ message: "物品不存在" });
        return;
      }

      const defaultSupplierId = await resolveOptionalSupplierId(prisma, normalizeSupplierInput({
        supplierId: data.defaultSupplierId,
        supplierName: data.defaultSupplierName,
      }));

      const item = await prisma.item.update({
        where: { id: itemId },
        data: {
          itemCode: data.itemCode?.trim() || existing.itemCode,
          name: data.name.trim(),
          specification: nullableText(data.specification),
          brand: nullableText(data.brand),
          categoryId: toBigIntId(data.categoryId),
          unit: data.unit.trim(),
          trackingMode: data.trackingMode,
          safeStock: data.safeStock,
          defaultSupplierId,
          remark: nullableText(data.remark),
        },
        include: {
          category: true,
          defaultSupplier: true,
          inventories: true,
        },
      });

      res.json({ data: item });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/:id",
  requireRole(UserRole.PROCUREMENT_MANAGER),
  async (req, res, next) => {
    try {
      const itemId = toBigIntId(String(req.params.id));

      await prisma.$transaction(async (tx) => {
        const item = await tx.item.findUnique({ where: { id: itemId } });
        if (!item) {
          res.status(404).json({ message: "物品不存在" });
          return;
        }

        const inventory = await tx.inventory.findUnique({
          where: { itemId_warehouseId: { itemId, warehouseId: BigInt(1) } },
        });

        if (inventory) {
          const total = toNumber(inventory.availableQty) + toNumber(inventory.borrowedQty) + toNumber(inventory.pendingQty);
          if (total > 0) {
            throw new Error("物品当前有库存，无法删除");
          }
        }

        const [stockInCount, stockOutCount, recoveryCount, lossCount, purchaseRequestCount] = await Promise.all([
          tx.stockInItem.count({ where: { itemId } }),
          tx.stockOutItem.count({ where: { itemId } }),
          tx.recoveryRecord.count({ where: { itemId } }),
          tx.lossRecord.count({ where: { itemId } }),
          tx.purchaseRequestItem.count({ where: { itemId } }),
        ]);

        if (stockInCount + stockOutCount + recoveryCount + lossCount + purchaseRequestCount > 0) {
          throw new Error("物品已有关联记录（入库/出库/采购等），无法删除");
        }

        if (inventory) {
          await tx.inventory.delete({
            where: { itemId_warehouseId: { itemId, warehouseId: BigInt(1) } },
          });
        }

        await tx.item.delete({ where: { id: itemId } });

        await writeOperationLog(tx, req.user?.id, "items", "delete", "items", itemId, {
          itemCode: item.itemCode,
          name: item.name,
        });
      });

      res.json({ message: "物品已删除" });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
