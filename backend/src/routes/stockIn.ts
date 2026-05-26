import { Router } from "express";
import { z } from "zod";
import { StockInType } from "../generated/prisma/enums.js";
import { UserRole } from "../generated/prisma/enums.js";
import { applyStockIn, writeOperationLog } from "../lib/inventory.js";
import { syncLatestPurchasePriceForItems } from "../lib/itemPurchaseDefaults.js";
import { prisma } from "../lib/prisma.js";
import { addDuplicateLineIssue, findDuplicateIndexes } from "../lib/requestGuards.js";
import { normalizeSupplierInput, resolveSupplierId } from "../lib/suppliers.js";
import { requireRole } from "../middleware/auth.js";
import { toBigIntId, toNumber } from "../lib/serialize.js";

const router = Router();

const supplierInputSchema = z.object({
  supplierId: z.string().optional().nullable(),
  supplierName: z.string().max(100).optional().nullable(),
});

const stockInItemSchema = z.object({
  itemId: z.string().min(1),
  qty: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().min(0).default(0),
  purchaseChannel: z.string().max(100).optional().nullable(),
  remark: z.string().optional().nullable(),
});

const stockInSchema = supplierInputSchema
  .extend({
    inType: z.nativeEnum(StockInType).default(StockInType.PURCHASE),
    inTime: z.string().datetime().optional(),
    remark: z.string().optional().nullable(),
    items: z.array(stockInItemSchema).min(1),
  })
  .refine((data) => Boolean(data.supplierId || data.supplierName?.trim()), {
    message: "供应商必填",
    path: ["supplierName"],
  })
  .superRefine((data, ctx) => {
    for (const index of findDuplicateIndexes(data.items.map((item) => item.itemId))) {
      addDuplicateLineIssue(ctx, ["items", index, "itemId"], "同一物品不能在同一张入库单里重复出现");
    }
  });

const stockInUpdateSchema = supplierInputSchema
  .extend({
    inTime: z.string().datetime().optional(),
    remark: z.string().optional().nullable(),
    items: z
      .array(
        z.object({
          id: z.string().min(1),
          unitPrice: z.coerce.number().min(0).default(0),
          purchaseChannel: z.string().max(100).optional().nullable(),
          remark: z.string().optional().nullable(),
        }),
      )
      .min(1),
  })
  .refine((data) => Boolean(data.supplierId || data.supplierName?.trim()), {
    message: "供应商必填",
    path: ["supplierName"],
  });

function nullableText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

const dateRangeSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

