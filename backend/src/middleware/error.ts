import type { NextFunction, Request, Response } from "express";
import { Prisma } from "../generated/prisma/client.js";
import { ZodError } from "zod";

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ message: "接口不存在" });
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    res.status(400).json({
      message: "参数错误",
      issues: error.issues,
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      res.status(409).json({ message: "存在重复数据，请检查用户名、编码等唯一字段" });
      return;
    }

    if (error.code === "P2003") {
      res.status(400).json({ message: "存在无效的关联数据，请刷新页面后重试" });
      return;
    }

    if (error.code === "P2025") {
      res.status(404).json({ message: "目标记录不存在或已被删除" });
      return;
    }
  }

  if (error instanceof Error) {
    res.status(400).json({ message: error.message });
    return;
  }

  res.status(500).json({ message: "服务器内部错误" });
}
