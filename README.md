# Mills Inventory System

刀具及杂项库存与采购管理系统。

这个 README 现在同时承担 4 个角色：

1. 项目说明
2. 当前开发状态快照
3. 本地运行手册
4. 下一个 session 的交接文档

如果下次要继续开发，优先先读这个文件，再决定是否继续翻 `README_dev.md` 和 `docs/database-design.md`。

## 1. 项目目标

系统服务于 CNC 部门的刀具和杂项物料管理，目标不是简单记库存，而是把这几条链路串起来：

- 物品主数据
- 当前库存
- 入库
- 出库
- 回收
- 损耗
- 采购申请
- 历史价格参考
- 年度差异对账

当前阶段已经完成了一个能本地跑通的开发版，前后端和数据库都已搭起来。

## 2. 当前技术栈

- 前端：React + TypeScript + Vite + Ant Design
- 后端：Node.js + Express + Prisma 7
- 数据库：MySQL 8.4
- 本地一键启动方式：Docker Compose
- Kubernetes 清单：`deploy/k8s/*`
- 本地调试方式：可选前后端本机启动，也可整套容器化

## 3. 当前开发状态

### 3.1 已完成

- 已搭建前端项目骨架
- 已搭建后端项目骨架
- 已搭建 MySQL Docker Compose
- 已完成 Prisma schema
- 已完成初始 migration
- 已完成角色模型迁移
- 已完成 seed 初始化基础分类、仓库与三角色 bootstrap 账号机制
- 已完成登录鉴权
- 已完成 Dashboard 基础统计
- 已完成分类、供应商、物品基础数据接口
- 已完成库存列表接口
- 已完成入库、出库、回收、损耗接口
- 已完成采购申请接口
- 已完成采购清单接口
- 已完成采购申请汇总成采购清单
- 已完成采购清单到到货入库闭环
- 已完成采购清单分批到货 / 部分入库
- 已完成入库时供应商必填
- 已完成入库时供应商自由输入并自动建档
- 已完成入库单供应商与价格信息修改
- 已完成基础操作日志
- 已完成库存页按规格搜索
- 已完成采购主管在库存页手动调整库存
- 已完成采购主管在库存页编辑物品主数据
- 已完成点击库存物品查看历史价格
- 已完成采购申请页选择物品后的历史价格参考
- 已完成多角色权限第一版
- 已完成前后端 Dockerfile
- 已完成 `docker compose up --build` 一键启动整套服务
- 已完成 Kubernetes / k3s 基础部署清单

### 3.2 未完成

- 采购参考独立页面
- Excel 导出
- 用户管理页面
- 更细权限控制
- 盘点页面
- 年度差异报表
- 前端按需拆包优化
- Kubernetes / NAS 实机部署验证

### 3.3 当前优先级建议

建议下一个阶段按这个顺序继续：

1. 采购参考独立页面
2. 报表和导出
3. 前端按需拆包优化
4. Kubernetes / NAS 实机部署验证与收口

## 4. 当前业务角色

系统现在按这 4 个角色运行：

### 4.1 管理员

- 默认部署时只预置管理员账号
- 管理员不参与日常库存业务流转
- 可以进入用户管理页面
- 可以创建用户并分配角色
- 可以维护管理员、采购主管、CNC主管、总经理账号

### 4.2 CNC主管

- 可以看库存
- 可以看 Dashboard
- 可以新建刀具和编号
- 可以提交采购申请
- 只能看自己提交的采购申请
- 不能执行入库
- 不能执行出库
- 不能执行回收
- 不能执行损耗

### 4.3 采购主管

- 可以看全部库存
- 可以看全部采购申请
- 可以执行入库
- 可以执行出库
- 可以执行回收
- 可以执行损耗
- 可以维护供应商
- 可以维护分类
- 可以创建物品
- 可以进入用户管理页面
- 可以新增和维护 CNC主管 账号

### 4.4 总经理

- 只读
- 可以看 Dashboard
- 可以看实时库存
- 不能看采购申请页面
- 不能做出入库操作
- 不能建物品

## 5. 当前已实现的页面与行为

### 5.1 登录页

