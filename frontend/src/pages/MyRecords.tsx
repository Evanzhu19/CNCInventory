import { Table, Tag, Tabs, message } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { api, getErrorMessage } from "../api/client";
import type { User } from "../types";

type MyPickup = {
  id: string;
  outNo: string;
  outTime: string;
  department?: string | null;
  purpose?: string | null;
  items: Array<{
    id: string;
    qty: string;
    item: { id: string; itemCode: string; name: string; specification?: string | null; unit: string };
  }>;
};

type MyRecovery = {
  id: string;
  recoveryTime: string;
  qty: string;
  returnedBy: string;
  recoveryStatus: "REUSABLE" | "ROUGHING_REUSABLE" | "PENDING_INSPECTION" | "REPAIRABLE" | "SCRAPPED";
  remark?: string | null;
  item: { id: string; itemCode: string; name: string; specification?: string | null; unit: string };
};

const RECOVERY_STATUS_MAP: Record<MyRecovery["recoveryStatus"], { label: string; color: string }> = {
  REUSABLE:           { label: "可继续使用", color: "green" },
  ROUGHING_REUSABLE:  { label: "可粗加工用", color: "cyan" },
  PENDING_INSPECTION: { label: "待检修",     color: "orange" },
  REPAIRABLE:         { label: "可修复",      color: "blue" },
  SCRAPPED:           { label: "已报废",      color: "default" },
};

type MyRecordsPageProps = { user: User | null };

export default function MyRecordsPage({ user: _user }: MyRecordsPageProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [myPickups, setMyPickups] = useState<MyPickup[]>([]);
  const [myRecoveries, setMyRecoveries] = useState<MyRecovery[]>([]);

  useEffect(() => {
    Promise.all([
      api.get("/stock-out/my"),
      api.get("/recoveries/my"),
    ])
      .then(([pickupsRes, recoveriesRes]) => {
        setMyPickups(pickupsRes.data.data);
        setMyRecoveries(recoveriesRes.data.data);
      })
      .catch((error) => messageApi.error(getErrorMessage(error)));
  }, []);

  return (
    <>
      {contextHolder}
      <h1 className="page-title">我的记录</h1>
      <Tabs
        items={[
          {
            key: "pickups",
            label: `领料历史（${myPickups.length}）`,
            children: (
              <Table
                rowKey="id"
                dataSource={myPickups}
                locale={{ emptyText: "暂无领料记录" }}
                expandable={{
                  expandedRowRender: (record) => (
                    <Table
                      rowKey="id"
                      size="small"
                      pagination={false}
                      dataSource={record.items}
                      columns={[
                        { title: "编码", dataIndex: ["item", "itemCode"] },
                        { title: "名称", dataIndex: ["item", "name"] },
                        {
                          title: "规格",
                          dataIndex: ["item", "specification"],
                          render: (v?: string | null) => v ?? "-",
                        },
                        { title: "数量", dataIndex: "qty" },
                        { title: "单位", dataIndex: ["item", "unit"] },
                      ]}
                    />
                  ),
                }}
                columns={[
                  {
                    title: "时间",
                    dataIndex: "outTime",
                    width: 160,
                    render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm"),
                  },
                  { title: "单号", dataIndex: "outNo", width: 180 },
                  { title: "部门", dataIndex: "department", render: (v?: string | null) => v ?? "-" },
                  { title: "用途", dataIndex: "purpose", render: (v?: string | null) => v ?? "-" },
                  {
                    title: "物品",
                    render: (_: unknown, row: MyPickup) =>
                      row.items
                        .map((i) => `${i.item.name}${i.item.specification ? ` / ${i.item.specification}` : ""} × ${i.qty}${i.item.unit}`)
                        .join("；"),
                  },
                ]}
              />
            ),
          },
          {
            key: "recoveries",
            label: `回收记录（${myRecoveries.length}）`,
            children: (
              <Table
                rowKey="id"
                dataSource={myRecoveries}
                locale={{ emptyText: "暂无回收记录" }}
                columns={[
                  {
                    title: "时间",
                    dataIndex: "recoveryTime",
                    width: 160,
                    render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm"),
                  },
                  { title: "名称", dataIndex: ["item", "name"] },
                  {
                    title: "规格",
                    dataIndex: ["item", "specification"],
                    render: (v?: string | null) => v ?? "-",
                  },
                  { title: "单位", dataIndex: ["item", "unit"], width: 60 },
                  { title: "数量", dataIndex: "qty", width: 70 },
                  {
                    title: "回收结果",
                    dataIndex: "recoveryStatus",
                    width: 120,
                    render: (v: MyRecovery["recoveryStatus"]) => {
                      const t = RECOVERY_STATUS_MAP[v];
                      return <Tag color={t.color}>{t.label}</Tag>;
                    },
                  },
                  {
                    title: "备注",
                    dataIndex: "remark",
                    render: (v?: string | null) => v ?? "-",
                  },
                ]}
              />
            ),
          },
        ]}
      />
    </>
  );
}
