import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { UserRole } from "../generated/prisma/enums.js";
import { env } from "../env.js";
import { writeOperationLog } from "../lib/inventory.js";
import { prisma } from "../lib/prisma.js";
import { toBigIntId } from "../lib/serialize.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

const createUserSchema = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(8).max(100),
  realName: z.string().trim().min(1).max(50),
  role: z.nativeEnum(UserRole),
  status: z.coerce.number().int().min(0).max(1).default(1),
});

const updateUserSchema = z
  .object({
    username: z.string().trim().min(1).max(50).optional(),
    password: z.string().min(8).max(100).optional(),
    realName: z.string().trim().min(1).max(50).optional(),
    role: z.nativeEnum(UserRole).optional(),
    status: z.coerce.number().int().min(0).max(1).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "至少提供一个要更新的字段",
  });

function canManageRole(actorRole: UserRole, targetRole: UserRole) {
  if (actorRole === UserRole.ADMIN) {
    return true;
  }

  if (actorRole === UserRole.PROCUREMENT_MANAGER) {
    return targetRole === UserRole.CNC_SUPERVISOR;
  }

  return false;
}

async function ensureUniqueUsername(username: string, excludeId?: bigint) {
  const existing = await prisma.user.findFirst({
    where: {
      username,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    throw new Error("用户名已存在");
  }
}

router.get("/", requireRole(UserRole.ADMIN, UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const where =
      req.user?.role === UserRole.PROCUREMENT_MANAGER
        ? {
            role: UserRole.CNC_SUPERVISOR,
          }
        : undefined;

    const data = await prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        username: true,
        realName: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole(UserRole.ADMIN, UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const data = createUserSchema.parse(req.body);

    if (!canManageRole(req.user!.role, data.role)) {
      res.status(403).json({ message: "没有权限创建该角色用户" });
      return;
    }

    await ensureUniqueUsername(data.username);
    const passwordHash = await bcrypt.hash(data.password, env.BCRYPT_SALT_ROUNDS);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username: data.username,
          passwordHash,
          realName: data.realName,
          role: data.role,
          status: data.status,
        },
        select: {
          id: true,
          username: true,
          realName: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await writeOperationLog(tx, req.user?.id, "users", "create", "users", created.id, {
        username: created.username,
        realName: created.realName,
        role: created.role,
        status: created.status,
      });

      return created;
    });

    res.status(201).json({ data: user });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireRole(UserRole.ADMIN, UserRole.PROCUREMENT_MANAGER), async (req, res, next) => {
  try {
    const userId = toBigIntId(String(req.params.id));
    const data = updateUserSchema.parse(req.body);

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        realName: true,
        role: true,
        status: true,
      },
    });

    if (!existing) {
      res.status(404).json({ message: "用户不存在" });
      return;
    }

    if (!canManageRole(req.user!.role, existing.role)) {
      res.status(403).json({ message: "没有权限修改该用户" });
      return;
    }

    if (data.role && !canManageRole(req.user!.role, data.role)) {
      res.status(403).json({ message: "没有权限分配该角色" });
      return;
    }

    if (req.user!.id === existing.id && data.status === 0) {
      res.status(400).json({ message: "不能停用当前登录账号" });
      return;
    }

    if (req.user!.id === existing.id && data.role && data.role !== UserRole.ADMIN) {
      res.status(400).json({ message: "不能移除当前登录管理员角色" });
      return;
    }

    const normalizedUsername = data.username?.trim();
    if (normalizedUsername) {
      await ensureUniqueUsername(normalizedUsername, existing.id);
    }

    const passwordHash = data.password ? await bcrypt.hash(data.password, env.BCRYPT_SALT_ROUNDS) : undefined;

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          username: normalizedUsername,
          passwordHash,
          realName: data.realName?.trim(),
          role: data.role,
          status: data.status,
        },
        select: {
          id: true,
          username: true,
          realName: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await writeOperationLog(tx, req.user?.id, "users", "update", "users", updated.id, {
        before: {
          id: existing.id.toString(),
          username: existing.username,
          realName: existing.realName,
          role: existing.role,
          status: existing.status,
        },
        after: {
          id: updated.id.toString(),
          username: updated.username,
          realName: updated.realName,
          role: updated.role,
          status: updated.status,
          passwordUpdated: Boolean(passwordHash),
        },
      });

      return updated;
    });

    res.json({ data: user });
  } catch (error) {
    next(error);
  }
});

export default router;
