import { Button, Select, Table, Tag, message } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { api, getErrorMessage } from "../api/client";

type OperationLog = {
  id: string;
  module: string;
  action: string;
  targetTable?: string | null;
  targetId?: string | null;
  detail?: Record<string, unknown> | null;
  createdAt: string;
  user?: { id: string; realName: string } | null;
};

type Pagination = { page: number; pageSize: number; total: number; totalPages: number };

const MODULE_LABELS: Record<string, string> = {
  stock_in: "入库",
  stock_out: "出库",
  stock_count: "盘点",
  purchase_request: "采购申请",
  purchase_list: "采购清单",
  recovery: "回收",
  loss: "损耗",
  inventory: "库存调整",
  user: "用户",
};

const ACTION_COLORS: Record<string, string> = {
  create: "green",
  update: "blue",
  delete: "red",
  confirm: "cyan",
  void: "default",
  mark_ordered: "geekblue",
  stock_in: "green",
};

export default function OperationLogsPage() {
  const [messageApi, contextHolder] = message.useMessage();
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 50, total: 0, totalPages: 0 });
  const [moduleFilter, setModuleFilter] = useState<string | undefined>();

  async function load(page = 1) {
    try {
      const res = await api.get("/operation-logs", {
        params: { page, pageSize: 50, ...(moduleFilter ? { module: moduleFilter } : {}) },
      });
      setLogs(res.data.data);
      setPagination(res.data.pagination);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  useEffect(() => {
    void load(1);
  }, [moduleFilter]);

  return (
    <>
      {contextHolder}
      <h1 className="page-title">操作日志</h1>
      <div className="toolbar">
        <Select
          allowClear
          placeholder="筛选模块"
          style={{ width: 160 }}
          value={moduleFilter}
          onChange={(v) => setModuleFilter(v)}
          options={Object.entries(MODULE_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <Button onClick={() => void load(1)}>刷新</Button>
      </div>

      <Table
        rowKey="id"
        dataSource={logs}
        pagination={{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total: pagination.total,
          showTotal: (total) => `共 ${total} 条`,
          onChange: (page) => void load(page),
        }}
        columns={[
          {
            title: "时间",
            dataIndex: "createdAt",
            width: 160,
            render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm:ss"),
          },
          {
            title: "模块",
            dataIndex: "module",
            width: 100,
            render: (v: string) => MODULE_LABELS[v] ?? v,
          },
          {
            title: "操作",
            dataIndex: "action",
            width: 100,
            render: (v: string) => (
              <Tag color={ACTION_COLORS[v] ?? "default"}>{v}</Tag>
            ),
          },
          {
            title: "操作人",
            width: 100,
            render: (_: unknown, row: OperationLog) => row.user?.realName ?? "-",
          },
          {
            title: "详情",
            render: (_: unknown, row: OperationLog) => {
              if (!row.detail) return "-";
              return (
                <span style={{ fontFamily: "monospace", fontSize: 12 }}>
                  {Object.entries(row.detail)
                    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                    .join("  |  ")}
                </span>
              );
            },
          },
        ]}
      />
    </>
  );
}