- 用户名密码登录
- JWT 登录态保存在浏览器 `localStorage`
- 登录页不预填任何账号密码

### 5.2 用户管理页

- 管理员可见
- 采购主管可见
- 管理员可以新增和编辑全部角色
- 采购主管只能新增和编辑 CNC主管
- 支持修改用户名、姓名、角色、状态
- 支持重置密码

### 5.3 Dashboard

- 物品总数
- 可用库存总量
- 在外数量总量
- 待处理数量总量
- 低库存提醒
- 最近单据
- 总经理看到的右侧列表更偏库存概览

### 5.4 库存页

- 支持按编码、名称、规格、品牌搜索
- 点击行可打开物品详情
- 采购主管可手动调整可用 / 在外 / 待处理数量
- 采购主管可直接在库存页编辑物品主数据
- 手动调整时要求填写原因，并写入操作日志
- 详情里可以查看：
  - 当前库存
  - 最近价格
  - 均价
  - 最低价
  - 最高价
  - 最近供应商
  - 历史采购价格列表

### 5.5 物品页

- CNC主管和采购主管可新增物品
- 总经理只能看，不能新增

### 5.6 出入库页

- 只有采购主管可见和可用
- 支持：
  - 入库
  - 出库
  - 回收
  - 损耗
- 入库时供应商必填
- 入库时供应商可以直接输入，不必先去供应商页面建档
- 已有入库单可以修改供应商、单价、渠道和备注

### 5.7 采购申请页

- CNC主管和采购主管可见
- CNC主管只能看自己的申请
- 采购主管能看所有申请
- 选择物品后会显示历史价格参考
- 采购主管可以勾选多条待处理申请汇总成采购清单
- 采购主管可以在同一页切到采购清单标签，维护参考价格、参考供应商并执行到货入库
- 采购清单到货入库支持分批到货和部分入库
- 采购清单里的参考供应商支持直接输入，不止是选择

## 6. 历史价格功能是如何实现的

当前历史价格不是单独做一张价格表，而是直接从真实入库明细里提取。

数据来源：

- `stock_in_items.unit_price`
- `stock_in_items.qty`
- `stock_in.supplier_id`
- `stock_in.in_time`

后端接口：

- `GET /api/items/:id`

这个接口会返回：

- 物品主数据
- 当前库存
- `priceSummary`
  - 最近价格
  - 最近供应商
  - 最近采购时间
  - 均价
  - 最低价
  - 最高价
  - 价格记录数
- `priceHistory`
  - 最近 20 条历史采购记录
- `recentStockOuts`

当前前端使用这个接口的地方有两个：

- 库存页行点击后的详情抽屉
- 采购申请页的历史价格参考卡片

## 7. 权限是如何实现的

### 7.1 后端权限

后端使用 JWT + `requireAuth` + `requireRole(...)`。

关键逻辑文件：

- `backend/src/middleware/auth.ts`
- `backend/src/routes/*.ts`

权限现在是后端真实拦截，不只是前端隐藏按钮。

例如：

- `stock-in` / `stock-out` / `recoveries` / `losses` 只允许 `PROCUREMENT_MANAGER`
- `purchase-requests` 允许 `CNC_SUPERVISOR` 和 `PROCUREMENT_MANAGER`
- `items` 的创建允许 `CNC_SUPERVISOR` 和 `PROCUREMENT_MANAGER`
- `purchase-requests` 列表在后端会根据角色过滤：
  - 采购主管看全部
  - CNC主管只看自己

### 7.2 前端权限

前端根据登录用户角色动态裁剪菜单和页面能力。

关键逻辑文件：

- `frontend/src/lib/roles.ts`
- `frontend/src/App.tsx`

前端主要做两件事：

- 隐藏不该看到的菜单
- 即使页面被打开，也显示只读或无权限提示

## 8. 数据库设计概况

Prisma schema 文件：

- `backend/prisma/schema.prisma`

主要表：

