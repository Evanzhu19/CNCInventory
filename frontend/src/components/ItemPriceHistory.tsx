import { Card, Descriptions, Empty, Table, Tag } from "antd";
import dayjs from "dayjs";
import type { ItemDetail } from "../types";

type ItemPriceHistoryProps = {
  detail: ItemDetail | null;
  compact?: boolean;
};

export default function ItemPriceHistory({ detail, compact = false }: ItemPriceHistoryProps) {
  if (!detail) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择物品后显示历史价格" />;
  }

  const summary = detail.priceSummary;

  return (
    <>
      <Descriptions
        size={compact ? "small" : "default"}
        bordered={!compact}
        column={compact ? 2 : 3}
        items={[
          { key: "latestPrice", label: "最近价格", children: summary.latestPrice ? `¥${summary.latestPrice}` : "暂无" },
          { key: "avgPrice", label: "均价", children: summary.averagePrice ? `¥${summary.averagePrice}` : "暂无" },
          { key: "minPrice", label: "最低价", children: summary.minPrice ? `¥${summary.minPrice}` : "暂无" },
          { key: "maxPrice", label: "最高价", children: summary.maxPrice ? `¥${summary.maxPrice}` : "暂无" },
          { key: "latestSupplier", label: "最近供应商", children: summary.latestSupplier ?? "暂无" },
          {
            key: "latestPurchaseTime",
            label: "最近采购时间",
            children: summary.latestPurchaseTime ? dayjs(summary.latestPurchaseTime).format("YYYY-MM-DD HH:mm") : "暂无",
          },
        ]}
      />

      {!compact && detail.inventory && (
        <Card size="small" title="当前库存" style={{ marginTop: 16 }}>
          <Descriptions
            size="small"
            column={3}
            items={[
              { key: "available", label: "可用", children: detail.inventory.availableQty },
              { key: "borrowed", label: "在外", children: detail.inventory.borrowedQty },
              { key: "pending", label: "待处理", children: detail.inventory.pendingQty },
            ]}
          />
        </Card>
      )}

      <Table
        style={{ marginTop: 16 }}
        size="small"
        rowKey="id"
        pagination={{ pageSize: compact ? 5 : 8, showSizeChanger: false }}
        dataSource={detail.priceHistory}
        locale={{ emptyText: "暂无历史采购价格" }}
        columns={[
          { title: "入库单号", dataIndex: ["stockIn", "inNo"] },
          {
            title: "采购时间",
            render: (_, row) => dayjs(row.stockIn.inTime).format("YYYY-MM-DD HH:mm"),
          },
          {
            title: "单价",
            render: (_, row) => <strong>{`¥${row.unitPrice}`}</strong>,
          },
          { title: "数量", dataIndex: "qty" },
          {
            title: "供应商",
            render: (_, row) => row.supplier?.name ?? row.stockIn.supplier?.name ?? "未填写",
          },
          {
            title: "渠道",
            render: (_, row) => row.purchaseChannel ? <Tag>{row.purchaseChannel}</Tag> : "未填写",
          },
        ]}
      />
    </>
  );
}
