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
