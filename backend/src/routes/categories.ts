import { Router } from "express";
import { z } from "zod";
import { UserRole } from "../generated/prisma/enums.js";
import { requireRole } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { toBigIntId } from "../lib/serialize.js";

const router = Router();

const categorySchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
});

router.get("/", async (_req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
    });
    res.json({ data: categories });
  } catch (error) {
    next(error);
  }
});

router.get("/tree", async (_req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      where: { status: 1 },
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
    });
    const byId = new Map<string, (typeof categories)[number] & { children: unknown[] }>();
    const roots: Array<(typeof categories)[number] & { children: unknown[] }> = [];

    for (const category of categories) {
      byId.set(category.id.toString(), { ...category, children: [] });
    }

    for (const category of byId.values()) {
      if (category.parentId) {
        byId.get(category.parentId.toString())?.children.push(category);
      } else {
        roots.push(category);
      }
    }

    res.json({ data: roots });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const data = categorySchema.parse(req.body);
    const parentId = data.parentId ? toBigIntId(data.parentId) : null;
    const level = parentId ? 2 : 1;
    const category = await prisma.category.create({
      data: {
        name: data.name,
        parentId,
        level,
        sortOrder: data.sortOrder,
      },
    });

    res.status(201).json({ data: category });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const id = toBigIntId(String(req.params.id));
    const itemCount = await prisma.item.count({ where: { categoryId: id } });
    if (itemCount > 0) {
      res.status(409).json({ message: `该分类下还有 ${itemCount} 个物品，不能删除` });
      return;
    }
    await prisma.category.delete({ where: { id } });
    res.json({ data: { id: String(id) } });
  } catch (error) {
    next(error);
  }
});

export default router;
