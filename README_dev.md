# 刀具及杂项库存与采购管理系统 README

## 1. 项目概述

### 1.1 项目名称
刀具及杂项库存与采购管理系统  
Tooling Inventory & Procurement Management System

### 1.2 项目背景
本系统用于管理 CNC 部门刀具及其他杂项物料的入库、库存、出库、回收、损耗、采购申请与采购参考，目标是实现“拿进拿出都有数”，降低刀具流失，提高库存透明度，并支持年底对账与差异控制。

### 1.3 项目目标
本系统需要解决以下核心问题：

1. 所有物品的入库来源可追溯。
2. 所有物品的出库去向可追踪。
3. 刀具形成完整闭环：入库 → 领用 → 回收 → 留用/报废/损耗。
4. 支持需求者提交采购需求，采购人员汇总采购。
5. 支持历史采购价格和渠道查询，便于采购决策。
6. 登录后可直接看到低库存提醒。
7. 支持 Excel 导出。
8. 支持本地开发、后续 NAS 部署、并支持外网访问。

---

## 2. 系统定位

本系统是一个 **Web 端库存与领用追踪系统**，优先支持桌面浏览器，同时页面需要具备基础响应式能力，以便手机浏览器访问。

### 2.1 使用场景
- 仓管录入入库信息
- 员工领用刀具和杂项
- 回收旧刀具并判断后续用途
- 采购人员查看历史采购信息
- 需求者查看库存并提交采购申请
- 管理人员查看库存预警和年度差异

### 2.2 系统特性
- 单仓库模式（仓库固定为 1）
- 支持自定义大类/小类
- 不需要扫码
- 支持刀具在外数量管理
- 支持回收后重新入可用库存
- 支持低库存提醒
- 支持导出 Excel
- 支持登录鉴权与权限控制

---

## 3. 技术架构建议

### 3.1 推荐技术栈
#### 前端
- React
- TypeScript
- Vite
- Ant Design

#### 后端
- Node.js
- Express
- Prisma ORM

#### 数据库
- MySQL

#### 其他
- JWT：登录认证
- bcrypt：密码加密
- ExcelJS：Excel 导出
- Docker / Docker Compose：部署
- Nginx：反向代理

### 3.2 开发与部署方式
#### 本地开发
- 前端运行在 Mac 本地
- 后端运行在 Mac 本地
- MySQL 可本地安装或使用 Docker

#### 生产部署
- NAS 上通过 Docker 部署
- 前端、后端、数据库独立容器
- Nginx 做反向代理
- 外网通过域名 + HTTPS 访问
- MySQL 不直接暴露公网

---

## 4. 角色与权限

### 4.1 角色定义
#### 管理员
- 管理用户
- 管理分类
- 管理物品
- 管理库存
- 管理入库 / 出库 / 回收 / 损耗 / 采购单
- 查看所有报表

#### 仓管 / 采购
- 入库
- 出库
- 回收登记
- 损耗登记
- 查看库存
- 管理采购申请与采购清单
- 导出 Excel

#### 普通需求者
- 查看库存
- 提交采购申请
- 查看个人申请记录

---

## 5. 核心业务规则

### 5.1 基础规则
1. 仓库只有一个，warehouse_id 固定为 1。
2. 分类需要支持大类、小类自定义。
3. 所有库存变更必须通过业务单据完成，不能直接手工修改总库存。
4. 所有关键操作需要记录操作日志。
5. 所有数据保留操作时间、操作人信息。

### 5.2 刀具闭环规则
1. 刀具出库后，不视为消失，而是进入“在外数量”。
2. 回收时必须登记回收状态：
   - 可继续使用
   - 可开粗使用
   - 待判定
   - 修磨后可用
   - 直接报废
3. 如果状态是“可继续使用”或“可开粗使用”，则回到可用库存。
4. 如果状态是“待判定”或“修磨后可用”，则进入待处理库存。
5. 如果状态是“直接报废”，则进入报废统计，不回可用库存。
6. 如果刀具断刀、遗失、自然损耗，需要单独登记“损耗记录”。

### 5.3 年度对账规则
系统需要支持以下对账逻辑：

**期初库存 + 年度入库 - 年度领用 + 年度回收 - 年度确认损耗 = 期末理论库存**

系统报表应能够展示：
- 当前可用库存
- 当前在外数量
- 当前待处理数量
- 已确认损耗数量
- 已报废数量
- 未解释差异数量

---

## 6. 功能模块说明