- `users`
- `categories`
- `suppliers`
- `warehouses`
- `items`
- `inventory`
- `stock_in`
- `stock_in_items`
- `stock_out`
- `stock_out_items`
- `recovery_records`
- `loss_records`
- `purchase_requests`
- `purchase_request_items`
- `purchase_lists`
- `purchase_list_items`
- `purchase_list_request_items`
- `stock_counts`
- `stock_count_items`
- `operation_logs`

说明文档：

- `docs/database-design.md`

## 9. 已做过的数据库迁移

当前已经有两版 migration：

1. `20260420170629_init`
   - 初始化全量表结构
2. `20260421100000_user_roles_refactor`
   - 把旧角色枚举迁移成现在的三角色模型

迁移目录：

- `backend/prisma/migrations`

## 10. 为什么 migration 需要 root 连接串

本地开发用的 Prisma `migrate dev` 默认要创建 shadow database。

普通应用账号 `tooling_user` 没有创建数据库权限，所以本地执行 `migrate dev` 时需要临时使用 root：

```bash
cd backend
DATABASE_URL="mysql://root:root_password@127.0.0.1:3306/tooling_inventory" npx prisma migrate dev
```

应用平时运行不需要 root，正常仍然用：

```text
mysql://tooling_user:tooling_password@127.0.0.1:3306/tooling_inventory
```

## 11. 启动方式

### 11.1 推荐：服务器 / CT 内 Docker Compose 部署

```bash
cp .env.example .env
```

编辑根目录 `.env`，至少改掉这些值：

- `APP_PUBLIC_URL`
- `FRONTEND_PORT`
- `MYSQL_PASSWORD`
- `MYSQL_ROOT_PASSWORD`
- `JWT_SECRET`
- `INITIAL_ADMIN_USERNAME`
- `INITIAL_ADMIN_PASSWORD`

如果你就固定使用这个内网域名，保持：

```text
APP_PUBLIC_URL=http://www.ruihongcnc.com
```

服务器场景建议同时把：

```text
FRONTEND_PORT=80
```

设成 `80`，这样浏览器就可以直接通过域名访问，不用额外带端口。

如果你是纯内网访问，不需要公网解析，也不需要 HTTPS。关键是让局域网里的电脑能把：

```text
www.ruihongcnc.com
```

解析到你的 CT / 服务器内网 IP，例如：

```text
192.168.1.50 -> www.ruihongcnc.com
```

推荐顺序：

1. 最好：在路由器、AdGuard Home、Pi-hole、OPNsense、DNSMasq 之类的局域网 DNS 里加一条主机记录
2. 次选：如果电脑不多，直接在每台电脑的 `hosts` 文件里加

例如 macOS / Linux / Windows 都可以做成类似：

```text
192.168.1.50 www.ruihongcnc.com
```

注意：

- 你的 CT IP 最好固定，不要每次重启变
- 只要 DNS/hosts 能解析到这台 CT，浏览器输入 `http://www.ruihongcnc.com` 就会进入这个系统

然后在 CT 内直接启动：

```bash
docker compose up -d --build
```

或者用脚本：

```bash
./full-deploy.sh
```

如果你想临时打开 Adminer 调试数据库：

```bash
./full-deploy.sh --with-adminer
```

首次构建会拉镜像并安装依赖，时间会久一点。当前 Compose 设计已经收成服务器友好模式：

- 只有前端端口会对外暴露
- 后端只在 Compose 内部网络提供给前端 `/api` 反代
- MySQL 不再直接暴露到宿主机 / 公网
- Adminer 默认不启动

说明：

- 登录页不会再预填用户名和密码
- 系统不会再自动写入 demo 账号、示例物品、示例供应商
- `./full-deploy.sh` 会优先读取根目录 `.env` 里的 bootstrap 管理员账号；如果没填，再交互询问
- 业务角色账号由管理员登录后在“用户管理”页面创建
- 浏览器统一通过前端域名访问，接口走同域 `/api`

停止：

```bash
docker compose down
```

如果想连数据卷一起清掉，使用：

```bash
docker compose down -v
```

如果你要“一键删干净再重开”，直接用：

```bash
./fresh-start.sh
```

它会：

- 删掉容器
- 删掉网络
- 删掉 MySQL 数据卷
- 重新构建并启动整套服务

