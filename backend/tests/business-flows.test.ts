import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { Express } from "express";
import * as mariadb from "mariadb";
import request from "supertest";
import type { PrismaClient } from "../src/generated/prisma/client.js";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDatabaseName = "tooling_inventory_business_test";
const testDatabaseUrl = `mysql://tooling_user:tooling_password@127.0.0.1:3306/${testDatabaseName}`;

const testEnv = {
  ...process.env,
  DATABASE_URL: testDatabaseUrl,
  JWT_SECRET: "business-test-super-secret-1234567890",
  CORS_ORIGIN: "http://localhost:5173",
  BCRYPT_SALT_ROUNDS: "4",
  HOST: "127.0.0.1",
  PORT: "4100",
  INITIAL_ADMIN_USERNAME: "admin_test",
  INITIAL_ADMIN_PASSWORD: "AdminTest#123",
  INITIAL_ADMIN_REAL_NAME: "测试管理员",
};

Object.assign(process.env, testEnv);

const rootConnectionConfig = {
  host: "127.0.0.1",
  port: 3306,
  user: "root",
  password: "root_password",
  allowPublicKeyRetrieval: true,
};

let app: Express;
let prisma: PrismaClient;
let itemSequence = 0;

function commandOutput(error: unknown) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const execError = error as Error & { stdout?: Buffer; stderr?: Buffer };
  const stdout = execError.stdout?.toString() ?? "";
  const stderr = execError.stderr?.toString() ?? "";
  return [error.message, stdout, stderr].filter(Boolean).join("\n");
}

function runBackendCommand(args: string[]) {
  try {
    execFileSync("npm", args, {
      cwd: backendDir,
      env: testEnv,
      stdio: "pipe",
    });
  } catch (error) {
    throw new Error(`Command failed: npm ${args.join(" ")}\n${commandOutput(error)}`);
  }
}

async function withRootConnection<T>(callback: (connection: mariadb.Connection) => Promise<T>) {
  const connection = await mariadb.createConnection(rootConnectionConfig);

  try {
    return await callback(connection);
  } finally {
    await connection.end();
  }
}

async function recreateDatabase() {
  await withRootConnection(async (connection) => {
    await connection.query(`DROP DATABASE IF EXISTS \`${testDatabaseName}\``);
    await connection.query(
      `CREATE DATABASE \`${testDatabaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await connection.query(
      `GRANT ALL PRIVILEGES ON \`${testDatabaseName}\`.* TO 'tooling_user'@'%'`,
    );
    await connection.query("FLUSH PRIVILEGES");
  });

  runBackendCommand(["exec", "--", "prisma", "migrate", "deploy"]);
  runBackendCommand(["run", "db:seed"]);
}