### 6.1 登录与权限管理
- 用户登录
- 获取当前用户信息
- 修改密码
- 权限控制

### 6.2 分类管理
- 新增大类
- 新增小类
- 编辑分类
- 停用分类
- 分类树展示

### 6.3 物品主数据管理
- 新增物品
- 编辑物品
- 设置分类
- 设置单位
- 设置安全库存
- 设置默认供应商和默认价格

### 6.4 入库管理
- 新增入库
- 查看入库记录
- 查看入库详情
- 导出入库记录

### 6.5 库存管理
- 按分类查看库存
- 查看物品库存详情
- 搜索与筛选
- 低库存提醒
- 导出库存表

### 6.6 出库管理
- 新增领用出库
- 记录领取人、用途、时间、数量
- 自动更新在外数量

### 6.7 回收管理
- 新增回收记录
- 选择回收状态
- 自动决定是否回到可用库存

### 6.8 损耗登记
- 记录断刀、报废、遗失、自然损耗
- 自动冲减在外数量或待处理数量

### 6.9 采购参考
- 按名称 / 规格 / 品牌搜索
- 查看历史采购价格、时间、供应商

### 6.10 采购申请
- 需求者提交采购申请
- 支持从库存页直接发起申请

### 6.11 采购清单
- 汇总多个采购申请
- 参考历史价格和供应商
- 跟踪采购状态
- 到货后可转入入库

### 6.12 报表中心
- 入库报表
- 出库报表
- 库存报表
- 低库存报表
- 刀具流转闭环报表
- 年度差异对账报表

---

## 7. 数据库结构设计

> 说明：以下为正式数据库表设计建议，适合使用 MySQL + Prisma 实现。

### 7.1 users 用户表
| 字段名 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| username | varchar(50) | 登录账号 |
| password_hash | varchar(255) | 密码哈希 |
| real_name | varchar(50) | 真实姓名 |
| role | varchar(20) | 角色：admin / keeper / requester |
| status | tinyint | 状态：1启用 0停用 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 7.2 categories 分类表
| 字段名 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| name | varchar(100) | 分类名称 |
| parent_id | bigint | 上级分类ID，顶级分类为空 |
| level | int | 层级：1大类，2小类 |
| sort_order | int | 排序 |
| status | tinyint | 状态 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 7.3 suppliers 供应商表
| 字段名 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| name | varchar(100) | 供应商名称 |
| contact_person | varchar(50) | 联系人 |
| phone | varchar(50) | 联系方式 |
| channel | varchar(50) | 渠道，如淘宝、京东、线下 |
| remark | text | 备注 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 7.4 items 物品表
| 字段名 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| item_code | varchar(50) | 物品编码 |
| name | varchar(100) | 名称 |
| specification | varchar(200) | 规格型号 |
| brand | varchar(100) | 品牌 |
| category_id | bigint | 小类ID |
| unit | varchar(20) | 单位 |
| safe_stock | decimal(10,2) | 安全库存 |
| default_supplier_id | bigint | 默认供应商ID |
| default_price | decimal(10,2) | 默认单价 |
| status | tinyint | 状态 |
| remark | text | 备注 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 7.5 inventory 库存表
| 字段名 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| item_id | bigint | 物品ID |
| warehouse_id | bigint | 仓库ID，固定为1 |
| available_qty | decimal(10,2) | 可用库存 |
| borrowed_qty | decimal(10,2) | 在外数量 |
| pending_qty | decimal(10,2) | 待处理数量 |
| updated_at | datetime | 更新时间 |

### 7.6 stock_in 入库单主表
| 字段名 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| in_no | varchar(50) | 入库单号 |
| in_type | varchar(30) | 入库类型 |
| operator_id | bigint | 操作人 |
| supplier_id | bigint | 供应商ID |
| in_time | datetime | 入库时间 |
| total_amount | decimal(12,2) | 总金额 |
| remark | text | 备注 |
| created_at | datetime | 创建时间 |

### 7.7 stock_in_items 入库单明细表
| 字段名 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| stock_in_id | bigint | 入库单主表ID |
| item_id | bigint | 物品ID |
| qty | decimal(10,2) | 数量 |
| unit_price | decimal(10,2) | 单价 |
| total_price | decimal(12,2) | 小计 |
| purchase_channel | varchar(100) | 购买渠道 |
| remark | text | 备注 |
| created_at | datetime | 创建时间 |

