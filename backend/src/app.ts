import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./env.js";
import { jsonReplacer } from "./lib/serialize.js";
import { notFound, errorHandler } from "./middleware/error.js";
import { requireAuth } from "./middleware/auth.js";
import authRouter from "./routes/auth.js";
import analyticsRouter from "./routes/analytics.js";
import categoriesRouter from "./routes/categories.js";
import dashboardRouter from "./routes/dashboard.js";
import inventoryRouter from "./routes/inventory.js";
import itemsRouter from "./routes/items.js";
import lossesRouter from "./routes/losses.js";
import purchaseListsRouter from "./routes/purchaseLists.js";
import purchaseRequestsRouter from "./routes/purchaseRequests.js";
import recoveriesRouter from "./routes/recoveries.js";
import stockInRouter from "./routes/stockIn.js";
import stockOutRouter from "./routes/stockOut.js";
import suppliersRouter from "./routes/suppliers.js";
import usersRouter from "./routes/users.js";

export function createApp() {
  const app = express();

  app.set("json replacer", jsonReplacer);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("dev"));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "mills-inventory-backend" });
  });

  app.use("/api/auth", authRouter);

  app.use("/api", requireAuth);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/suppliers", suppliersRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/items", itemsRouter);
  app.use("/api/inventory", inventoryRouter);
  app.use("/api/stock-in", stockInRouter);
  app.use("/api/stock-out", stockOutRouter);
  app.use("/api/recoveries", recoveriesRouter);
  app.use("/api/losses", lossesRouter);
  app.use("/api/purchase-requests", purchaseRequestsRouter);
  app.use("/api/purchase-lists", purchaseListsRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