async function resetDatabase() {
  if (prisma) {
    await prisma.$disconnect();
  }

  await recreateDatabase();
  itemSequence = 0;

  if (prisma) {
    await prisma.user.count();
  }
}

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function currentAnchorMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}`;
}

function isoInCurrentMonth(day: number, hour = 12) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), day, hour, 0, 0, 0).toISOString();
}

async function login(username: string, password: string) {
  const response = await request(app).post("/api/auth/login").send({ username, password });
  assert.equal(response.status, 200, response.text);
  assert.ok(response.body.token);
  return response.body.token as string;
}

async function createManagedUser(
  token: string,
  payload: {
    username: string;
    password: string;
    realName: string;
    role: "ADMIN" | "CNC_SUPERVISOR" | "PROCUREMENT_MANAGER" | "GENERAL_MANAGER";
    status?: number;
  },
) {
  const response = await request(app)
    .post("/api/users")
    .set("authorization", `Bearer ${token}`)
    .send({
      ...payload,
      status: payload.status ?? 1,
    });

  assert.equal(response.status, 201, response.text);
  return response.body.data as { id: string; username: string; role: string; status: number };
}

async function provisionBusinessUsers(adminToken: string) {
  await createManagedUser(adminToken, {
    username: "cnc_test",
    password: "CncTest#123",
    realName: "测试CNC主管",
    role: "CNC_SUPERVISOR",
  });
  await createManagedUser(adminToken, {
    username: "proc_test",
    password: "ProcTest#123",
    realName: "测试采购主管",
    role: "PROCUREMENT_MANAGER",
  });
  await createManagedUser(adminToken, {
    username: "gm_test",
    password: "GmTest#123",
    realName: "测试总经理",
    role: "GENERAL_MANAGER",
  });
}

async function loginAsAllRoles() {
  const adminToken = await login("admin_test", "AdminTest#123");
  await provisionBusinessUsers(adminToken);

  const [cncToken, procurementToken, gmToken] = await Promise.all([
    login("cnc_test", "CncTest#123"),
    login("proc_test", "ProcTest#123"),
    login("gm_test", "GmTest#123"),
  ]);

  return {
    adminToken,
    cncToken,
    procurementToken,
    gmToken,
  };
}

async function getSubCategoryId(name: string) {
  const category = await prisma.category.findFirst({
    where: {
      name,
      level: 2,
    },
    select: {
      id: true,
    },
  });

  assert.ok(category, `Category not found: ${name}`);
  return category.id.toString();
}

async function createItem(
  token: string,
  overrides: Partial<{
    itemCode: string;
    name: string;
    specification: string;
    brand: string;
    categoryName: string;
    unit: string;
    trackingMode: "CLOSED_LOOP" | "CONSUMABLE";
    safeStock: number;
    defaultSupplierName: string;
    remark: string;
  }> = {},
) {
  itemSequence += 1;
  const categoryId = await getSubCategoryId(overrides.categoryName ?? "铣刀");
  const response = await request(app)
    .post("/api/items")
    .set("authorization", `Bearer ${token}`)
    .send({
      itemCode: overrides.itemCode ?? `QA-ITEM-${itemSequence}`,
      name: overrides.name ?? `测试物品-${itemSequence}`,
      specification: overrides.specification ?? "D10",
      brand: overrides.brand ?? "OSG",
      categoryId,
      unit: overrides.unit ?? "支",
      trackingMode: overrides.trackingMode ?? "CLOSED_LOOP",
      safeStock: overrides.safeStock ?? 2,
      defaultSupplierName: overrides.defaultSupplierName ?? null,
      remark: overrides.remark ?? "business-flow-test",
    });

  assert.equal(response.status, 201, response.text);
  return response.body.data as { id: string; itemCode: string; name: string };
}

async function createStockIn(
  token: string,
  payload: {
    supplierName: string;
    inTime?: string;
    remark?: string;
    items: Array<{
      itemId: string;
      qty: number;
      unitPrice: number;
      purchaseChannel?: string | null;
      remark?: string | null;
    }>;
  },
) {
  const response = await request(app)
    .post("/api/stock-in")
    .set("authorization", `Bearer ${token}`)
    .send(payload);

  assert.equal(response.status, 201, response.text);
  return response.body.data as {
    id: string;
    items: Array<{ id: string; itemId: string; qty: string; unitPrice: string }>;
  };
}

async function fetchInventoryByItemId(itemId: string) {
  const inventory = await prisma.inventory.findFirst({
    where: { itemId: BigInt(itemId) },
    include: {
      item: true,
    },
  });
  assert.ok(inventory, `Inventory not found for item ${itemId}`);
  return inventory;
}

before(async () => {
  await recreateDatabase();
  const appModule = await import("../src/app.ts");
  const prismaModule = await import("../src/lib/prisma.ts");
  app = appModule.createApp();
  prisma = prismaModule.prisma;
  await prisma.user.count();
});

after(async () => {
  if (prisma) {
    await prisma.$disconnect();
  }

  await withRootConnection(async (connection) => {
    await connection.query(`DROP DATABASE IF EXISTS \`${testDatabaseName}\``);
  });
});

