import { Alert, Card, Statistic, Table, Tag } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { isAdmin, isGeneralManager, isProcurementManager } from "../lib/roles";
import type { InventoryRow, User } from "../types";

// ── 类型定义 ──────────────────────────────────────────────

type PurchaseListStatus = "PENDING" | "PURCHASING" | "ARRIVED" | "COMPLETED" | "CANCELLED";
type RequestStatus = "PENDING" | "MERGED" | "PURCHASED" | "CANCELLED";

type CncSummary = {
  role: "CNC_SUPERVISOR";
  myRequestsPending: number;
  myRequestsMerged: number;
  myRequestsPurchased: number;
  myRequestsCancelled: number;
  borrowedQty: string;
  myRecentRequests: Array<{
    id: string;
    requestNo: string;
    status: RequestStatus;
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    requestTime: string;
    items: Array<{
      requestedName: string;
      requestedSpecification?: string | null;
      requestedQty: string;
      purchaseListLinks?: Array<{
        purchaseListItem: {
          purchaseList: { status: PurchaseListStatus };
        };
      }>;
    }>;
  }>;
};

type ManagementSummary = {
  role: "PROCUREMENT_MANAGER" | "GENERAL_MANAGER" | "ADMIN";
  itemCount: number;
  borrowedQty: string;
  pendingPurchaseRequests: number;
  pendingRecoveries: number;
  activePurchaseLists: number;
  monthlyPurchaseAmount: string;
  lowStockCount: number;
  lowStock: InventoryRow[];
  recentStockIns: Array<{
    id: string;
    inNo: string;
    inTime: string;
    totalAmount: string;
    supplier?: { name: string } | null;
  }>;
  recentStockOuts: Array<{
    id: string;
    outNo: string;
    outTime: string;
    receiverName: string;
  }>;
};

type Summary = CncSummary | ManagementSummary;

type DashboardPageProps = { user: User | null };

// ── 采购申请状态标签 ──────────────────────────────────────

function getEffectiveStatus(row: CncSummary["myRecentRequests"][number]): { label: string; color: string } {
  if (row.status === "PENDING")   return { label: "待处理",  color: "orange" };
  if (row.status === "CANCELLED") return { label: "已取消",  color: "default" };
  if (row.status === "PURCHASED") return { label: "已完成",  color: "green" };
  if (row.status === "MERGED") {
    const listStatus = row.items.find((i) => i.purchaseListLinks?.[0])?.purchaseListLinks?.[0]?.purchaseListItem.purchaseList.status;
    switch (listStatus) {
      case "PENDING":    return { label: "待下单",   color: "orange" };
      case "PURCHASING": return { label: "采购中",   color: "blue" };
      case "ARRIVED":    return { label: "部分到货", color: "cyan" };
      case "COMPLETED":  return { label: "已到货",   color: "green" };
      case "CANCELLED":  return { label: "清单取消", color: "default" };
      default:           return { label: "已汇总",   color: "blue" };
    }
  }
  return { label: row.status, color: "default" };
}

const PRIORITY_LABEL: Record<CncSummary["myRecentRequests"][number]["priority"], string> = {
  LOW: "低", MEDIUM: "普通", HIGH: "高", URGENT: "紧急",
};

// ── CNC主管视图 ───────────────────────────────────────────

function CncDashboard({ summary }: { summary: CncSummary }) {
  return (
    <>
      <div className="stat-grid">
        <Card>
          <Statistic
            title="待处理申请"
            value={summary.myRequestsPending}
            suffix="条"
            valueStyle={summary.myRequestsPending > 0 ? { color: "#d46b08" } : {}}
          />
        </Card>
        <Card>
          <Statistic
            title="已合并 / 采购中"
            value={summary.myRequestsMerged}
            suffix="条"
            valueStyle={summary.myRequestsMerged > 0 ? { color: "#1677ff" } : {}}
          />
        </Card>
        <Card>
          <Statistic
            title="已采购到货"
            value={summary.myRequestsPurchased}
            suffix="条"
          />
        </Card>
        <Card>
          <Statistic
            title="在外工件"
            value={Math.round(Number(summary.borrowedQty))}
            suffix="件"
          />
        </Card>
      </div>

      <Card title="我的采购申请" size="small">
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          locale={{ emptyText: "暂无采购申请" }}
          dataSource={summary.myRecentRequests}
          columns={[
            {
              title: "申请单号",
              dataIndex: "requestNo",
              width: 160,
            },
            {
              title: "申请时间",
              dataIndex: "requestTime",
              width: 120,
              render: (v: string) => dayjs(v).format("MM-DD HH:mm"),
            },
            {
              title: "紧急程度",
              dataIndex: "priority",
              width: 80,
              render: (v: CncSummary["myRecentRequests"][number]["priority"]) => PRIORITY_LABEL[v],
            },
            {
              title: "物品",
              render: (_: unknown, row: CncSummary["myRecentRequests"][number]) =>
                row.items
                  .map((i) => `${i.requestedName}${i.requestedSpecification ? ` / ${i.requestedSpecification}` : ""} × ${i.requestedQty}`)
                  .join("；"),
            },
            {
              title: "状态",
              width: 100,
              render: (_: unknown, row: CncSummary["myRecentRequests"][number]) => {
                const s = getEffectiveStatus(row);
                return <Tag color={s.color}>{s.label}</Tag>;
              },
            },
          ]}
        />
      </Card>
    </>
  );
}

