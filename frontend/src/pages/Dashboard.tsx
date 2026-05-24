import { Alert, Card, List, Statistic, Table, Tag } from "antd";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { isGeneralManager } from "../lib/roles";
import type { InventoryRow, User } from "../types";

type Summary = {
  itemCount: number;
  availableQty: string;
  borrowedQty: string;
  pendingQty: string;
  pendingPurchaseRequests: number;
  pendingRecoveries: number;
  lowStockCount: number;
  lowStock: InventoryRow[];
  recentStockIns: Array<{ id: string; inNo: string; totalAmount: string; supplier?: { name: string } }>;
  recentStockOuts: Array<{ id: string; outNo: string; receiverName: string }>;
};

type DashboardPageProps = {
  user: User | null;
};

export default function DashboardPage({ user }: DashboardPageProps) {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    api.get("/dashboard/summary").then((res) => setSummary(res.data));
  }, []);

  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <div className="stat-grid">
        <Card>
          <Statistic title="物品种类" value={summary?.itemCount ?? 0} />
        </Card>
        <Card>
          <Statistic title="可用库存" value={Number(summary?.availableQty ?? 0)} precision={2} />
        </Card>
        <Card>
          <Statistic title="在外数量" value={Number(summary?.borrowedQty ?? 0)} precision={2} />
        </Card>
        <Card>
          <Statistic title="待处理数量" value={Number(summary?.pendingQty ?? 0)} precision={2} />
        </Card>
      </div>

      {summary && summary.lowStock.length > 0 && (
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          message={`当前有 ${summary.lowStockCount} 个物品低于安全库存`}
        />
      )}

      <div className="section-grid">
        <Card title="低库存提醒">
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={summary?.lowStock ?? []}
            columns={[
              { title: "编码", dataIndex: ["item", "itemCode"] },
              { title: "名称", dataIndex: ["item", "name"] },
              { title: "可用", dataIndex: "availableQty" },
              { title: "安全库存", dataIndex: ["item", "safeStock"] },
              {
                title: "状态",
                render: (_: unknown, row: InventoryRow) => (
                  <Tag color={row.status === "out_of_stock" ? "red" : "orange"}>
                    {row.status === "out_of_stock" ? "缺货" : "低库存"}
                  </Tag>
                ),
              },
            ]}
          />
        </Card>
        <Card title="最近单据">
          <List
            size="small"
            dataSource={
              isGeneralManager(user)
                ? (summary?.lowStock ?? []).map((item) => `${item.item.name} 当前可用 ${item.availableQty}`)
                : [
                    ...((summary?.recentStockIns ?? []).map((item) => `入库 ${item.inNo}`)),
                    ...((summary?.recentStockOuts ?? []).map((item) => `出库 ${item.outNo} / ${item.receiverName}`)),
                  ]
            }
            renderItem={(item) => <List.Item>{item}</List.Item>}
          />
        </Card>
      </div>
    </>
  );
}
