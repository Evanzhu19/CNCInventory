# Mills Inventory System — 交接文档

## 项目概述

CNC 部门刀具及杂项库存与采购管理系统，已上线运行于内网 PVE/CT 环境（Docker）。

- **访问地址**：http://192.168.101.241:5173
- **CT 地址**：192.168.101.241
- **数据库**：MySQL 8.4，持久化在 Docker volume `mysql_data`，**任何时候不要动它**

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React + Vite + TypeScript + Ant Design |
| 后端 | Node.js + Express + TypeScript |
| ORM | Prisma 7 |
| 数据库 | MySQL 8.4 |
| 部署 | Docker Compose（4 个服务：mysql / db-init / backend / frontend） |

---

## 目录结构

```
Mills-inventory-Sys/
├── backend/
│   └── src/
│       ├── routes/          # API 路由（每个业务一个文件）
│       ├── lib/             # 核心逻辑（inventory.ts, batchTracking.ts 等）
│       ├── middleware/      # auth.ts（requireRole, isProcurementManager）
│       └── generated/       # Prisma 生成的类型（不要手改）
├── frontend/
│   └── src/
│       ├── pages/           # 各页面组件
│       ├── types.ts         # 所有前端类型定义
│       ├── api/client.ts    # axios 封装
│       ├── lib/roles.ts     # 前端权限判断函数
│       └── styles.css       # 全局样式
├── docker-compose.yml
├── update.sh                # 本地执行：一键 SCP + 重建部署
└── HANDOVER.md              # 本文档
```

---

## 用户角色

| 角色 | 权限 |
|------|------|
| `admin` | 用户管理 |
| `procurement_manager` | 全部出入库、采购清单、删除操作 |
| `cnc_supervisor` | 提交/删除自己的采购申请、出库申请 |
| `general_manager` | 只读查看 |

---

## 核心业务概念

### 库存追踪模式（itemTrackingMode）
- `CLOSED_LOOP`：闭环追踪（如刀具），出库后进入 `borrowedQty`，回收后归还 `availableQty`
- `CONSUMABLE`：消耗品，出库直接从 `availableQty` 扣除

### 三个库存桶
- `availableQty`：可用数量
- `borrowedQty`：已出库在外（CLOSED_LOOP 专用）
- `pendingQty`：待处理

### 批次追踪（StockInItem）
每条入库明细有三个余量字段：
- `availableQtyBalance`：本批次剩余可出库量
- `borrowedQtyBalance`：本批次已出库在外量
- `pendingQtyBalance`：本批次待处理量

出库时通过 `StockOutItemBatchAllocation` 关联到具体批次。

---

## 本次会话完成的功能

### 1. 删除功能（后端 + 前端）
| 对象 | 文件 | 权限 | 安全检查 |
|------|------|------|----------|
| 物品 | `backend/src/routes/items.ts` | procurement_manager | 库存为零，无关联单据 |
| 入库单 | `backend/src/routes/stockIn.ts` | procurement_manager | 批次余量 = 原始数量（未被消耗） |
| 出库单 | `backend/src/routes/stockOut.ts` | procurement_manager | 恢复批次余量 + 库存总量 |
| 采购申请 | `backend/src/routes/purchaseRequests.ts` | cnc_supervisor（自己）/ procurement_manager | 状态为 PENDING，未被汇总到采购清单 |

删除出库单的逻辑顺序：
1. 恢复 `StockInItem` 的 `availableQtyBalance`（+qty），`borrowedQtyBalance`（-qty，CLOSED_LOOP）
2. 恢复 `Inventory` 的 `availableQty`（+qty），`borrowedQty`（-qty，CLOSED_LOOP）
3. 删除 `StockOutItemBatchAllocation` → `StockOutItem` → `StockOut`

### 2. 采购页面（PurchaseRequests.tsx）优化
- 采购清单列表：默认只显示当天，RangePicker 查历史
- 采购申请列表：默认只显示当天，RangePicker 查历史
- 采购申请新增**状态筛选**下拉（全部/待处理/已汇总/已采购/已取消）
- 采购清单详情从侧边列改为下方全宽展示
- 历史价格参考改为条件渲染（选中物品才显示），全宽展示在表单下方
- 各表格加了合理列宽 + `scroll` 防溢出

### 3. 出入库页面（StockMovements.tsx）优化
- **入库/出库/回收/损耗**四个 Tab 各自加了 RangePicker 日期筛选（默认今天）
- 出库单表格加了**可展开行**，展开后显示该单的物品明细（编码/名称/规格/单位/数量）
- 出库表单的「领取人」输入框改为 **AutoComplete**，从历史出库记录中自动提示
- 回收 Tab 下方新增**回收历史表格**，含回收状态彩色 Tag
- 损耗 Tab 下方新增**损耗历史表格**，含损耗原因和扣减来源

### 4. 库存页面（Inventory.tsx）
- 低库存行标注橙色背景 `#fff7e6`
- 缺货行标注红色背景 `#fff1f0`
- CSS 类：`.row-low-stock`、`.row-out-of-stock`（在 `styles.css` 末尾）

---

## 重要代码模式

### 后端路由 ID 解析
```typescript
// 必须用 String() 包一层，因为 req.params.id 类型是 string | string[] | undefined
const id = toBigIntId(String(req.params.id));
```

### 前端日期筛选
```typescript
const today: [dayjs.Dayjs, dayjs.Dayjs] = [dayjs().startOf("day"), dayjs().endOf("day")];

function filterByDate<T>(list: T[], getTime: (item: T) => string, range: [dayjs.Dayjs, dayjs.Dayjs]) {
  return list.filter((item) => {
    const t = dayjs(getTime(item));
    return !t.isBefore(range[0].startOf("day")) && !t.isAfter(range[1].endOf("day"));
  });
}
```

### 所有库存操作必须用 Prisma 事务
```typescript
await prisma.$transaction(async (tx) => { ... });
```

---

## 部署方式

### 日常更新（只改了 src 源码）
```bash
# 在本地项目根目录执行
./update.sh
```
脚本做三件事：SCP frontend/src → SCP backend/src → SSH 重建容器。

### 如果改了 package.json（加了新 npm 包）
```bash
scp frontend/package*.json root@192.168.101.241:/CT项目路径/frontend/
scp backend/package*.json root@192.168.101.241:/CT项目路径/backend/
./update.sh
```

### 如果改了数据库 schema（prisma/schema.prisma）
需要单独处理迁移，不在本文档范围，需讨论。

### 绝对不要动的命令
```bash
# 这会把 MySQL 也重建，数据全没
docker compose down
docker compose up -d   # ← 不加 --no-deps --build 指定服务名也危险
```

---

## update.sh 关键参数

```bash
CT_USER="root"
CT_HOST="192.168.101.241"
CT_PATH="/root/mills-inventory-sys"   # ← 如果路径不对，先在 CT 上 find / -name docker-compose.yml 确认
```

---

## 待办 / 未来可做的方向

- [ ] 操作日志查看页面（后端 `operationLog` 表已有数据）
- [ ] 采购清单状态流转优化（目前部分手动）
- [ ] 物品图片/附件上传
- [ ] 库存预警通知（低库存自动提醒）
- [ ] 数据导出（Excel）