### 7.8 stock_out 出库单主表
| 字段名 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| out_no | varchar(50) | 出库单号 |
| receiver_id | bigint | 领取人ID |
| receiver_name | varchar(50) | 领取人姓名（冗余） |
| department | varchar(50) | 部门 |
| purpose | varchar(200) | 用途 / 机台 / 工单 |
| operator_id | bigint | 操作人 |
| out_time | datetime | 出库时间 |
| remark | text | 备注 |
| created_at | datetime | 创建时间 |

### 7.9 stock_out_items 出库单明细表
| 字段名 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| stock_out_id | bigint | 出库单ID |
| item_id | bigint | 物品ID |
| qty | decimal(10,2) | 数量 |
| created_at | datetime | 创建时间 |

### 7.10 recovery_records 回收记录表
| 字段名 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| item_id | bigint | 物品ID |
| related_stock_out_item_id | bigint | 对应出库明细ID |
| qty | decimal(10,2) | 回收数量 |
| returned_by | varchar(50) | 归还人 |
| recovery_time | datetime | 回收时间 |
| recovery_status | varchar(30) | reusable / roughing_reusable / pending_inspection / repairable / scrapped |
| remark | text | 备注 |
| created_at | datetime | 创建时间 |

### 7.11 loss_records 损耗记录表
| 字段名 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| item_id | bigint | 物品ID |
| qty | decimal(10,2) | 数量 |
| loss_type | varchar(30) | normal_wear / broken / scrapped / lost / other |
| related_stock_out_item_id | bigint | 对应出库明细ID，可空 |
| responsible_person | varchar(50) | 责任人 |
| record_time | datetime | 记录时间 |
| remark | text | 备注 |
| created_at | datetime | 创建时间 |

### 7.12 purchase_requests 采购申请主表
| 字段名 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| request_no | varchar(50) | 申请单号 |
| requester_id | bigint | 申请人 |
| status | varchar(20) | pending / merged / purchased / cancelled |
| priority | varchar(20) | low / medium / high / urgent |
| request_time | datetime | 申请时间 |
| remark | text | 备注 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 7.13 purchase_request_items 采购申请明细表
| 字段名 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| purchase_request_id | bigint | 采购申请主表ID |
| item_id | bigint | 物品ID，可空 |
| requested_name | varchar(100) | 申请名称 |
| requested_specification | varchar(200) | 申请规格 |
| requested_qty | decimal(10,2) | 申请数量 |
| reason | varchar(255) | 申请原因 |
| created_at | datetime | 创建时间 |

### 7.14 purchase_lists 采购清单主表
| 字段名 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| list_no | varchar(50) | 采购清单编号 |
| status | varchar(20) | pending / purchasing / arrived / completed |
| created_by | bigint | 创建人 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 7.15 purchase_list_items 采购清单明细表
| 字段名 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| purchase_list_id | bigint | 采购清单主表ID |
| item_id | bigint | 物品ID |
| qty | decimal(10,2) | 采购数量 |
| reference_price | decimal(10,2) | 参考价格 |
| reference_supplier_id | bigint | 参考供应商 |
| status | varchar(20) | pending / ordered / arrived / stocked_in |
| remark | text | 备注 |
| created_at | datetime | 创建时间 |

### 7.16 operation_logs 操作日志表
| 字段名 | 类型 | 说明 |
|---|---|---|
| id | bigint | 主键 |
| user_id | bigint | 操作用户 |
| module | varchar(50) | 模块名 |
| action | varchar(50) | 操作类型 |
| target_id | bigint | 目标记录ID |
| detail | text | 操作详情 |
| created_at | datetime | 创建时间 |

---

## 8. 页面原型说明

> 以下为页面原型结构说明，用于前端开发和后续 UI 设计。当前阶段以后台管理系统为主，采用企业后台风格。

### 8.1 登录页
#### 页面元素
- Logo / 系统名称
- 用户名输入框
- 密码输入框
- 登录按钮

#### 交互说明
- 输入用户名和密码后点击登录
- 登录成功进入 Dashboard
- 登录失败提示错误信息

---

### 8.2 Dashboard 首页
#### 页面区域
1. 顶部统计卡片
   - 物品种类数
   - 当前可用库存总数
   - 当前在外数量总数
   - 今日入库数量
   - 今日出库数量

2. 低库存提醒区域
   - 显示低于安全库存的物品列表
   - 可点击跳转库存详情

3. 待处理事项区域
   - 待处理采购申请
   - 待判定回收记录
   - 待处理损耗确认