// ── 管理视图（采购主管 / 总经理 / 管理员）────────────────

function ManagementDashboard({ user, summary }: { user: User | null; summary: ManagementSummary }) {
  const isGm = isGeneralManager(user);
  const isPm = isProcurementManager(user) || isAdmin(user);

  return (
    <>
      <div className="stat-grid">
        <Card>
          <Statistic title="物品种类" value={summary.itemCount} suffix="种" />
        </Card>
        <Card>
          <Statistic
            title="低库存 / 缺货"
            value={summary.lowStockCount}
            suffix="项"
            valueStyle={summary.lowStockCount > 0 ? { color: "#cf1322" } : {}}
          />
        </Card>
        <Card>
          <Statistic
            title="在外工件"
            value={Math.round(Number(summary.borrowedQty))}
            suffix="件"
          />
        </Card>
        <Card>
          <Statistic
            title="待处理采购申请"
            value={summary.pendingPurchaseRequests}
            suffix="条"
            valueStyle={summary.pendingPurchaseRequests > 0 ? { color: "#d46b08" } : {}}
          />
        </Card>
      </div>

      {summary.lowStockCount > 0 && (
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          message={`当前有 ${summary.lowStockCount} 个物品低于安全库存，请及时补货`}
        />
      )}

      <div className="section-grid" style={{ marginBottom: 16 }}>
        <Card title="低库存提醒" size="small">
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            locale={{ emptyText: "暂无低库存物品" }}
            dataSource={summary.lowStock}
            columns={[
              {
                title: "分类",
                dataIndex: ["item", "category", "name"],
                width: 80,
                render: (v: string) => v ?? "-",
              },
              { title: "名称", dataIndex: ["item", "name"] },
              { title: "可用", dataIndex: "availableQty", width: 55, align: "right" as const },
              { title: "安全库存", dataIndex: ["item", "safeStock"], width: 72, align: "right" as const },
              {
                title: "状态",
                width: 65,
                render: (_: unknown, row: InventoryRow) => (
                  <Tag color={row.status === "out_of_stock" ? "red" : "orange"}>
                    {row.status === "out_of_stock" ? "缺货" : "低库存"}
                  </Tag>
                ),
              },
            ]}
          />
        </Card>

        <Card title="待办事项" size="small">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {isPm && (
              <>
                <Statistic
                  title="待审批采购申请"
                  value={summary.pendingPurchaseRequests}
                  suffix="条"
                  valueStyle={summary.pendingPurchaseRequests > 0 ? { color: "#d46b08" } : {}}
                />
                <Statistic
                  title="进行中采购清单"
                  value={summary.activePurchaseLists}
                  suffix="条"
                  valueStyle={summary.activePurchaseLists > 0 ? { color: "#1677ff" } : {}}
                />
                <Statistic
                  title="待修 / 待检工件"
                  value={summary.pendingRecoveries}
                  suffix="件"
                  valueStyle={summary.pendingRecoveries > 0 ? { color: "#d46b08" } : {}}
                />
              </>
            )}
            <Statistic
              title="本月采购金额"
              value={Number(summary.monthlyPurchaseAmount)}
              precision={2}
              prefix="¥"
            />
            {isGm && (
              <Statistic
                title="低库存预警"
                value={summary.lowStockCount}
                suffix="项"
                valueStyle={summary.lowStockCount > 0 ? { color: "#cf1322" } : {}}
              />
            )}
          </div>
        </Card>
      </div>

      <div className="section-grid">
        <Card title="最近入库" size="small">
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            locale={{ emptyText: "暂无入库记录" }}
            dataSource={summary.recentStockIns}
            columns={[
              {
                title: "时间",
                dataIndex: "inTime",
                width: 90,
                render: (v: string) => dayjs(v).format("MM-DD HH:mm"),
              },
              { title: "单号", dataIndex: "inNo" },
              {
                title: "供应商",
                dataIndex: ["supplier", "name"],
                render: (v?: string) => v ?? "-",
              },
              {
                title: "金额",
                dataIndex: "totalAmount",
                width: 90,
                align: "right" as const,
                render: (v: string) =>
                  Number(v) > 0
                    ? `¥${Number(v).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : "-",
              },
            ]}
          />
        </Card>

        <Card title="最近出库" size="small">
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            locale={{ emptyText: "暂无出库记录" }}
            dataSource={summary.recentStockOuts}
            columns={[
              {
                title: "时间",
                dataIndex: "outTime",
                width: 90,
                render: (v: string) => dayjs(v).format("MM-DD HH:mm"),
              },
              { title: "单号", dataIndex: "outNo" },
              { title: "领取人", dataIndex: "receiverName" },
            ]}
          />
        </Card>
      </div>
    </>
  );
}

// ── 主组件 ────────────────────────────────────────────────

export default function DashboardPage({ user }: DashboardPageProps) {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    api.get("/dashboard/summary")
      .then((res) => setSummary(res.data))
      .catch(() => {});
  }, []);

  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      {summary?.role === "CNC_SUPERVISOR" ? (
        <CncDashboard summary={summary} />
      ) : summary ? (
        <ManagementDashboard user={user} summary={summary as ManagementSummary} />
      ) : null}
    </>
  );
}