执行完以后，数据库会回到全新状态，只保留 migration 和 seed 初始化数据。

如果你要“真正空库”，连 seed 默认数据都不要：

```bash
./fresh-start.sh --empty
```

这个模式会：

- 清掉原有 MySQL 数据卷
- 重新建表
- 不写任何管理员账号
- 不写任何业务初始化数据

### 11.2 从现有机器迁移到 CT / 服务器

推荐迁移方式不是直接搬 Docker volume，而是导出：

- 当前部署用的 `.env`
- 当前数据库 SQL dump
- 一份干净的应用源码包

这样跨机器、跨 Docker 环境最稳，也最容易排错。

在旧机器上执行：

```bash
./scripts/export-migration-bundle.sh
```

执行后会生成：

```text
migration-bundles/mills-inventory-migration-时间戳.tar.gz
```

把这个文件传到你的 CT，例如：

```bash
scp migration-bundles/mills-inventory-migration-*.tar.gz root@你的CT_IP:/root/
```

然后在 CT 内执行：

```bash
cd /root
tar -xzf mills-inventory-migration-*.tar.gz
chmod +x restore-migration-bundle.sh
./restore-migration-bundle.sh mills-inventory-migration-*.tar.gz --target-dir /opt/mills-inventory --force
```

恢复脚本会自动做这些事：

- 解开应用源码到目标目录
- 恢复根目录 `.env`
- 启动 MySQL
- 导入旧数据库
- 跑一次 `db-init`（禁用 seed 覆盖）
- 启动前端和后端

恢复完成后，你的目标服务目录就是：

```text
/opt/mills-inventory
```

后续在 CT 里管理这套系统，直接：

```bash
cd /opt/mills-inventory
docker compose ps
docker compose logs -f
./cleanup.sh --force
./full-deploy.sh
```

### 11.3 开发模式：前后端本机启动

```bash
npm --prefix backend install
npm --prefix frontend install
```

先只起数据库：

```bash
npm run db:up
```

再生成 Prisma Client：

```bash
npm --prefix backend run prisma:generate
```

需要手动建表/迁移时：

```bash
cd backend
DATABASE_URL="mysql://root:root_password@127.0.0.1:3306/tooling_inventory" npx prisma migrate dev
```

初始化数据：

```bash
npm --prefix backend run db:seed
```

启动后端：

```bash
npm --prefix backend run dev
```

启动前端：

```bash
npm --prefix frontend run dev
```

## 12. 常用命令

### 12.1 根目录

```bash
./full-deploy.sh
./full-deploy.sh --with-adminer
./cleanup.sh --force
./fresh-start.sh
./fresh-start.sh --empty
./scripts/export-migration-bundle.sh
./scripts/restore-migration-bundle.sh /path/to/mills-inventory-migration-xxxx.tar.gz --target-dir /opt/mills-inventory --force
npm run db:up
npm run db:down
npm run db:logs
npm run stack:up
npm run stack:down
npm run stack:logs
npm run stack:deploy
npm run stack:destroy
npm run stack:fresh
npm run k8s:deploy
npm run k8s:destroy
npm run build
npm run test:business
npm run test:e2e
```

说明：

- `npm run test:e2e` 会自动拉起 MySQL、重建独立的 `tooling_inventory_e2e_test` 测试库，再启动前后端做 Playwright 浏览器回归
- 当前 E2E 默认使用本机已安装的 Google Chrome

### 12.2 后端

```bash
npm --prefix backend run dev
npm --prefix backend run build
npm --prefix backend run prisma:format
npm --prefix backend run prisma:validate
npm --prefix backend run prisma:generate
npm --prefix backend run db:seed
```

### 12.3 前端

```bash
npm --prefix frontend run dev
npm --prefix frontend run build
```

## 13. 当前访问地址

- 正式访问入口：根目录 `.env` 里的 `APP_PUBLIC_URL`
- 默认本地端口映射：`http://localhost:5173`
- 后端接口：不直接对外开放，由前端同域代理到 `/api`
- MySQL：不直接对外开放
- Adminer：默认关闭，只在 `--with-adminer` 或 `docker compose --profile tools ...` 时启动

