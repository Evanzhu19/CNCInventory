import { Router } from "express";
import { z } from "zod";
import { UserRole } from "../generated/prisma/enums.js";
import { requireRole } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { toBigIntId } from "../lib/serialize.js";

const router = Router();

const supplierSchema = z.object({
  name: z.string().min(1).max(100),
  contactPerson: z.string().max(50).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  channel: z.string().max(50).optional().nullable(),
  remark: z.string().optional().nullable(),
});

router.get("/", async (_req, res, next) => {
  try {
    const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
    res.json({ data: suppliers });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const data = supplierSchema.parse(req.body);
    const supplier = await prisma.supplier.create({ data });
    res.status(201).json({ data: supplier });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const id = toBigIntId(String(req.params.id));
    const data = supplierSchema.partial().parse(req.body);
    const supplier = await prisma.supplier.update({ where: { id }, data });
    res.json({ data: supplier });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireRole(UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const id = toBigIntId(String(req.params.id));
    const usageCount = await prisma.item.count({ where: { defaultSupplierId: id } });
    if (usageCount > 0) {
      res.status(409).json({ message: `该供应商已被 ${usageCount} 个物品引用，无法删除` });
      return;
    }
    await prisma.supplier.delete({ where: { id } });
    res.json({ message: "供应商已删除" });
  } catch (error) {
    next(error);
  }
});

export default router;
