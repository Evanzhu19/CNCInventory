import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

router.post("/login", async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { username: data.username } });

    if (!user || user.status !== 1) {
      res.status(401).json({ message: "用户名或密码错误" });
      return;
    }

    const ok = await bcrypt.compare(data.password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ message: "用户名或密码错误" });
      return;
    }

    const token = jwt.sign(
      {
        username: user.username,
        role: user.role,
      },
      env.JWT_SECRET,
      {
        subject: user.id.toString(),
        expiresIn: "8h",
      },
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        realName: user.realName,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ===== 统一登录（SSO）：信任 ERP 的登录态 =====
// 前端发现本系统未登录但浏览器里有 ERP token 时调用；
// 后端拿该 token 去 ERP /api/me 验证，通过后按映射角色 find-or-create 本地用户并签发本系统 JWT。
// 已存在的用户沿用本系统内的角色（本地管理员的调整优先于映射）。
const ssoSchema = z.object({ erpToken: z.string().min(10) });

const ERP_ROLE_MAP: Record<string, "GENERAL_MANAGER" | "PROCUREMENT_MANAGER" | "CNC_SUPERVISOR"> = {
  admin: "GENERAL_MANAGER", // ERP总经理 = 刀具系统总经理
  procurement: "PROCUREMENT_MANAGER",
  cnc_manager: "CNC_SUPERVISOR",
  finance: "GENERAL_MANAGER",
};

router.post("/sso", async (req, res, next) => {
  try {
    const { erpToken } = ssoSchema.parse(req.body);

    let erpUser: { username: string; name?: string; role: string } | null = null;
    try {
      const r = await fetch(`${env.ERP_BASE_URL}/api/me`, {
        headers: { Authorization: `Bearer ${erpToken}` },
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) {
        const body = (await r.json()) as { user?: { username: string; name?: string; role: string } };
        erpUser = body.user ?? null;
      }
    } catch {
      /* ERP 不可达或超时，按未登录处理 */
    }
    if (!erpUser) {
      res.status(401).json({ message: "ERP登录状态无效或已过期" });
      return;
    }

    const mappedRole = ERP_ROLE_MAP[erpUser.role];
    if (!mappedRole) {
      res.status(403).json({ message: "该ERP角色未开通刀具系统访问，请用刀具系统账号登录" });
      return;
    }

    let user = await prisma.user.findUnique({ where: { username: erpUser.username } });
    if (!user) {
      const unusableHash = await bcrypt.hash(`sso-${Date.now()}-${Math.random()}`, env.BCRYPT_SALT_ROUNDS);
      user = await prisma.user.create({
        data: {
          username: erpUser.username,
          realName: erpUser.name || erpUser.username,
          role: mappedRole,
          passwordHash: unusableHash,
          status: 1,
        },
      });
    }
    if (user.status !== 1) {
      res.status(403).json({ message: "该账号在刀具系统中已停用" });
      return;
    }

    const token = jwt.sign(
      { username: user.username, role: user.role },
      env.JWT_SECRET,
      { subject: user.id.toString(), expiresIn: "8h" },
    );
    res.json({
      token,
      user: { id: user.id, username: user.username, realName: user.realName, role: user.role },
    });
  } catch (error) {
    next(error);
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, "新密码至少6位"),
});

router.patch("/password", requireAuth, async (req, res, next) => {
  try {
    const data = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
      res.status(404).json({ message: "用户不存在" });
      return;
    }

    const ok = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!ok) {
      res.status(400).json({ message: "当前密码错误" });
      return;
    }

    const hash = await bcrypt.hash(data.newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
    res.json({ message: "密码已修改" });
  } catch (error) {
    next(error);
  }
});

export default router;