## 14. 当前账号

系统不再内置任何 demo 账号。

默认部署时：

- 推荐直接在根目录 `.env` 里设置：
  - `INITIAL_ADMIN_USERNAME`
  - `INITIAL_ADMIN_PASSWORD`
  - `INITIAL_ADMIN_REAL_NAME`
- 如果 `.env` 没填，`./full-deploy.sh` 会提示你输入一组 bootstrap 管理员账号
- 管理员登录后，再在用户管理页面创建采购主管、CNC主管、总经理账号
- 系统不会在页面里预填用户名和密码

## 15. Adminer 登录信息

默认生产部署不启用 Adminer。

如需临时调试：

```bash
./full-deploy.sh --with-adminer
```

然后访问：

```text
http://127.0.0.1:8080
```

容器内连接参数：

```text
系统：MySQL
服务器：mysql
用户名：tooling_user
密码：使用你在根目录 .env 中配置的 MYSQL_PASSWORD
数据库：tooling_inventory
```

## 16. 关键目录与关键文件

### 16.1 根目录

- `README.md`
- `README_dev.md`
- `docker-compose.yml`
- `deploy/k8s/*`
- `full-deploy.sh`
- `cleanup.sh`
- `fresh-start.sh`
- `package.json`
- `scripts/*`

### 16.2 后端

- `backend/package.json`
- `backend/Dockerfile`
- `backend/prisma.config.ts`
- `backend/prisma/schema.prisma`
- `backend/prisma/seed.ts`
- `backend/prisma/migrations/*`
- `backend/scripts/init-db.mjs`
- `backend/src/app.ts`
- `backend/src/index.ts`
- `backend/src/middleware/auth.ts`
- `backend/src/routes/*`
- `backend/src/lib/prisma.ts`
- `backend/src/lib/inventory.ts`

### 16.3 前端