4. 最近操作区域
   - 最近入库记录
   - 最近出库记录

#### 目标
用户登录后，一眼看清当前最重要的库存问题和待办事项。

---

### 8.3 分类管理页
#### 左侧
- 分类树

#### 右侧
- 分类明细表
- 新增大类按钮
- 新增小类按钮
- 编辑 / 停用 / 删除按钮

#### 目标
支持管理员自由维护大类和小类。

---

### 8.4 物品管理页
#### 顶部筛选区
- 按名称搜索
- 按规格搜索
- 按分类筛选
- 按状态筛选

#### 中间表格区
字段建议：
- 物品编码
- 名称
- 规格型号
- 品牌
- 大类
- 小类
- 单位
- 安全库存
- 默认供应商
- 默认价格
- 状态

#### 操作
- 新增物品
- 编辑物品
- 查看详情

---

### 8.5 入库页
#### 左侧表单区
- 选择或搜索物品
- 填写数量
- 填写单价
- 选择供应商 / 购买渠道
- 入库时间
- 备注
- 提交入库按钮

#### 右侧历史区
- 最近入库记录列表

#### 下方表格
- 入库记录查询表

---

### 8.6 库存页
#### 顶部筛选区
- 按名称搜索
- 按规格搜索
- 按大类筛选
- 按小类筛选
- 按状态筛选（正常 / 低库存 / 缺货）

#### 左侧
- 分类树

#### 右侧库存表格
字段建议：
- 名称
- 规格
- 品牌
- 大类
- 小类
- 可用库存
- 在外数量
- 待处理数量
- 安全库存
- 状态
- 最近入库时间
- 最近出库时间

#### 行级操作
- 查看详情
- 发起采购申请
- 导出 Excel

#### 详情页内容
- 基础信息
- 当前库存状态
- 入库历史
- 出库历史
- 回收历史
- 损耗历史
- 历史采购参考

---

### 8.7 出库页
#### 表单内容
- 搜索/选择物品
- 自动显示当前可用库存
- 输入出库数量
- 选择领取人
- 填写部门
- 填写用途 / 机台 / 工单
- 备注
- 提交出库按钮

#### 下方表格
- 最近出库记录

#### 交互逻辑
- 库存不足时禁止提交
- 提交后自动扣减可用库存并增加在外数量

---

### 8.8 回收页
#### 表单内容
- 搜索物品或关联出库记录
- 输入回收数量
- 填写归还人
- 选择回收状态
- 备注
- 提交回收按钮

#### 回收状态选项
- 可继续使用
- 可开粗使用
- 待判定
- 修磨后可用
- 直接报废

#### 交互逻辑
- 根据状态自动更新库存状态

---

### 8.9 损耗登记页
#### 表单内容
- 选择物品
- 输入数量
- 选择损耗原因
- 填写责任人
- 填写备注
- 提交按钮

#### 损耗原因
- 正常磨损
- 断刀
- 报废
- 遗失
- 其他

---

### 8.10 采购参考页
#### 顶部搜索区
- 名称搜索
- 规格搜索
- 品牌搜索
- 供应商搜索

#### 结果表格
- 名称
- 规格
- 品牌
- 最近采购价
- 最低价
- 最高价
- 平均价
- 最近采购时间
- 最近供应商

#### 详情弹窗 / 详情页
- 历史入库单列表
- 每次采购的渠道、价格、时间、数量

---

### 8.11 采购申请页
#### 申请表单
- 物品名称
- 规格型号
- 申请数量
- 紧急程度
- 申请原因
- 备注
- 提交按钮

#### 列表区域
- 我的采购申请记录
- 状态显示

#### 状态
- 待处理
- 已加入采购清单
- 已采购
- 已取消

---

### 8.12 采购清单页
#### 顶部功能区
- 创建采购清单
- 汇总采购申请
- 导出采购清单

#### 表格字段
- 物品名称
- 规格
- 当前库存
- 安全库存
- 建议采购数量
- 参考价格
- 参考供应商
- 来源申请数
- 采购状态

#### 状态
- 待采购
- 采购中
- 已到货
- 已入库

#### 操作
- 更新状态
- 转入入库单

---

### 8.13 报表页
#### 报表类型
- 入库报表
- 出库报表
- 库存报表
- 低库存报表
- 刀具流转闭环报表
- 年度差异对账报表

#### 年度差异对账报表字段建议
- 物品名称
- 规格
- 期初库存
- 年度入库数
- 年度领用数
- 年度回收数
- 年度损耗数
- 当前可用库存
- 当前在外数量
- 理论结余
- 实际结余
- 差异
- 差异说明

