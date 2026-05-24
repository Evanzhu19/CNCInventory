import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { UserRole } from "../generated/prisma/enums.js";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";

export type AuthUser = {
  id: bigint;
  username: string;
  realName: string;
  role: UserRole;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

type JwtPayload = {
  sub: string;
  username: string;
  role: UserRole;
};

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

    if (!token) {
      res.status(401).json({ message: "未登录" });
      return;
    }

    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    const user = await prisma.user.findUnique({
      where: { id: BigInt(payload.sub) },
      select: { id: true, username: true, realName: true, role: true, status: true },
    });

    if (!user || user.status !== 1) {
      res.status(401).json({ message: "账号不可用" });
      return;
    }

    req.user = {
      id: user.id,
      username: user.username,
      realName: user.realName,
      role: user.role,
    };
    next();
  } catch {
    res.status(401).json({ message: "登录已失效" });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ message: "没有权限执行该操作" });
      return;
    }

    next();
  };
}

export function isProcurementManager(user: AuthUser | undefined) {
  return user?.role === UserRole.PROCUREMENT_MANAGER;
}

export function isAdmin(user: AuthUser | undefined) {
  return user?.role === UserRole.ADMIN;
}
