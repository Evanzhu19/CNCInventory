import { Router } from "express";
import { z } from "zod";
import { UserRole } from "../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/", requireRole(UserRole.ADMIN, UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const query = z.object({
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(200).default(50),
      module: z.string().optional(),
      userId: z.string().optional(),
    }).parse(req.query);

    const where = {
      ...(query.module ? { module: query.module } : {}),
      ...(query.userId ? { userId: BigInt(query.userId) } : {}),
    };

    const [total, data] = await Promise.all([
      prisma.operationLog.count({ where }),
      prisma.operationLog.findMany({
        where,
        take: query.pageSize,
        skip: (query.page - 1) * query.pageSize,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, realName: true } } },
      }),
    ]);

    res.json({
      data,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
