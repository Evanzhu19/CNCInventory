import { Router } from "express";
import { z } from "zod";
import { UserRole } from "../generated/prisma/enums.js";
import { applyManualInventoryAdjustmentBatchTracking } from "../lib/batchTracking.js";
import { writeOperationLog } from "../lib/inventory.js";
import { prisma } from "../lib/prisma.js";
import { toBigIntId, toNumber } from "../lib/serialize.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

const inventoryAdjustSchema = z.object({
  availableQty: z.coerce.number().min(0),
  borrowedQty: z.coerce.number().min(0),
  pendingQty: z.coerce.number().min(0),
  reason: z.string().trim().min(1).max(255),
});

router.get("/list", async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const where = search
      ? {
          item: {
            is: {
              OR: [
                { itemCode: { contains: search } },
                { name: { contains: search } },
                { specification: { contains: search } },
                { brand: { contains: search } },
              ],
            },
          },
        }
      : undefined;

    const rows = await prisma.inventory.findMany({
      where,
      include: {
        item: {
          include: {
            category: true,
            defaultSupplier: true,
          },
        },
        warehouse: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const data = rows.map((row) => ({
      ...row,
      status:
        toNumber(row.availableQty) <= 0
          ? "out_of_stock"
          : toNumber(row.availableQty) < toNumber(row.item.safeStock)
            ? "low_stock"
            : "normal",
    }));

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const inventoryId = toBigIntId(String(req.params.id));
    const data = inventoryAdjustSchema.parse(req.body);

    const inventory = await prisma.$transaction(async (tx) => {
      const existing = await tx.inventory.findUnique({
        where: { id: inventoryId },
        include: {
          item: {
            select: {
              id: true,
              itemCode: true,
              name: true,
              specification: true,
            },
          },
          warehouse: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!existing) {
        throw new Error("库存记录不存在");
      }

      await applyManualInventoryAdjustmentBatchTracking({
        tx,
        itemId: existing.item.id,
        warehouseId: existing.warehouse.id,
        operatorId: req.user!.id,
        reason: data.reason,
        before: {
          availableQty: toNumber(existing.availableQty),
          borrowedQty: toNumber(existing.borrowedQty),
          pendingQty: toNumber(existing.pendingQty),
        },
        after: {
          availableQty: data.availableQty,
          borrowedQty: data.borrowedQty,
          pendingQty: data.pendingQty,
        },
      });

      const updated = await tx.inventory.update({
        where: { id: inventoryId },
        data: {
          availableQty: data.availableQty,
          borrowedQty: data.borrowedQty,
          pendingQty: data.pendingQty,
        },
        include: {
          item: {
            include: {
              category: true,
              defaultSupplier: true,
            },
          },
          warehouse: true,
        },
      });

      await writeOperationLog(tx, req.user?.id, "inventory", "manual_adjust", "inventory", updated.id, {
        reason: data.reason,
        item: {
          id: existing.item.id.toString(),
          itemCode: existing.item.itemCode,
          name: existing.item.name,
          specification: existing.item.specification,
        },
        warehouse: {
          id: existing.warehouse.id.toString(),
          name: existing.warehouse.name,
        },
        before: {
          availableQty: existing.availableQty,
          borrowedQty: existing.borrowedQty,
          pendingQty: existing.pendingQty,
        },
        after: {
          availableQty: updated.availableQty,
          borrowedQty: updated.borrowedQty,
          pendingQty: updated.pendingQty,
        },
      });

      return {
        ...updated,
        status:
          toNumber(updated.availableQty) <= 0
            ? "out_of_stock"
            : toNumber(updated.availableQty) < toNumber(updated.item.safeStock)
              ? "low_stock"
              : "normal",
      };
    });

    res.json({ data: inventory });
  } catch (error) {
    next(error);
  }
});

export default router;
