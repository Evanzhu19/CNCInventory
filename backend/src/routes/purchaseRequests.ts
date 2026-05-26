import { Router } from "express";
import { z } from "zod";
import { PurchasePriority } from "../generated/prisma/enums.js";
import { UserRole } from "../generated/prisma/enums.js";
import { writeOperationLog } from "../lib/inventory.js";
import { prisma } from "../lib/prisma.js";
import { addDuplicateLineIssue, findDuplicateIndexes } from "../lib/requestGuards.js";
import { isProcurementManager, requireRole } from "../middleware/auth.js";
import { toBigIntId } from "../lib/serialize.js";

const router = Router();

const purchaseRequestSchema = z.object({
  priority: z.nativeEnum(PurchasePriority).default(PurchasePriority.MEDIUM),
  remark: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        itemId: z.string().optional().nullable(),
        requestedName: z.string().min(1).max(100),
        requestedSpecification: z.string().max(200).optional().nullable(),
        requestedBrand: z.string().max(100).optional().nullable(),
        requestedUnit: z.string().max(20).optional().nullable(),
        requestedQty: z.coerce.number().int().positive(),
        reason: z.string().max(255).optional().nullable(),
      }),
    )
    .min(1),
}).superRefine((data, ctx) => {
  const duplicateIndexes = findDuplicateIndexes(
    data.items.map((item) => (item.itemId ? `item:${item.itemId}` : "")),
  );

  for (const index of duplicateIndexes) {
    addDuplicateLineIssue(ctx, ["items", index, "itemId"], "同一物品不能在同一张采购申请里重复出现");
  }
});

const dateRangeQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(["PENDING", "MERGED", "PURCHASED", "CANCELLED"]).optional(),
});

router.get("/", requireRole(UserRole.CNC_SUPERVISOR, UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const { startDate, endDate, status } = dateRangeQuerySchema.parse(req.query);
    const baseWhere = isProcurementManager(req.user) ? {} : { requesterId: req.user!.id };
    const where = {
      ...baseWhere,
      ...(status ? { status } : {}),
      ...(startDate || endDate ? {
        requestTime: {
          ...(startDate ? { gte: new Date(`${startDate}T00:00:00.000`) } : {}),
          ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999`) } : {}),
        },
      } : {}),
    };
    const data = await prisma.purchaseRequest.findMany({
      where,
      orderBy: { requestTime: "desc" },
      include: {
        requester: { select: { id: true, realName: true } },
        items: {
          include: {
            item: true,
            purchaseListLinks: {
              take: 1,
              include: {
                purchaseListItem: {
                  include: {
                    purchaseList: {
                      select: { id: true, listNo: true, status: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole(UserRole.CNC_SUPERVISOR, UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const data = purchaseRequestSchema.parse(req.body);
    const requestNo = `PR-${Date.now()}`;

    const purchaseRequest = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseRequest.create({
        data: {
          requestNo,
          requesterId: req.user!.id,
          priority: data.priority,
          requestTime: new Date(),
          remark: data.remark,
          items: {
            create: data.items.map((item) => ({
              itemId: item.itemId ? toBigIntId(item.itemId) : null,
              requestedName: item.requestedName,
              requestedSpecification: item.requestedSpecification,
              requestedBrand: item.requestedBrand,
              requestedUnit: item.requestedUnit,
              requestedQty: item.requestedQty,
              reason: item.reason,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      await writeOperationLog(tx, req.user?.id, "purchase_request", "create", "purchase_requests", created.id, {
        requestNo,
        itemCount: data.items.length,
      });

      return created;
    });

    res.status(201).json({ data: purchaseRequest });
  } catch (error) {
    next(error);
  }
});

router.delete(
  "/:id",
  requireRole(UserRole.CNC_SUPERVISOR, UserRole.PROCUREMENT_MANAGER),
  async (req, res, next) => {
    try {
      const requestId = toBigIntId(String(req.params.id));

      await prisma.$transaction(async (tx) => {
        const existing = await tx.purchaseRequest.findUnique({
          where: { id: requestId },
          include: { items: { select: { id: true } } },
        });

        if (!existing) {
          throw new Error("采购申请不存在");
        }

        if (!isProcurementManager(req.user) && existing.requesterId !== req.user!.id) {
          throw new Error("只能删除自己提交的采购申请");
        }

        if (existing.status !== "PENDING") {
          throw new Error("只能删除待处理状态的采购申请");
        }

        // Safety check: block deletion if any linked purchase list is still active.
        // Under normal flow the cancel path deletes junction rows; these only exist if cancel was incomplete.
        const itemIds = existing.items.map((i) => i.id);
        const links = await tx.purchaseListRequestItem.findMany({
          where: { purchaseRequestItemId: { in: itemIds } },
          select: { purchaseListItem: { select: { purchaseListId: true } } },
        });
        if (links.length > 0) {
          const linkedListIds = [...new Set(links.map((l) => l.purchaseListItem.purchaseListId))];
          const linkedLists = await tx.purchaseList.findMany({
            where: { id: { in: linkedListIds } },
            select: { id: true, status: true },
          });
          if (linkedLists.some((l) => l.status !== "CANCELLED")) {
            throw new Error("采购申请已被汇总到采购清单，无法删除");
          }
          await tx.purchaseListRequestItem.deleteMany({
            where: { purchaseRequestItemId: { in: itemIds } },
          });
        }

        await tx.purchaseRequestItem.deleteMany({ where: { purchaseRequestId: requestId } });
        await tx.purchaseRequest.delete({ where: { id: requestId } });

        await writeOperationLog(tx, req.user?.id, "purchase_request", "delete", "purchase_requests", requestId, {
          requestNo: existing.requestNo,
        });
      });

      res.json({ message: "采购申请已删除" });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
