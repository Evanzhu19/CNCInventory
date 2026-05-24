import { expect, type Locator, type Page, test } from "@playwright/test";

const adminUsername = "admin_e2e";
const adminPassword = "AdminE2E#123";

let sequence = 0;

function uniqueId(prefix: string) {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence}`;
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function looseText(text: string) {
  return new RegExp(text.split("").map(escapeRegExp).join("\\s*"));
}

function button(container: Page | Locator, text: string) {
  return container.locator("button:visible").filter({ hasText: looseText(text) }).first();
}

function formItem(container: Locator, label: string, index = 0) {
  return container.locator(".ant-form-item:visible").filter({ hasText: label }).nth(index);
}

function visibleForm(page: Page, index = 0) {
  return page.locator(".app-content form:visible").nth(index);
}

function card(page: Page, title: string) {
  return page.locator(".ant-card:visible").filter({ hasText: title }).first();
}

function tableRow(page: Page, text: string) {
  return page.locator(".ant-table-tbody tr:visible").filter({ hasText: text }).first();
}

function visibleModal(page: Page) {
  return page.locator(".ant-modal:visible").last();
}

async function expectMessage(page: Page, text: string) {
  await expect(page.locator(".ant-message-notice-content").filter({ hasText: text }).last()).toBeVisible();
}

async function fillInput(container: Locator, label: string, value: string, index = 0) {
  await formItem(container, label, index).locator("input").first().fill(value);
}

async function fillNumber(container: Locator, label: string, value: number | string, index = 0) {
  const input = formItem(container, label, index).locator("input").first();
  await input.fill(String(value));
  await input.press("Tab");
}

async function fillTextarea(container: Locator, label: string, value: string, index = 0) {
  await formItem(container, label, index).locator("textarea").first().fill(value);
}

async function chooseSelect(page: Page, container: Locator, label: string, optionText: string, index = 0) {
  await formItem(container, label, index).locator(".ant-select-selector").click();
  const option = page.locator(".ant-select-dropdown:visible .ant-select-item-option").filter({ hasText: optionText }).first();
  await expect(option).toBeVisible();
  await option.click();
}

async function openMenu(page: Page, label: string, title?: string) {
  await page.locator(".ant-menu-item:visible").filter({ hasText: looseText(label) }).first().click();
  await expect(page.locator(".page-title")).toContainText(title ?? label);
}

async function openTab(page: Page, label: string) {
  await page.locator(".ant-tabs-tab-btn:visible").filter({ hasText: looseText(label) }).first().click();
}

async function login(page: Page, username: string, password: string) {
  await page.goto("/");
  const form = page.locator(".login-panel form");
  await fillInput(form, "用户名", username);
  await fillInput(form, "密码", password);
  const passwordInput = formItem(form, "密码").locator("input").first();
  const loginResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/auth/login") && response.request().method() === "POST",
  );
  await passwordInput.press("Enter");
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.ok()).toBeTruthy();
  await expect(page.locator(".app-header")).toBeVisible({ timeout: 15_000 });
}

async function logout(page: Page) {
  await page.locator(".app-header button").click();
  await expect(button(page.locator(".login-panel"), "登录")).toBeVisible();
}

async function createUser(
  page: Page,
  values: {
    username: string;
    password: string;
    realName: string;
    role: "采购主管" | "总经理" | "CNC主管" | "管理员";
  },
) {
  const form = visibleForm(page);
  await fillInput(form, "用户名", values.username);
  await fillInput(form, "密码", values.password);
  await fillInput(form, "姓名", values.realName);
  await chooseSelect(page, form, "角色", values.role);
  await button(page, "新增用户").click();
  await expectMessage(page, "用户已创建");
  await expect(page.locator(".ant-table:visible").first()).toContainText(values.username);
}

async function createItem(
  page: Page,
  values: {
    itemCode: string;
    name: string;
    specification: string;
    brand: string;
    category: string;
    trackingMode?: "闭环刀具" | "普通消耗品";
    safeStock?: number;
    defaultSupplierName?: string;
  },
) {
  await openMenu(page, "物品");
  const itemCard = card(page, "新增物品");

  await fillInput(itemCard, "编码", values.itemCode);
  await fillInput(itemCard, "名称", values.name);
  await fillInput(itemCard, "规格", values.specification);
  await fillInput(itemCard, "品牌", values.brand);
  await chooseSelect(page, itemCard, "小类", values.category);

  if (values.trackingMode && values.trackingMode !== "闭环刀具") {
    await chooseSelect(page, itemCard, "跟踪模式", values.trackingMode);
  }

  if (values.safeStock !== undefined) {
    await fillNumber(itemCard, "安全库存", values.safeStock);
  }

  if (values.defaultSupplierName) {
    await fillInput(itemCard, "默认供应商", values.defaultSupplierName);
  }

  await button(itemCard, "新增物品").click();
  await expectMessage(page, "物品已新增");
  await expect(page.locator(".ant-table")).toContainText(values.itemCode);
}

async function selectItemByCode(page: Page, container: Locator, label: string, itemCode: string) {
  await chooseSelect(page, container, label, itemCode);
}

async function expectStatisticAtLeast(page: Page, title: string, minimum: number) {
  const text = await page.locator(".ant-statistic:visible").filter({ hasText: title }).first().innerText();
  const numbers = text.match(/-?\d+(?:\.\d+)?/g) ?? [];
  const value = Number(numbers.at(-1) ?? Number.NaN);
  expect(Number.isFinite(value)).toBeTruthy();
  expect(value).toBeGreaterThanOrEqual(minimum);
}

test.describe("Playwright E2E weird flows", () => {
  test("admin can create role users while procurement is constrained to CNC-only user management", async ({ page }) => {
    const procurementUser = uniqueId("proc-boundary");
    const generalManagerUser = uniqueId("gm-boundary");
    const cncUser = uniqueId("cnc-boundary");
    const extraCncUser = uniqueId("cnc-extra");
    const password = "Password#123";

    await login(page, adminUsername, adminPassword);
    await expect(page.locator(".ant-menu-item:visible").filter({ hasText: "统计分析" })).toHaveCount(0);

    await openMenu(page, "用户管理");

    await createUser(page, {
      username: procurementUser,
      password,
      realName: "采购边界测试",
      role: "采购主管",
    });
    await createUser(page, {
      username: generalManagerUser,
      password,
      realName: "总经理边界测试",
      role: "总经理",
    });
    await createUser(page, {
      username: cncUser,
      password,
      realName: "CNC边界测试",
      role: "CNC主管",
    });

    const createForm = visibleForm(page);
    await fillInput(createForm, "用户名", procurementUser);
    await fillInput(createForm, "密码", password);
    await fillInput(createForm, "姓名", "重复用户");
    await chooseSelect(page, createForm, "角色", "采购主管");
    await button(page, "新增用户").click();
    await expectMessage(page, "用户名已存在");

    const adminRow = tableRow(page, adminUsername);
    await button(adminRow, "编辑").click();
    const modal = visibleModal(page);
    await chooseSelect(page, modal, "状态", "停用");
    await modal.locator(".ant-modal-footer button").last().click();
    await expectMessage(page, "不能停用当前登录账号");
    await modal.locator(".ant-modal-footer button").first().click();
    await expect(modal).toHaveCount(0);

    await logout(page);
    await login(page, procurementUser, password);

    await openMenu(page, "用户管理");
    const procurementForm = visibleForm(page);
    await formItem(procurementForm, "角色").locator(".ant-select-selector").click();
    const dropdown = page.locator(".ant-select-dropdown:visible").last();
    await expect(dropdown).toContainText("CNC主管");
    await expect(dropdown).not.toContainText("采购主管");
    await expect(dropdown).not.toContainText("总经理");
    await page.keyboard.press("Escape");

    await createUser(page, {
      username: extraCncUser,
      password,
      realName: "采购只能建CNC",
      role: "CNC主管",
    });

    const userTable = page.locator(".ant-table:visible").first();
    await expect(userTable).toContainText(cncUser);
    await expect(userTable).toContainText(extraCncUser);
    await expect(userTable).not.toContainText(procurementUser);
    await expect(userTable).not.toContainText(generalManagerUser);

    await logout(page);
  });

  test("procurement UI blocks bizarre stock and inventory operations before data gets corrupted", async ({ page }) => {
    const procurementUser = uniqueId("proc-ops");
    const password = "Password#123";
    const toolCode = uniqueId("E2E-TOOL");
    const consumableCode = uniqueId("E2E-CONS");
    const stockInSupplier = uniqueId("离谱供应商");

    await login(page, adminUsername, adminPassword);
    await openMenu(page, "用户管理");
    await createUser(page, {
      username: procurementUser,
      password,
      realName: "采购异常流测试",
      role: "采购主管",
    });
    await logout(page);

    await login(page, procurementUser, password);

    await createItem(page, {
      itemCode: toolCode,
      name: "离谱闭环刀具",
      specification: "D10*75",
      brand: "E2E",
      category: "铣刀",
      safeStock: 1,
    });

    const itemCard = card(page, "新增物品");
    await fillInput(itemCard, "编码", toolCode);
    await fillInput(itemCard, "名称", "重复编码刀具");
    await fillInput(itemCard, "规格", "D10*75");
    await fillInput(itemCard, "品牌", "E2E");
    await chooseSelect(page, itemCard, "小类", "铣刀");
    await button(page, "新增物品").click();
    await expectMessage(page, "存在重复数据");

    await createItem(page, {
      itemCode: consumableCode,
      name: "离谱消耗品",
      specification: "M8",
      brand: "E2E",
      category: "辅料",
      trackingMode: "普通消耗品",
      safeStock: 0,
    });

    await openMenu(page, "出入库");

    const stockInCard = card(page, "新增入库");
    await fillInput(stockInCard, "供应商", stockInSupplier);
    await selectItemByCode(page, stockInCard, "物品", toolCode);
    await fillNumber(stockInCard, "数量", 5);
    await fillNumber(stockInCard, "单价", 42.5);
    await fillInput(stockInCard, "购买渠道", "离谱渠道-A");
    await fillInput(stockInCard, "备注", "先正常入库一次");
    await button(stockInCard, "提交入库").click();
    await expectMessage(page, "入库已提交");

    const stockInRow = tableRow(page, stockInSupplier);
    await button(stockInRow, "修改").click();
    const editModal = visibleModal(page);
    await editModal.locator(".ant-select-auto-complete input").first().fill("");
    await editModal.locator(".ant-modal-footer button").last().click();
    await expectMessage(page, "请输入供应商");
    await editModal.locator(".ant-select-auto-complete input").first().fill(stockInSupplier);
    await editModal.locator(".ant-modal-footer button").last().click();
    await expectMessage(page, "入库单已更新");

    await openTab(page, "出库");
    const stockOutCard = card(page, "新增出库");
    await selectItemByCode(page, stockOutCard, "物品", toolCode);
    await fillNumber(stockOutCard, "数量", 999);
    await fillInput(stockOutCard, "领取人", "极端领取人");
    await fillInput(stockOutCard, "部门", "CNC");
    await fillInput(stockOutCard, "用途 / 机台 / 工单", "把库存点穿");
    await button(stockOutCard, "提交出库").click();
    await expectMessage(page, "可用库存不足，不能出库");

    await fillNumber(stockOutCard, "数量", 3);
    await button(stockOutCard, "提交出库").click();
    await expectMessage(page, "出库已提交");

    await openTab(page, "回收");
    const recoveryCard = card(page, "新增回收");
    await selectItemByCode(page, recoveryCard, "物品", consumableCode);
    await fillNumber(recoveryCard, "数量", 1);
    await fillInput(recoveryCard, "归还人", "不可能回收的人");
    await button(recoveryCard, "提交回收").click();
    await expectMessage(page, "消耗品不支持回收");

    await openMenu(page, "库存");
    const searchBox = page.getByPlaceholder("搜索编码、名称、规格、品牌");
    await searchBox.fill(toolCode);
    await searchBox.press("Enter");

    const inventoryRow = tableRow(page, toolCode);
    await expect(inventoryRow).toContainText("2");
    await expect(inventoryRow).toContainText("3");

    await button(inventoryRow, "手动调整").click();
    const adjustmentModal = visibleModal(page);
    await adjustmentModal.locator(".ant-modal-footer button").last().click();
    await expectMessage(page, "请填写调整原因");
    await adjustmentModal.locator("textarea").fill("E2E 手动调整原因校验");
    await adjustmentModal.locator(".ant-modal-footer button").last().click();
    await expectMessage(page, "库存已调整");

    await logout(page);
  });

  test("partial procurement, follow-up stock movement, and analytics history all work through the browser", async ({ page }) => {
    const procurementUser = uniqueId("proc-analytics");
    const cncUser = uniqueId("cnc-analytics");
    const managerUser = uniqueId("gm-analytics");
    const password = "Password#123";
    const itemCode = uniqueId("E2E-ANL");
    const supplierName = uniqueId("耐用供应商");
    const purchaseChannel = "耐用渠道-一期";

    await login(page, adminUsername, adminPassword);
    await openMenu(page, "用户管理");
    await createUser(page, {
      username: procurementUser,
      password,
      realName: "采购统计测试",
      role: "采购主管",
    });
    await createUser(page, {
      username: cncUser,
      password,
      realName: "CNC统计测试",
      role: "CNC主管",
    });
    await createUser(page, {
      username: managerUser,
      password,
      realName: "总经理统计测试",
      role: "总经理",
    });
    await logout(page);

    await login(page, cncUser, password);
    await createItem(page, {
      itemCode,
      name: "统计分析刀具",
      specification: "R0.5*4T",
      brand: "ANL",
      category: "球刀",
      safeStock: 0,
    });

    await openMenu(page, "采购", "采购申请");
    const requestCard = card(page, "新增采购申请");
    await selectItemByCode(page, requestCard, "关联库存物品", itemCode);
    await fillNumber(requestCard, "数量", 10);
    await chooseSelect(page, requestCard, "紧急程度", "紧急");
    await fillInput(requestCard, "申请原因", "离谱但真实的备料需求");
    await button(requestCard, "提交申请").click();
    await expectMessage(page, "采购申请已提交");
    await expect(page.locator(".ant-table:visible").first()).toContainText("统计分析刀具");
    await logout(page);

    await login(page, procurementUser, password);
    await openMenu(page, "采购", "采购管理");

    const requestRow = tableRow(page, "统计分析刀具");
    await requestRow.locator(".ant-checkbox").first().click();
    await button(page, "汇总成采购清单").click();
    await expectMessage(page, "采购清单已生成");

    const detailCard = card(page, "清单详情");
    const detailRow = detailCard.locator(".ant-table-tbody tr:visible").filter({ hasText: "统计分析刀具" }).first();
    await detailRow.locator(".ant-input-number input").first().fill("88.5");
    await detailRow.locator(".ant-select-auto-complete input").first().fill(supplierName);
    await button(detailCard, "保存采购清单").click();
    await expectMessage(page, "采购清单已保存");

    const stockInCard = card(page, "到货入库");
    await stockInCard.locator(".ant-select-auto-complete input").first().fill("");
    await button(stockInCard, "执行到货入库").click();
    await expectMessage(page, "请输入供应商");

    await stockInCard.locator(".ant-select-auto-complete input").first().fill(supplierName);
    const stockInRow = stockInCard.locator(".ant-table-tbody tr:visible").filter({ hasText: "统计分析刀具" }).first();
    await stockInRow.locator(".ant-input-number input").nth(0).fill("4");
    await stockInRow.locator(".ant-input-number input").nth(1).fill("88.5");
    await stockInRow.locator(".ant-input:visible").nth(0).fill(purchaseChannel);
    await button(stockInCard, "执行到货入库").click();
    await expectMessage(page, "到货入库已提交");
    await expect(detailCard).toContainText("部分到货");

    await openMenu(page, "出入库");

    await openTab(page, "出库");
    const stockOutCard = card(page, "新增出库");
    await expect(stockOutCard).toBeVisible();
    await selectItemByCode(page, stockOutCard, "物品", itemCode);
    await fillNumber(stockOutCard, "数量", 2);
    await fillInput(stockOutCard, "领取人", "统计领用人");
    await fillInput(stockOutCard, "部门", "CNC");
    await fillInput(stockOutCard, "用途 / 机台 / 工单", "统计出库");
    await button(stockOutCard, "提交出库").click();
    await expectMessage(page, "出库已提交");

    await openTab(page, "回收");
    const recoveryCard = card(page, "新增回收");
    await expect(recoveryCard).toBeVisible();
    await selectItemByCode(page, recoveryCard, "物品", itemCode);
    await fillNumber(recoveryCard, "数量", 1);
    await fillInput(recoveryCard, "归还人", "统计归还人");
    await button(recoveryCard, "提交回收").click();
    await expectMessage(page, "回收已提交");

    await openTab(page, "损耗");
    const lossCard = card(page, "新增损耗");
    await expect(lossCard).toBeVisible();
    await selectItemByCode(page, lossCard, "物品", itemCode);
    await fillNumber(lossCard, "数量", 1);
    await chooseSelect(page, lossCard, "扣减来源", "在外数量");
    await chooseSelect(page, lossCard, "损耗原因", "断刀");
    await fillInput(lossCard, "责任人", "统计责任人");
    await button(lossCard, "提交损耗").click();
    await expectMessage(page, "损耗已提交");

    await logout(page);

    await login(page, managerUser, password);
    await expect(page.locator(".ant-menu-item:visible").filter({ hasText: "用户管理" })).toHaveCount(0);
    await expect(page.locator(".ant-menu-item:visible").filter({ hasText: "出入库" })).toHaveCount(0);

    await openMenu(page, "统计分析");
    await expect(page.locator(".ant-alert:visible")).toContainText("前端只请求当前结果页");
    await expectStatisticAtLeast(page, "累计入库", 4);
    await expectStatisticAtLeast(page, "累计出库", 2);
    await expectStatisticAtLeast(page, "累计回收", 1);
    await expectStatisticAtLeast(page, "累计损耗", 1);
    const rankingCard = card(page, "物品使用与损耗排行");
    const sourceCard = card(page, "供应商 / 渠道参考分析");
    const historyCard = card(page, "历史记录");
    await expect(rankingCard).toContainText(itemCode);
    await expect(sourceCard).toContainText(supplierName);
    await expect(sourceCard).toContainText(purchaseChannel);

    await openTab(page, "出库历史");
    await expect(historyCard).toContainText(itemCode);
    await openTab(page, "回收历史");
    await expect(historyCard).toContainText(itemCode);
    await openTab(page, "损耗/报废历史");
    await expect(historyCard).toContainText(itemCode);

    const toolbar = page.locator(".toolbar:visible").first();
    await toolbar.locator(".ant-select-selector").first().click();
    await page.locator(".ant-select-dropdown:visible .ant-select-item-option").filter({ hasText: "近半年" }).first().click();
    await expectStatisticAtLeast(page, "累计入库", 4);

    await logout(page);
  });
});