router.get("/", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const { startDate, endDate } = dateRangeSchema.parse(req.query);
    const data = await prisma.stockIn.findMany({
      where: {
        inTime: {
          ...(startDate ? { gte: new Date(`${startDate}T00:00:00.000`) } : {}),
          ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999`) } : {}),
        },
      },
      orderBy: { inTime: "desc" },
      include: {
        supplier: true,
        operator: { select: { id: true, realName: true } },
        purchaseList: { select: { id: true, listNo: true } },
        items: { include: { item: true, supplier: true } },
      },
    });

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const data = stockInSchema.parse(req.body);
    const warehouseId = BigInt(1);
    const totalAmount = data.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
    const inNo = `IN-${Date.now()}`;

    const stockIn = await prisma.$transaction(async (tx) => {
      const supplierId = await resolveSupplierId(tx, normalizeSupplierInput(data));
      const created = await tx.stockIn.create({
        data: {
          inNo,
          inType: data.inType,
          warehouseId,
          operatorId: req.user!.id,
          supplierId,
          inTime: data.inTime ? new Date(data.inTime) : new Date(),
          totalAmount,
          remark: nullableText(data.remark),
          items: {
            create: data.items.map((item) => ({
              itemId: toBigIntId(item.itemId),
              supplierId,
              qty: item.qty,
              availableQtyBalance: item.qty,
              borrowedQtyBalance: 0,
              pendingQtyBalance: 0,
              unitPrice: item.unitPrice,
              totalPrice: item.qty * item.unitPrice,
              purchaseChannel: nullableText(item.purchaseChannel),
              remark: nullableText(item.remark),
            })),
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

      for (const item of data.items) {
        await applyStockIn(tx, toBigIntId(item.itemId), warehouseId, item.qty);
      }
      await syncLatestPurchasePriceForItems(
        tx,
        data.items.map((item) => toBigIntId(item.itemId)),
      );

      await writeOperationLog(tx, req.user?.id, "stock_in", "create", "stock_in", created.id, {
        inNo,
        itemCount: data.items.length,
        totalAmount,
      });

      return created;
    });

    res.status(201).json({ data: stockIn });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const stockInId = toBigIntId(String(req.params.id));
    const data = stockInUpdateSchema.parse(req.body);

    const stockIn = await prisma.$transaction(async (tx) => {
      const existing = await tx.stockIn.findUnique({
        where: { id: stockInId },
        include: {
          items: {
            select: {
              id: true,
              itemId: true,
              qty: true,
              unitPrice: true,
            },
          },
        },
      });

      if (!existing) {
        throw new Error("入库单不存在");
      }

      const supplierId = await resolveSupplierId(tx, normalizeSupplierInput(data));
      const itemMap = new Map(existing.items.map((item) => [item.id.toString(), item]));

      for (const item of data.items) {
        const current = itemMap.get(item.id);
        if (!current) {
          throw new Error("入库明细不存在");
        }

        await tx.stockInItem.update({
          where: { id: current.id },
          data: {
            supplierId,
            unitPrice: item.unitPrice,
            totalPrice: Number(current.qty) * item.unitPrice,
            purchaseChannel: nullableText(item.purchaseChannel),
            remark: nullableText(item.remark),
          },
        });
      }

      await tx.stockInItem.updateMany({
        where: { stockInId },
        data: {
          supplierId,
        },
      });

      const refreshedItems = await tx.stockInItem.findMany({
        where: { stockInId },
        select: {
          qty: true,
          unitPrice: true,
        },
      });
      const totalAmount = refreshedItems.reduce((sum, item) => sum + Number(item.qty) * Number(item.unitPrice), 0);
      await syncLatestPurchasePriceForItems(
        tx,
        existing.items.map((item) => item.itemId),
      );

      const updated = await tx.stockIn.update({
        where: { id: stockInId },
        data: {
          supplierId,
          inTime: data.inTime ? new Date(data.inTime) : existing.inTime,
          remark: nullableText(data.remark),
          totalAmount,
        },
        include: {
          supplier: true,
          purchaseList: { select: { id: true, listNo: true } },
          items: {
            include: {
              item: true,
              supplier: true,
            },
          },
        },
      });

      await writeOperationLog(tx, req.user?.id, "stock_in", "update", "stock_in", stockInId, {
        inNo: updated.inNo,
        itemCount: updated.items.length,
        totalAmount,
      });

      return updated;
    });

    res.json({ data: stockIn });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const stockInId = toBigIntId(String(req.params.id));
    const warehouseId = BigInt(1);

    await prisma.$transaction(async (tx) => {
      const stockIn = await tx.stockIn.findUnique({
        where: { id: stockInId },
        include: { items: true },
      });

      if (!stockIn) {
        throw new Error("入库单不存在");
      }

      for (const item of stockIn.items) {
        const originalQty = toNumber(item.qty);
        const availableBalance = toNumber(item.availableQtyBalance);
        const borrowedBalance = toNumber(item.borrowedQtyBalance);
        const pendingBalance = toNumber(item.pendingQtyBalance);
        const currentBalance = availableBalance + borrowedBalance + pendingBalance;

        if (Math.abs(currentBalance - originalQty) > 0.0001) {
          throw new Error("入库单中的物品已被部分出库/回收/损耗，无法删除");
        }
      }

      for (const item of stockIn.items) {
        await tx.inventory.update({
          where: { itemId_warehouseId: { itemId: item.itemId, warehouseId } },
          data: {
            availableQty: { decrement: toNumber(item.availableQtyBalance) },
            borrowedQty: { decrement: toNumber(item.borrowedQtyBalance) },
            pendingQty: { decrement: toNumber(item.pendingQtyBalance) },
          },
        });
      }

      await tx.stockInItem.deleteMany({ where: { stockInId } });
      await tx.stockIn.delete({ where: { id: stockInId } });

      await writeOperationLog(tx, req.user?.id, "stock_in", "delete", "stock_in", stockInId, {
        inNo: stockIn.inNo,
      });
    });

    res.json({ message: "入库单已删除" });
  } catch (error) {
    next(error);
  }
});

export default router;
