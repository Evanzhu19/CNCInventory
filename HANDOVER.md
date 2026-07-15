# Mills Inventory System — 交接文档

## 项目概述

CNC 部门刀具及杂项库存与采购管理系统，运行于内网 PVE/CT 环境（Docker Compose）。

- **访问地址**：http://192.168.101.241/tools/（统一门户 http://192.168.101.241/ 选「刀具库房管理」）
- **CT 地址**：192.168.101.241
- **数据库**：MySQL 8.4，持久化在 Docker volume `mysql_data`

## 统一门户（2026-07 起）

本项目的 frontend 容器（nginx）同时承担全厂 80 端口网关：

| 路径 | 内容 |
|------|------|
| `/` | 门户首页（frontend/portal/index.html，选择进哪个系统） |
| `/tools/` | 本系统 SPA（Vite base=/tools/，Docker 构建参数 VITE_BASE） |
| `/api/` | 本系统后端（backend:4000，不变） |
| `/erp/` | 订单生产 ERP（反代到 cnc-erp:3000，经共享网络 factory-net） |

部署前提：`docker network create factory-net`（一次性），且 CNC-ERP 项目的容器也加入了该网络。
ERP 容器不在线时网关照常启动（nginx 用运行时 DNS），访问 /erp/ 会 502，其余不受影响。
两系统数据库完全独立，门户融合不涉及任何数据迁移。

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + Vite + TypeScript + Ant Design 5 |
| 后端 | Node.js + Express + TypeScript |
| ORM | Prisma 7 |
| 数据库 | MySQL 8.4 |
| 部署 | Docker Compose（4 个服务：mysql / db-init / backend / frontend） |

---

## 目录结构

```
Mills-inventory-Sys/
├── backend/
│   ├── src/
│   │   ├── routes/          # API 路由（每个业务一个文件）
│   │   ├── lib/             # 核心逻辑（inventory.ts 等）
│   │   ├── middleware/      # auth.ts（requireRole）
│   │   └── generated/       # Prisma 生成的类型（不要手改）
│   └── prisma/
│       ├── schema.prisma    # 数据模型定义
│       └── migrations/      # 历史 SQL migration 文件
├── frontend/
│   └── src/
│       ├── pages/           # 各页面组件
│       ├── types.ts         # 所有前端类型定义
│       ├── api/client.ts    # axios 封装
│       ├── lib/roles.ts     # 前端权限判断函数
│       └── styles.css       # 全局样式
├── docker-compose.yml
├── update.sh                # 一键 rsync + 重建部署到CT
└── HANDOVER.md              # 本文档
```

---

## 用户角色与权限

| 角色 | 可访问页面 |
|------|-----------|
| `ADMIN` | 用户管理、全部功能 |
| `PROCUREMENT_MANAGER` | 出入库、库存、物品、采购申请、采购清单、盘点、审批、统计分析、操作日志 |
| `CNC_SUPERVISOR` | 出入库（提交/查看自己的）、采购申请（自己）、我的记录、Dashboard |
| `GENERAL_MANAGER` | Dashboard、统计分析（只读） |

> `PROCUREMENT_MANAGER` 和 `ADMIN` 共享大部分管理权限；`PROCUREMENT_MANAGER` 只能管理 `CNC_SUPERVISOR` 账号，`ADMIN` 可管理所有角色。

---

## 核心业务概念

### 库存追踪模式（ItemTrackingMode）

| 枚举值 | 说明 |
|--------|------|
| `CLOSED_LOOP` | 闭环刀具：出库 → `borrowedQty`，回收 → 归还 `availableQty` |
| `CONSUMABLE` | 普通消耗品：出库直接从 `availableQty` 扣减 |
| `HIGH_VALUE_CONSUMABLE` | 高值消耗品：同消耗品，但标记高值 |
| `REPAIR_PENDING` | 待修/寄修件 |

### 三个库存桶

| 字段 | 含义 |
|------|------|
| `availableQty` | 可用数量 |
| `borrowedQty` | 已出库在外（CLOSED_LOOP 专用） |
| `pendingQty` | 待处理数量 |

### 批次追踪

每条 `StockInItem`（入库明细）有三个余量字段：`availableQtyBalance`、`borrowedQtyBalance`、`pendingQtyBalance`。出库时通过 `StockOutItemBatchAllocation` 关联到具体批次。

---

## 已完成功能汇总

### 页面功能完整清单

| 页面 | 路径 | 角色 | 主要功能 |
|------|------|------|----------|
| Dashboard | `/` | 全部 | 概览统计、低库存预警、近期出入库 |
| 出入库 | `/stock-movements` | PM + CNC | 入库/出库/回收/损耗，各 Tab 独立日期筛选，提交后自动清空表单 |
| 库存 | `/inventory` | PM | 库存总览、手动调整、低库存高亮 |
| 物品 | `/items` | PM + CNC（新增） | 物品管理、分类管理、搜索筛选 |
| 采购申请 | `/purchase-requests` | PM + CNC | 申请管理、清单汇总、服务端日期+状态筛选 |
| 审批 | `/approvals` | PM | 跨月删除申请审批，按日期分组展示 |
| 库存盘点 | `/stock-counts` | PM | 发起盘点（可选物品）、填写实际数量、差异高亮、确认调整库存 |
| 统计分析 | `/analytics` | PM + GM | 月度汇总、排行、历史记录，服务端分页 |
| 用户管理 | `/users` | Admin + PM | 增删改用户，PM 只能管 CNC 账号 |
| 我的记录 | `/my-records` | CNC | 查看本人出库和采购申请记录 |
| 操作日志 | `/operation-logs` | Admin | 全量操作日志，支持按模块筛选 |