- `frontend/Dockerfile`
- `frontend/nginx.conf`
- `frontend/src/App.tsx`
- `frontend/src/lib/roles.ts`
- `frontend/src/components/ItemPriceHistory.tsx`
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/pages/Inventory.tsx`
- `frontend/src/pages/Items.tsx`
- `frontend/src/pages/PurchaseRequests.tsx`
- `frontend/src/pages/StockMovements.tsx`
- `frontend/src/pages/Users.tsx`

### 16.4 文档

- `README_dev.md`：原始需求与业务说明
- `docs/database-design.md`：数据库设计说明

## 17. 当前已实现 API 概览

### 17.1 鉴权

- `POST /api/auth/login`
- `GET /api/auth/me`

### 17.2 Dashboard

- `GET /api/dashboard/summary`

### 17.3 分类 / 供应商 / 物品

- `GET /api/categories`
- `GET /api/categories/tree`
- `POST /api/categories`
- `GET /api/suppliers`
- `POST /api/suppliers`
- `GET /api/items`
- `GET /api/items/:id`
- `POST /api/items`
- `PATCH /api/items/:id`

### 17.4 库存与流水

- `GET /api/inventory/list`
- `PATCH /api/inventory/:id`
- `GET /api/stock-in`
- `POST /api/stock-in`
- `PATCH /api/stock-in/:id`
- `GET /api/stock-out`
- `POST /api/stock-out`
- `GET /api/recoveries`
- `POST /api/recoveries`
- `GET /api/losses`
- `POST /api/losses`

### 17.5 采购申请 / 采购清单

- `GET /api/purchase-requests`
- `POST /api/purchase-requests`
- `GET /api/purchase-lists`
- `POST /api/purchase-lists`
- `PATCH /api/purchase-lists/:id`
- `POST /api/purchase-lists/:id/stock-in`

## 18. 我是如何把这个版本做出来的

### 18.1 第一步：先落数据库

先根据 `README_dev.md` 把实体关系落成 Prisma schema，而不是先拍脑袋写前端页面。

原因：

- 库存系统的核心是状态流转
- 角色和流水关系会反向约束 API
- 价格历史依赖真实入库明细

### 18.2 第二步：先跑通后端主链路

先把这些打通：

- 登录
- 物品
- 库存
- 入库
- 出库
- 回收
- 损耗
- 采购申请

### 18.3 第三步：再接前端后台界面

前端不是先做好看页面，而是先做能操作链路的后台界面。

### 18.4 第四步：再补角色权限和价格历史

因为用户角色和“选中物品看价格”这两个点，必须基于已存在的数据链路来做，不能脱离真实入库明细单独拼假数据。

## 19. 当前已知问题 / 技术债

### 19.1 前端打包较大

Vite build 会有大包 warning：

- Ant Design 组件较多
- 目前还没做按路由拆包

这不影响开发，但后面最好做：

- 路由级动态 import
- 手动 chunk

### 19.2 用户管理还没有界面

账号目前靠 seed 初始化，没有后台用户管理页面。

### 19.3 采购闭环第一版已打通

现在已经有采购申请、采购清单和到货转入库闭环，但还有这些技术债：

- 采购清单分批入库目前依赖历史 `stock_in_items` 汇总，没有单独冗余“累计已入库数量”字段
- 采购参考还没有独立页面
- 还没有导出能力

### 19.4 Dashboard 还是第一版

现在偏基础统计，后面还需要：

- 更细的待办
- 更明确的采购风险
- 更明确的刀具在外与待处理分析

### 19.5 README_dev.md 和当前实现并不完全同步

`README_dev.md` 是原始需求文档，当前代码是“可运行第一版”，还没有把里面所有模块都落完。

### 19.6 Kubernetes 清单已补，但还没做 NAS 实机验证

当前仓库已经有 `deploy/k8s/*`：

- `namespace.yaml`
- `mysql.yaml`
- `backend.yaml`
- `frontend.yaml`
- `adminer.yaml`

这套清单已经按当前镜像约定写好，但还没有在真实 NAS / k3s 集群上做一轮端到端验收。

## 20. 下一步怎么做

建议下一个 session 直接做下面这条主线：

### 20.1 优先任务

做用户管理和更细权限控制：

- 新增用户列表与创建/停用界面
- 区分查看权限和操作权限
- 补采购主管之外的只读/半只读场景
- 清理目前靠 seed 初始化账号的临时方案

### 20.2 接着做

- 用户管理页
- 权限配置页
- 采购参考独立页面
- Excel 导出
- 盘点页
- 年度报表

### 20.3 部署侧下一步

部署链路现在已经有基础版，后面更值得做的是：

- 换成正式镜像仓库地址
- 补 NAS / k3s 实机验证
- 视情况补 Ingress / 域名 / HTTPS

## 21. Kubernetes / NAS 迁移规划

后续建议迁到 k3s 或 NAS 上的轻量 Kubernetes：

- MySQL：StatefulSet + PVC
- 后端：Deployment + Secret + Service
- 前端：静态资源镜像 + Ingress
- Prisma migration：Job
- 配置：
  - `DATABASE_URL` 放 Secret
  - `JWT_SECRET` 放 Secret
  - 前端 API 地址放 ConfigMap 或构建变量

## 22. 下一个 Session 的建议起手方式

可以直接这样说：

```text
先读 README.md，然后继续做用户管理页面。
```

或者更具体：

```text
先读 README.md，按里面 20.1 的计划继续做用户管理和更细权限控制。
```

如果想让我先快速确认当前状态，可以这样说：

```text
先按 README.md 检查当前前后端和数据库是否还能正常运行，然后继续开发。
```

## 23. 下一个 Session 的检查清单

新 session 进入后建议先跑：

```bash
docker compose ps
curl -s http://localhost:4000/api/health
curl -s -I http://localhost:5173/
```

如果数据库没起来：

```bash
npm run db:up
```

如果后端没起来：

```bash
npm --prefix backend run dev
```

如果前端没起来：

```bash
npm --prefix frontend run dev
```

## 24. 本 README 的定位

以后这个文件应持续维护，不只是“怎么启动”，而是要始终回答下面几个问题：

- 这个项目现在做到哪了
- 哪些已经能跑
- 哪些还没做
- 角色规则是什么
- 数据表怎么设计
- 下一个阶段优先做什么

如果后续代码和 README 不一致，优先更新 README。
