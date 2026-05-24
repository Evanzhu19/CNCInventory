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

export default router;