---

## 重要代码模式

### 服务端日期筛选（前端标准写法）

```typescript
// 三个独立的 load 函数 + 各自的 useEffect，而不是一个大 load()
async function loadRequests(range: [dayjs.Dayjs, dayjs.Dayjs], status: string) {
  const params: Record<string, string> = {
    startDate: range[0].format("YYYY-MM-DD"),
    endDate: range[1].format("YYYY-MM-DD"),
  };
  if (status !== "ALL") params.status = status;
  const res = await api.get("/purchase-requests", { params });
  setRequests(res.data.data);
}

useEffect(() => { void loadRequests(dateRange, statusFilter); }, [dateRange, statusFilter]);
```

### Ant Design 表单标准写法（防重复提交）

```typescript
const [form] = Form.useForm<FormValues>();
const [submitting, setSubmitting] = useState(false);

async function onFinish(values: FormValues) {
  setSubmitting(true);
  try {
    await api.post("/endpoint", values);
    form.resetFields();         // 成功后清空表单
    message.success("提交成功");
  } catch (error) {
    message.error(getErrorMessage(error));
  } finally {
    setSubmitting(false);       // 无论成功失败都解除 loading
  }
}

<Form form={form} onFinish={onFinish}>
  ...
  <Button type="primary" htmlType="submit" loading={submitting}>提交</Button>
</Form>
```

### 后端路由 ID 解析

```typescript
// req.params.id 类型是 string，必须用 String() 包一层确保类型安全
const id = toBigIntId(String(req.params.id));
```

### 后端事务内禁止直接调用 res.json（已知 Bug 已修复）

```typescript
// ❌ 错误写法：事务 return 后外层仍会执行 res.json，导致双响应
await prisma.$transaction(async (tx) => {
  if (!item) { res.status(404).json(...); return; }  // ← 危险
});
res.json({ message: "已删除" });  // ← 仍然执行！

// ✅ 正确写法：事务内 throw，外层 catch 统一处理
await prisma.$transaction(async (tx) => {
  if (!item) throw new Error("物品不存在");
  ...
});
res.json({ message: "已删除" });
```

### 所有库存操作必须用 Prisma 事务

```typescript
await prisma.$transaction(async (tx) => {
  // 所有库存读写放在同一事务里，避免并发导致数据不一致
});
```

---

## 部署方式

### 日常更新（代码改动，含或不含 schema 变更）

```bash
# 在本地项目根目录执行
./update.sh
```

脚本执行顺序：
1. `rsync` 全量同步项目文件到 CT（排除 `.git`、`node_modules`、`dist`、`.env`）
2. 在 CT 上重建 `db-init`、`backend`、`frontend` 三个镜像
3. 运行 `db-init`（`SKIP_SEED=1`）— 自动应用还未跑过的 migration（幂等，已跑过的跳过）
4. 重启 `backend` 和 `frontend`

> **不需要区分"有没有改数据库"**：每次都带 migration 步骤，`prisma migrate deploy` 是幂等的。

### CT 数据库完全重置（清空所有数据）

```bash
./update.sh --reset
```

会先要求输入 `YES` 确认，然后执行 `docker compose down -v` 删除数据卷，再全量重建含 seed 数据初始化。**不可逆，谨慎使用。**

### 本地开发环境重置

```bash
docker compose down -v          # 删除数据卷（清空数据）
docker compose up --build -d    # 重新构建并启动
```

---

## update.sh 关键配置

```bash
CT_USER="root"
CT_HOST="192.168.101.241"
CT_PATH="/root/mills-inventory-sys"
```

如路径不对，在 CT 上执行 `find /root -name docker-compose.yml` 确认。

---

## 已知问题与修复记录

| 文件 | 问题 | 修复方式 |
|------|------|----------|
| `backend/routes/items.ts` | DELETE 路由在事务回调内调用 `res.json` 后外层再次调用，导致双响应崩溃 | 改为 `throw new Error()` |
| `frontend/pages/StockMovements.tsx` | 4 个表单没有 `Form.useForm()`，提交后字段不清空 | 添加 form 实例 + `resetFields()` |
| `frontend/pages/StockMovements.tsx` | 提交按钮无 loading 状态，可重复点击 | 添加 loading 状态变量 |
| `frontend/pages/StockMovements.tsx` | 编辑入库单弹窗无 `confirmLoading` | 添加 `editSaving` 状态 |
| `frontend/pages/Dashboard.tsx` | API 失败时 Promise 未捕获 | 补充 `.catch(() => {})` |
| `frontend/pages/Items.tsx` | `load()` 无 try/catch，失败时静默空列表 | 包 try/catch + 显示错误 |
| `backend/routes/stockCounts.ts` | `itemIds: []` 空数组被当作无过滤，盘点全部物品 | Zod 增加 `.min(1)` 约束 |

---

## 待办 / 未来方向

- [ ] 库存预警通知（低库存自动通知/提醒）
- [ ] 物品图片/附件上传
- [ ] 采购清单 PDF 导出
- [ ] 盘点记录加日期筛选（目前固定返回最近 50 条）
- [ ] 用户姓名变更后 `recoveries.returnedBy` 文本匹配失效问题（设计缺陷，需改为存 userId）