test("Business acceptance regression flows", async (t) => {
  await t.test("admin bootstrap and user management permissions behave as expected", async () => {
    await resetDatabase();
    const adminToken = await login("admin_test", "AdminTest#123");

    const usersByAdmin = await request(app)
      .get("/api/users")
      .set("authorization", `Bearer ${adminToken}`);
    assert.equal(usersByAdmin.status, 200, usersByAdmin.text);
    assert.equal(usersByAdmin.body.data.length, 1);
    assert.equal(usersByAdmin.body.data[0].role, "ADMIN");

    await createManagedUser(adminToken, {
      username: "proc_test",
      password: "ProcTest#123",
      realName: "测试采购主管",
      role: "PROCUREMENT_MANAGER",
    });
    await createManagedUser(adminToken, {
      username: "gm_test",
      password: "GmTest#123",
      realName: "测试总经理",
      role: "GENERAL_MANAGER",
    });
    await createManagedUser(adminToken, {
      username: "cnc_test",
      password: "CncTest#123",
      realName: "测试CNC主管",
      role: "CNC_SUPERVISOR",
    });

    const [cncToken, procurementToken, gmToken] = await Promise.all([
      login("cnc_test", "CncTest#123"),
      login("proc_test", "ProcTest#123"),
      login("gm_test", "GmTest#123"),
    ]);

    const unauthenticated = await request(app).get("/api/inventory/list");
    assert.equal(unauthenticated.status, 401);

    const usersByProcurement = await request(app)
      .get("/api/users")
      .set("authorization", `Bearer ${procurementToken}`);
    assert.equal(usersByProcurement.status, 200, usersByProcurement.text);
    assert.equal(usersByProcurement.body.data.length, 1);
    assert.equal(usersByProcurement.body.data[0].role, "CNC_SUPERVISOR");

    const secondCncByProcurement = await request(app)
      .post("/api/users")
      .set("authorization", `Bearer ${procurementToken}`)
      .send({
        username: "cnc_second",
        password: "CncSecond#123",
        realName: "第二个CNC主管",
        role: "CNC_SUPERVISOR",
      });
    assert.equal(secondCncByProcurement.status, 201, secondCncByProcurement.text);

    const generalManagerByProcurement = await request(app)
      .post("/api/users")
      .set("authorization", `Bearer ${procurementToken}`)
      .send({
        username: "gm_second",
        password: "GmSecond#123",
        realName: "第二个总经理",
        role: "GENERAL_MANAGER",
      });
    assert.equal(generalManagerByProcurement.status, 403);

    const usersByCnc = await request(app)
      .get("/api/users")
      .set("authorization", `Bearer ${cncToken}`);
    assert.equal(usersByCnc.status, 403);

    const inventory = await request(app)
      .get("/api/inventory/list")
      .set("authorization", `Bearer ${procurementToken}`);
    assert.equal(inventory.status, 200, inventory.text);

    const analyticsByAdmin = await request(app)
      .get("/api/analytics/report")
      .set("authorization", `Bearer ${adminToken}`);
    assert.equal(analyticsByAdmin.status, 403);

    const analyticsByCnc = await request(app)
      .get("/api/analytics/report")
      .set("authorization", `Bearer ${cncToken}`);
    assert.equal(analyticsByCnc.status, 403);

    const analyticsByGm = await request(app)
      .get("/api/analytics/report")
      .set("authorization", `Bearer ${gmToken}`);
    assert.equal(analyticsByGm.status, 200, analyticsByGm.text);

    const stockInByGm = await request(app)
      .get("/api/stock-in")
      .set("authorization", `Bearer ${gmToken}`);
    assert.equal(stockInByGm.status, 403);

    const stockInByAdmin = await request(app)
      .get("/api/stock-in")
      .set("authorization", `Bearer ${adminToken}`);
    assert.equal(stockInByAdmin.status, 403);
  });

  await t.test("item creation supports supplier input and inventory search works across code/spec/brand", async () => {
    await resetDatabase();
    const { procurementToken } = await loginAsAllRoles();

    const createdItem = await createItem(procurementToken, {
      itemCode: "EM-001",
      name: "平刀测试",
      specification: "D10*75",
      brand: "OSG",
      defaultSupplierName: "新供应商A",
    });

    const itemListByCode = await request(app)
      .get("/api/inventory/list")
      .query({ search: "EM-001" })
      .set("authorization", `Bearer ${procurementToken}`);
    assert.equal(itemListByCode.status, 200, itemListByCode.text);
    assert.equal(itemListByCode.body.data.length, 1);
    assert.equal(itemListByCode.body.data[0].item.id, createdItem.id);

    const itemListBySpec = await request(app)
      .get("/api/inventory/list")
      .query({ search: "D10*75" })
      .set("authorization", `Bearer ${procurementToken}`);
    assert.equal(itemListBySpec.status, 200, itemListBySpec.text);
    assert.equal(itemListBySpec.body.data[0].item.id, createdItem.id);

    const itemListByBrand = await request(app)
      .get("/api/inventory/list")
      .query({ search: "OSG" })
      .set("authorization", `Bearer ${procurementToken}`);
    assert.equal(itemListByBrand.status, 200, itemListByBrand.text);
    assert.equal(itemListByBrand.body.data[0].item.id, createdItem.id);

    const supplier = await prisma.supplier.findFirst({
      where: {
        name: "新供应商A",
      },
    });
    assert.ok(supplier);
  });

  await t.test("latest stock-in price and supplier become item purchase defaults", async () => {
    await resetDatabase();
    const { procurementToken } = await loginAsAllRoles();
    const item = await createItem(procurementToken, {
      itemCode: "BT-001",
      name: "刀柄测试",
      categoryName: "刀柄",
    });

    await createStockIn(procurementToken, {
      supplierName: "供应商甲",
      inTime: isoInCurrentMonth(5, 10),
      items: [
        {
          itemId: item.id,
          qty: 10,
          unitPrice: 45.5,
          purchaseChannel: "1688",
        },
      ],
    });

    let refreshedItem = await prisma.item.findUnique({
      where: { id: BigInt(item.id) },
      include: { defaultSupplier: true },
    });
    assert.ok(refreshedItem);
    assert.equal(toNumber(refreshedItem.defaultPrice), 45.5);

    const latestStockIn = await createStockIn(procurementToken, {
      supplierName: "供应商乙",
      inTime: isoInCurrentMonth(8, 11),
      items: [
        {
          itemId: item.id,
          qty: 6,
          unitPrice: 50,
          purchaseChannel: "淘宝",
        },
      ],
    });

    refreshedItem = await prisma.item.findUnique({
      where: { id: BigInt(item.id) },
      include: { defaultSupplier: true },
    });
    assert.ok(refreshedItem);
    assert.equal(toNumber(refreshedItem.defaultPrice), 50);

    const latestItemRow = latestStockIn.items[0];
    assert.ok(latestItemRow);
    const updatedStockIn = await request(app)
      .patch(`/api/stock-in/${latestStockIn.id}`)
      .set("authorization", `Bearer ${procurementToken}`)
      .send({
        supplierName: "供应商丙",
        items: [
          {
            id: latestItemRow.id,
            unitPrice: 52,
            purchaseChannel: "线下",
            remark: "补录议价",
          },
        ],
        remark: "修正最近入库价格",
      });
    assert.equal(updatedStockIn.status, 200, updatedStockIn.text);

    refreshedItem = await prisma.item.findUnique({
      where: { id: BigInt(item.id) },
      include: { defaultSupplier: true },
    });
    assert.ok(refreshedItem);
    assert.equal(toNumber(refreshedItem.defaultPrice), 52);

    const itemDetail = await request(app)
      .get(`/api/items/${item.id}`)
      .set("authorization", `Bearer ${procurementToken}`);
    assert.equal(itemDetail.status, 200, itemDetail.text);
    assert.equal(toNumber(itemDetail.body.data.priceSummary.latestPrice), 52);
    assert.equal(itemDetail.body.data.priceSummary.latestSupplier, "供应商丙");
  });

  await t.test("purchase request -> purchase list -> partial stock-in keeps statuses consistent", async () => {
    await resetDatabase();
    const { cncToken, procurementToken } = await loginAsAllRoles();
    const item = await createItem(procurementToken, {
      itemCode: "PL-001",
      name: "采购清单测试刀具",
      categoryName: "铣刀",
    });

    const purchaseRequestResponse = await request(app)
      .post("/api/purchase-requests")
      .set("authorization", `Bearer ${cncToken}`)
      .send({
        priority: "HIGH",
        remark: "生产急需",
        items: [
          {
            itemId: item.id,
            requestedName: "采购清单测试刀具",
            requestedSpecification: "D10",
            requestedBrand: "OSG",
            requestedUnit: "支",
            requestedQty: 10,
            reason: "订单生产",
          },
        ],
      });
    assert.equal(purchaseRequestResponse.status, 201, purchaseRequestResponse.text);
    const purchaseRequestId = purchaseRequestResponse.body.data.id as string;

    const purchaseListResponse = await request(app)
      .post("/api/purchase-lists")
      .set("authorization", `Bearer ${procurementToken}`)
      .send({
        purchaseRequestIds: [purchaseRequestId],
        remark: "整合成采购清单",
      });
    assert.equal(purchaseListResponse.status, 201, purchaseListResponse.text);
    const purchaseListId = purchaseListResponse.body.data.id as string;
    const purchaseListItem = purchaseListResponse.body.data.items[0];
    assert.ok(purchaseListItem);

    const patchPurchaseList = await request(app)
      .patch(`/api/purchase-lists/${purchaseListId}`)
      .set("authorization", `Bearer ${procurementToken}`)
      .send({
        remark: "已下单",
        items: [
          {
            id: purchaseListItem.id,
            status: "ORDERED",
            referencePrice: 12.8,
            supplierName: "采购供应商A",
            remark: "第一批安排到货",
          },
        ],
      });
    assert.equal(patchPurchaseList.status, 200, patchPurchaseList.text);

    const firstArrival = await request(app)
      .post(`/api/purchase-lists/${purchaseListId}/stock-in`)
      .set("authorization", `Bearer ${procurementToken}`)
      .send({
        supplierName: "采购供应商A",
        inTime: isoInCurrentMonth(10, 9),
        items: [
          {
            purchaseListItemId: purchaseListItem.id,
            qty: 4,
            unitPrice: 12.8,
            purchaseChannel: "1688",
          },
        ],
      });
    assert.equal(firstArrival.status, 201, firstArrival.text);

    let currentPurchaseList = await prisma.purchaseList.findUnique({
      where: { id: BigInt(purchaseListId) },
      include: { items: true },
    });
    let currentPurchaseRequest = await prisma.purchaseRequest.findUnique({
      where: { id: BigInt(purchaseRequestId) },
    });
    assert.ok(currentPurchaseList);
    assert.ok(currentPurchaseRequest);
    assert.equal(currentPurchaseList.status, "ARRIVED");
    assert.equal(currentPurchaseList.items[0]?.status, "ARRIVED");
    assert.equal(currentPurchaseRequest.status, "MERGED");

    const secondArrival = await request(app)
      .post(`/api/purchase-lists/${purchaseListId}/stock-in`)
      .set("authorization", `Bearer ${procurementToken}`)
      .send({
        supplierName: "采购供应商A",
        inTime: isoInCurrentMonth(12, 10),
        items: [
          {
            purchaseListItemId: purchaseListItem.id,
            qty: 6,
            unitPrice: 12.5,
            purchaseChannel: "1688",
          },
        ],
      });
    assert.equal(secondArrival.status, 201, secondArrival.text);

    currentPurchaseList = await prisma.purchaseList.findUnique({
      where: { id: BigInt(purchaseListId) },
      include: { items: true },
    });
    currentPurchaseRequest = await prisma.purchaseRequest.findUnique({
      where: { id: BigInt(purchaseRequestId) },
    });
    assert.ok(currentPurchaseList);
    assert.ok(currentPurchaseRequest);
    assert.equal(currentPurchaseList.status, "COMPLETED");
    assert.equal(currentPurchaseList.items[0]?.status, "STOCKED_IN");
    assert.equal(currentPurchaseRequest.status, "PURCHASED");

    const inventory = await fetchInventoryByItemId(item.id);
    assert.equal(toNumber(inventory.availableQty), 10);
  });

  await t.test("closed-loop stock batches drive exact usage, recovery, loss, and analytics attribution", async () => {
    await resetDatabase();
    const { procurementToken, gmToken } = await loginAsAllRoles();
    const item = await createItem(procurementToken, {
      itemCode: "BATCH-001",
      name: "批次分析测试刀具",
      categoryName: "铣刀",
      trackingMode: "CLOSED_LOOP",
    });

    const firstBatch = await createStockIn(procurementToken, {
      supplierName: "供应商A",
      inTime: isoInCurrentMonth(3, 10),
      items: [
        {
          itemId: item.id,
          qty: 5,
          unitPrice: 10,
          purchaseChannel: "1688",
        },
      ],
    });
    const secondBatch = await createStockIn(procurementToken, {
      supplierName: "供应商B",
      inTime: isoInCurrentMonth(7, 10),
      items: [
        {
          itemId: item.id,
          qty: 3,
          unitPrice: 20,
          purchaseChannel: "淘宝",
        },
      ],
    });

    const stockOutResponse = await request(app)
      .post("/api/stock-out")
      .set("authorization", `Bearer ${procurementToken}`)
      .send({
        receiverName: "张三",
        department: "CNC",
        purpose: "加工订单A",
        outTime: isoInCurrentMonth(9, 11),
        items: [{ itemId: item.id, qty: 6 }],
      });
    assert.equal(stockOutResponse.status, 201, stockOutResponse.text);

    const stockOutItem = await prisma.stockOutItem.findFirst({
      where: {
        stockOutId: BigInt(stockOutResponse.body.data.id),
      },
      include: {
        batchAllocations: {
          orderBy: { id: "asc" },
        },
      },
    });
    assert.ok(stockOutItem);
    assert.equal(stockOutItem.batchAllocations.length, 2);
    assert.deepEqual(
      stockOutItem.batchAllocations.map((row) => ({
        stockInItemId: row.stockInItemId.toString(),
        qty: toNumber(row.qty),
      })),
      [
        { stockInItemId: firstBatch.items[0]?.id, qty: 5 },
        { stockInItemId: secondBatch.items[0]?.id, qty: 1 },
      ],
    );

    const recoveryResponse = await request(app)
      .post("/api/recoveries")
      .set("authorization", `Bearer ${procurementToken}`)
      .send({
        itemId: item.id,
        relatedStockOutItemId: stockOutItem.id.toString(),
        qty: 2,
        returnedBy: "张三",
        recoveryTime: isoInCurrentMonth(11, 10),
        recoveryStatus: "REUSABLE",
      });
    assert.equal(recoveryResponse.status, 201, recoveryResponse.text);

    const lossResponse = await request(app)
      .post("/api/losses")
      .set("authorization", `Bearer ${procurementToken}`)
      .send({
        itemId: item.id,
        qty: 1,
        lossType: "BROKEN",
        sourceBucket: "BORROWED",
        relatedStockOutItemId: stockOutItem.id.toString(),
        responsiblePerson: "张三",
        recordTime: isoInCurrentMonth(13, 14),
      });
    assert.equal(lossResponse.status, 201, lossResponse.text);

    const inventory = await fetchInventoryByItemId(item.id);
    assert.equal(toNumber(inventory.availableQty), 4);
    assert.equal(toNumber(inventory.borrowedQty), 3);
    assert.equal(toNumber(inventory.pendingQty), 0);

    const reportResponse = await request(app)
      .get("/api/analytics/report")
      .query({
        range: "month",
        anchorMonth: currentAnchorMonth(),
        itemPage: 1,
        itemPageSize: 20,
        sourcePage: 1,
        sourcePageSize: 20,
      })
      .set("authorization", `Bearer ${gmToken}`);
    assert.equal(reportResponse.status, 200, reportResponse.text);

    const report = reportResponse.body;
    assert.equal(report.totals.stockInQty, 8);
    assert.equal(report.totals.stockOutQty, 6);
    assert.equal(report.totals.recoveryQty, 2);
    assert.equal(report.totals.lossQty, 1);
    assert.equal(report.totals.netUsageQty, 4);

    const sourceRows = report.sourceAnalysis.data as Array<{
      supplierName: string | null;
      purchaseChannel: string | null;
      attributedUsageQty: number;
      attributedRecoveryQty: number;
      attributedLossQty: number;
      netUsageQty: number;
      lossRate: number;
    }>;

    const supplierA = sourceRows.find(
      (row) => row.supplierName === "供应商A" && row.purchaseChannel === "1688",
    );
    const supplierB = sourceRows.find(
      (row) => row.supplierName === "供应商B" && row.purchaseChannel === "淘宝",
    );

    assert.deepEqual(supplierA, {
      supplierName: "供应商A",
      purchaseChannel: "1688",
      purchasedQty: 5,
      purchasedAmount: 50,
      attributedUsageQty: 5,
      attributedRecoveryQty: 2,
      attributedLossQty: 1,
      netUsageQty: 3,
      lossRate: 20,
    });
    assert.deepEqual(supplierB, {
      supplierName: "供应商B",
      purchaseChannel: "淘宝",
      purchasedQty: 3,
      purchasedAmount: 60,
      attributedUsageQty: 1,
      attributedRecoveryQty: 0,
      attributedLossQty: 0,
      netUsageQty: 1,
      lossRate: 0,
    });

    const historyResponse = await request(app)
      .get("/api/analytics/history")
      .query({
        range: "month",
        anchorMonth: currentAnchorMonth(),
        type: "stock_out",
        page: 1,
        pageSize: 1,
      })
      .set("authorization", `Bearer ${gmToken}`);
    assert.equal(historyResponse.status, 200, historyResponse.text);
    assert.equal(historyResponse.body.pagination.total, 1);
    assert.equal(historyResponse.body.data.length, 1);
  });

  await t.test("purchase list references pull latest stock-in price and supplier", async () => {
    await resetDatabase();
    const { cncToken, procurementToken } = await loginAsAllRoles();
    const item = await createItem(procurementToken, {
      itemCode: "REF-001",
      name: "参考价测试刀具",
    });

    await createStockIn(procurementToken, {
      supplierName: "历史供应商",
      inTime: isoInCurrentMonth(6, 9),
      items: [
        {
          itemId: item.id,
          qty: 7,
          unitPrice: 18,
          purchaseChannel: "京东",
        },
      ],
    });

    const purchaseRequestResponse = await request(app)
      .post("/api/purchase-requests")
      .set("authorization", `Bearer ${cncToken}`)
      .send({
        items: [
          {
            itemId: item.id,
            requestedName: "参考价测试刀具",
            requestedSpecification: "D10",
            requestedBrand: "OSG",
            requestedUnit: "支",
            requestedQty: 3,
            reason: "补货",
          },
        ],
      });
    assert.equal(purchaseRequestResponse.status, 201, purchaseRequestResponse.text);

    const purchaseListResponse = await request(app)
      .post("/api/purchase-lists")
      .set("authorization", `Bearer ${procurementToken}`)
      .send({
        purchaseRequestIds: [purchaseRequestResponse.body.data.id],
      });
    assert.equal(purchaseListResponse.status, 201, purchaseListResponse.text);

    const generatedItem = purchaseListResponse.body.data.items[0];
    assert.ok(generatedItem);
    assert.equal(toNumber(generatedItem.referencePrice), 18);
  });

  await t.test("consumable stock does not create borrowed balance and cannot be recovered", async () => {
    await resetDatabase();
    const { procurementToken } = await loginAsAllRoles();
    const item = await createItem(procurementToken, {
      itemCode: "CON-001",
      name: "消耗品测试",
      trackingMode: "CONSUMABLE",
      categoryName: "丝攻",
    });

    await createStockIn(procurementToken, {
      supplierName: "消耗品供应商",
      inTime: isoInCurrentMonth(4, 9),
      items: [
        {
          itemId: item.id,
          qty: 10,
          unitPrice: 6.6,
          purchaseChannel: "线下",
        },
      ],
    });

    const stockOutResponse = await request(app)
      .post("/api/stock-out")
      .set("authorization", `Bearer ${procurementToken}`)
      .send({
        receiverName: "李四",
        department: "CNC",
        purpose: "消耗品领用",
        outTime: isoInCurrentMonth(8, 15),
        items: [{ itemId: item.id, qty: 4 }],
      });
    assert.equal(stockOutResponse.status, 201, stockOutResponse.text);

    const inventory = await fetchInventoryByItemId(item.id);
    assert.equal(toNumber(inventory.availableQty), 6);
    assert.equal(toNumber(inventory.borrowedQty), 0);

    const recoveryResponse = await request(app)
      .post("/api/recoveries")
      .set("authorization", `Bearer ${procurementToken}`)
      .send({
        itemId: item.id,
        qty: 1,
        returnedBy: "李四",
        recoveryTime: isoInCurrentMonth(9, 11),
        recoveryStatus: "REUSABLE",
      });
    assert.equal(recoveryResponse.status, 400);
    assert.match(recoveryResponse.body.message, /消耗品不支持回收/);
  });

  await t.test("weird duplicate or inconsistent requests are rejected before they can pollute data", async () => {
    await resetDatabase();
    const { procurementToken } = await loginAsAllRoles();
    const firstItem = await createItem(procurementToken, {
      itemCode: "GUARD-001",
      name: "防呆测试一号",
    });
    const secondItem = await createItem(procurementToken, {
      itemCode: "GUARD-002",
      name: "防呆测试二号",
    });

    const duplicateStockIn = await request(app)
      .post("/api/stock-in")
      .set("authorization", `Bearer ${procurementToken}`)
      .send({
        supplierName: "防呆供应商",
        items: [
          { itemId: firstItem.id, qty: 3, unitPrice: 10 },
          { itemId: firstItem.id, qty: 2, unitPrice: 11 },
        ],
      });
    assert.equal(duplicateStockIn.status, 400);

    await createStockIn(procurementToken, {
      supplierName: "防呆供应商",
      items: [
        { itemId: firstItem.id, qty: 5, unitPrice: 10 },
        { itemId: secondItem.id, qty: 5, unitPrice: 20 },
      ],
    });

    const duplicateStockOut = await request(app)
      .post("/api/stock-out")
      .set("authorization", `Bearer ${procurementToken}`)
      .send({
        receiverName: "王五",
        items: [
          { itemId: firstItem.id, qty: 1 },
          { itemId: firstItem.id, qty: 1 },
        ],
      });
    assert.equal(duplicateStockOut.status, 400);

    const stockOutResponse = await request(app)
      .post("/api/stock-out")
      .set("authorization", `Bearer ${procurementToken}`)
      .send({
        receiverName: "王五",
        items: [{ itemId: firstItem.id, qty: 3 }],
      });
    assert.equal(stockOutResponse.status, 201, stockOutResponse.text);

    const stockOutItem = await prisma.stockOutItem.findFirst({
      where: { stockOutId: BigInt(stockOutResponse.body.data.id) },
      select: { id: true },
    });
    assert.ok(stockOutItem);

    const mismatchedRecovery = await request(app)
      .post("/api/recoveries")
      .set("authorization", `Bearer ${procurementToken}`)
      .send({
        itemId: secondItem.id,
        relatedStockOutItemId: stockOutItem.id.toString(),
        qty: 1,
        returnedBy: "王五",
        recoveryStatus: "REUSABLE",
      });
    assert.equal(mismatchedRecovery.status, 400);
    assert.match(mismatchedRecovery.body.message, /回收物品与关联出库明细不一致/);

    const firstRecovery = await request(app)
      .post("/api/recoveries")
      .set("authorization", `Bearer ${procurementToken}`)
      .send({
        itemId: firstItem.id,
        relatedStockOutItemId: stockOutItem.id.toString(),
        qty: 2,
        returnedBy: "王五",
        recoveryStatus: "REUSABLE",
      });
    assert.equal(firstRecovery.status, 201, firstRecovery.text);

    const excessiveBorrowedLoss = await request(app)
      .post("/api/losses")
      .set("authorization", `Bearer ${procurementToken}`)
      .send({
        itemId: firstItem.id,
        relatedStockOutItemId: stockOutItem.id.toString(),
        qty: 2,
        lossType: "BROKEN",
        sourceBucket: "BORROWED",
      });
    assert.equal(excessiveBorrowedLoss.status, 400);
    assert.match(excessiveBorrowedLoss.body.message, /剩余可处理数量/);
  });
});
