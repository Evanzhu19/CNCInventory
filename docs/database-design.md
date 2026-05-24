# 数据库设计说明

本文档配合 `backend/prisma/schema.prisma` 使用。当前阶段以 MySQL + Prisma 为准，后续无论是本地 Docker、Docker Compose，还是 NAS 上的 Kubernetes/k3s，数据库表结构都保持一致。

## 设计原则

- 所有库存变更都必须来自业务单据，不能直接手工改 `inventory` 汇总表。
- `inventory` 是当前状态缓存；入库、出库、回收、损耗是可追溯流水。
- 单仓库模式下 `warehouse_id` 默认是 `1`，但保留了 `warehouses` 表，方便未来扩展多仓库。
- 刀具和杂项用 `items.tracking_mode` 区分：`closed_loop` 表示出库后进入在外数量，`consumable` 表示普通消耗品。
- 所有关键业务表保留操作人、时间、状态和日志入口。

## 核心表

## 当前角色模型

- `cnc_supervisor`：CNC主管，能新建刀具/编号，能提交采购申请，只能看自己的采购申请。
- `procurement_manager`：采购主管，能看全局数据，负责入库、出库、回收、损耗。
- `general_manager`：总经理，只读查看库存和汇总信息。

### 基础主数据

- `users`：系统用户，角色分为 `admin`、`keeper`、`requester`。
- `categories`：大类/小类树，支持自定义分类。
- `suppliers`：供应商与采购渠道。
- `warehouses`：仓库表；当前固定使用 id 为 `1` 的默认仓库。
- `items`：物品主数据，包含编码、名称、规格、品牌、单位、安全库存、默认供应商、默认价格、跟踪模式。

### 当前库存

- `inventory`：每个物品在每个仓库的当前库存状态。
- `available_qty`：可用库存。
- `borrowed_qty`：在外数量。
- `pending_qty`：待处理数量。

`inventory` 上有唯一约束 `(item_id, warehouse_id)`，保证同一个物品在同一个仓库只有一条当前库存。

### 入库

- `stock_in`：入库单主表。
- `stock_in_items`：入库单明细。

入库提交后：

- 增加 `inventory.available_qty`。
- 保留供应商、渠道、单价，作为采购参考数据来源。
- 如果来自采购清单，可通过 `purchase_list_id` 和 `purchase_list_item_id` 反查。

### 出库

- `stock_out`：出库单主表。
- `stock_out_items`：出库单明细。

出库提交后：

- `closed_loop` 物品：减少 `available_qty`，增加 `borrowed_qty`。
- `consumable` 物品：减少 `available_qty`，通常不增加 `borrowed_qty`。

是否允许出库由后端事务校验：出库数量不能超过当前 `available_qty`。

### 回收

- `recovery_records`：回收记录。

回收状态：

- `reusable`：可继续使用。
- `roughing_reusable`：可开粗使用。
- `pending_inspection`：待判定。
- `repairable`：修磨后可用。
- `scrapped`：直接报废。

回收提交后：

- `reusable` / `roughing_reusable`：减少 `borrowed_qty`，增加 `available_qty`。
- `pending_inspection` / `repairable`：减少 `borrowed_qty`，增加 `pending_qty`。
- `scrapped`：减少 `borrowed_qty`，不回到可用库存。

### 损耗

- `loss_records`：损耗记录。

`source_bucket` 标记损耗从哪个库存池扣减：

- `available`：从可用库存扣。
- `borrowed`：从在外数量扣。
- `pending`：从待处理数量扣。

这能覆盖断刀、遗失、自然损耗、直接报废、待处理后确认报废等情况。

### 采购

- `purchase_requests`：采购申请主表。
- `purchase_request_items`：采购申请明细。
- `purchase_lists`：采购清单主表。
- `purchase_list_items`：采购清单明细。
- `purchase_list_request_items`：采购清单明细与采购申请明细的关联表。

增加 `purchase_list_request_items` 的原因是：一个采购清单明细可能汇总多个需求者的申请，一个申请也需要知道最终被合并到了哪个采购清单中。

到货入库时，`stock_in` / `stock_in_items` 可以关联采购清单和清单明细，形成：

采购申请 -> 采购清单 -> 到货入库 -> 当前库存

### 盘点与年度对账

- `stock_counts`：盘点单主表。
- `stock_count_items`：盘点单明细。

README 中的年度公式是：

```text
期初库存 + 年度入库 - 年度领用 + 年度回收 - 年度确认损耗 = 期末理论库存
```

流水数据可以计算理论库存，盘点表负责记录实际库存。年度差异报表应基于流水理论值和 `stock_count_items` 的实际盘点值计算差异。

### 操作日志

- `operation_logs`：关键操作日志。

建议后端在以下操作中写日志：

- 登录失败/成功。
- 新增、编辑、停用主数据。
- 提交、作废入库/出库/回收/损耗单。
- 合并采购申请、更新采购清单状态。
- 确认盘点单。

## 关键事务规则

后端实现时，以下操作必须放在数据库事务里：

- 入库：创建 `stock_in`、创建 `stock_in_items`、更新 `inventory`、写 `operation_logs`。
- 出库：校验库存、创建 `stock_out`、创建 `stock_out_items`、更新 `inventory`、写 `operation_logs`。
- 回收：校验可回收数量、创建 `recovery_records`、更新 `inventory`、写 `operation_logs`。
- 损耗：校验扣减来源、创建 `loss_records`、更新 `inventory`、写 `operation_logs`。
- 采购清单转入库：更新采购状态、创建入库单、更新库存。

## Kubernetes / NAS 部署相关

后续部署到 NAS 时，建议使用轻量 Kubernetes 发行版，例如 k3s。数据库设计层面需要注意：

- MySQL 使用 StatefulSet 或 NAS 提供的独立数据库服务。
- MySQL 数据目录必须挂载 PVC，不能放在容器临时文件系统。
- 数据库账号密码放 Secret，不能写进镜像或 Git。
- `DATABASE_URL` 通过 Secret/ConfigMap 注入后端 Pod。
- Prisma migration 建议用一次性 Job 执行，成功后再启动后端 Deployment。
- MySQL 不对公网暴露，只让后端 Service 在集群内访问。
- 定期备份 MySQL 数据卷，备份目标可以是 NAS 本地目录或外部对象存储。

当前先完成 schema 设计，等 Docker 环境开启后再补：

- 后端 `package.json`、Prisma migration。
- MySQL 初始化 seed。
- Dockerfile。
- Kubernetes manifests 或 Helm chart。

## 本地开发启动顺序

当前本地开发先使用 Docker Compose 跑 MySQL：

```bash
npm run db:up
```

数据库健康后，在 `backend` 目录生成 Prisma Client、执行 migration、写入初始数据：

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run db:seed
```

默认管理员账号：

```text
admin / admin123
```

前后端开发服务分别运行：

```bash
npm --prefix backend run dev
npm --prefix frontend run dev
```
