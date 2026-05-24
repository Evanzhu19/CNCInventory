import { Router } from "express";
import { z } from "zod";
import { UserRole } from "../generated/prisma/enums.js";
import { requireRole } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

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

export default router;