---

## 9. 关键业务流程

### 9.1 入库流程
1. 选择物品或新增物品
2. 填写入库数量、单价、供应商、时间
3. 提交入库单
4. 系统更新库存
5. 系统保留采购历史

### 9.2 出库流程
1. 选择物品
2. 输入领取人、数量、用途
3. 提交出库单
4. 系统减少可用库存
5. 系统增加在外数量

### 9.3 回收流程
1. 选择物品或关联原出库记录
2. 输入回收数量
3. 选择回收状态
4. 提交回收记录
5. 系统根据状态处理库存

### 9.4 损耗流程
1. 选择物品
2. 录入损耗数量与原因
3. 提交损耗记录
4. 系统冲减在外或待处理数量

### 9.5 采购申请流程
1. 需求者查看库存
2. 库存不足时发起采购申请
3. 采购人员查看申请
4. 将申请汇总成采购清单
5. 到货后转入入库

---

## 10. API 模块建议

### 10.1 认证接口
- POST /api/auth/login
- GET /api/auth/me
- POST /api/auth/change-password

### 10.2 分类接口
- GET /api/categories/tree
- POST /api/categories
- PUT /api/categories/:id
- PATCH /api/categories/:id/status

### 10.3 物品接口
- GET /api/items
- GET /api/items/:id
- POST /api/items
- PUT /api/items/:id

### 10.4 入库接口
- GET /api/stock-in
- GET /api/stock-in/:id
- POST /api/stock-in

### 10.5 库存接口
- GET /api/inventory/summary
- GET /api/inventory/list
- GET /api/inventory/:itemId
- GET /api/inventory/low-stock
- GET /api/inventory/export

### 10.6 出库接口
- GET /api/stock-out
- GET /api/stock-out/:id
- POST /api/stock-out

### 10.7 回收接口
- GET /api/recoveries
- POST /api/recoveries

### 10.8 损耗接口
- GET /api/losses
- POST /api/losses

### 10.9 采购参考接口
- GET /api/purchase-reference/search
- GET /api/purchase-reference/:itemId

### 10.10 采购申请接口
- GET /api/purchase-requests
- POST /api/purchase-requests
- PUT /api/purchase-requests/:id/status

### 10.11 采购清单接口
- GET /api/purchase-lists
- POST /api/purchase-lists
- PUT /api/purchase-lists/:id/status

### 10.12 报表接口
- GET /api/reports/stock-in
- GET /api/reports/stock-out
- GET /api/reports/inventory
- GET /api/reports/low-stock
- GET /api/reports/tool-balance
- GET /api/reports/yearly-reconciliation

---

## 11. 本地开发建议

### 11.1 环境准备
- Node.js LTS
- MySQL 8.x
- npm / pnpm
- Docker（可选）
- Git

### 11.2 本地目录建议
/tooling-inventory-system
- /frontend
- /backend
- /docs
- docker-compose.yml
- README.md

### 11.3 开发顺序建议
1. 先确定数据库结构
2. 再实现后端 API
3. 再做前端页面
4. 再联调库存逻辑
5. 最后处理导出与部署

---

## 12. NAS 部署建议

### 12.1 部署结构
- frontend 容器
- backend 容器
- mysql 容器
- nginx 容器

### 12.2 安全建议
1. 后端 API 必须鉴权
2. 数据库不对公网开放
3. 使用 HTTPS
4. 使用强密码
5. 管理员定期备份数据库
6. 可选增加验证码或二次认证

---

## 13. 项目开发优先级

### P0 必做
- 登录认证
- 分类管理
- 物品管理
- 入库
- 库存查看
- 出库
- 回收
- 低库存提醒

### P1 高优先级
- 损耗登记
- 采购参考
- 采购申请
- 采购清单
- Excel 导出

### P2 后续增强
- 年度差异对账报表
- 更细的权限控制
- 移动端优化
- PWA 支持
- 审批流

---

## 14. 结论

本系统的核心不是简单记录库存数量，而是建立一套完整的刀具流转闭环管理机制，使管理者能够清楚知道：

- 物品从哪里来
- 物品去了哪里
- 哪些在库
- 哪些在外
- 哪些已回收
- 哪些已经报废或损耗
- 哪些差异仍未解释

通过这套系统，可以有效降低刀具流失，提高采购效率，并为年底盘点和责任追踪提供可靠依据。
