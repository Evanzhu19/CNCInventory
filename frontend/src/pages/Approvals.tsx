import { Button, Card, DatePicker, Input, Modal, Popconfirm, Table, Tag, message, Alert } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { api, getErrorMessage } from "../api/client";
import type { DeleteRequest } from "../types";

const TARGET_TYPE_LABEL: Record<string, string> = {
  recovery: "回收记录删除",
  purchase_list: "采购清单取消",
};

function describeTarget(req: DeleteRequest): string {
  const d = req.targetDesc;
  if (req.targetType === "recovery") {
    return `${String(d.itemCode ?? "")} ${String(d.itemName ?? "")}，数量 ${String(d.qty ?? "")}，回收时间 ${d.recoveryTime ? dayjs(String(d.recoveryTime)).format("YYYY-MM-DD") : "-"}`;
  }
  if (req.targetType === "purchase_list") {
    return `清单号 ${String(d.listNo ?? "")}，状态 ${String(d.status ?? "")}，明细 ${String(d.itemCount ?? "")} 条`;
  }
  return JSON.stringify(d);
}

type DateHeaderRow = { rowType: "date-header"; date: string; key: string; count: number };
type RecordRow = DeleteRequest & { rowType: "record" };
type ApprovalsTableRow = DateHeaderRow | RecordRow;

function isHeader(row: ApprovalsTableRow): row is DateHeaderRow {
  return row.rowType === "date-header";
}

function buildGroupedRows(requests: DeleteRequest[]): ApprovalsTableRow[] {
  const groups = new Map<string, DeleteRequest[]>();
  for (const req of requests) {
    const date = dayjs(req.requestTime).format("YYYY-MM-DD");
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date)!.push(req);
  }
  const result: ApprovalsTableRow[] = [];
  for (const [date, records] of groups) {
    result.push({ rowType: "date-header", date, key: `header-${date}`, count: records.length });
    for (const rec of records) {
      result.push({ ...rec, rowType: "record" });
    }
  }
  return result;
}

const NCOLS = 7;

export default function ApprovalsPage() {
  const [messageApi, contextHolder] = message.useMessage();
  const [requests, setRequests] = useState<DeleteRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(30, "day").startOf("day"),
    dayjs().endOf("day"),
  ]);
  const [rejectModal, setRejectModal] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [rejectNote, setRejectNote] = useState("");
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [stockCountAlert, setStockCountAlert] = useState<string | null>(null);

  async function load(range: [dayjs.Dayjs, dayjs.Dayjs]) {
    setLoading(true);
    try {
      const res = await api.get("/delete-requests", {
        params: {
          startDate: range[0].format("YYYY-MM-DD"),
          endDate: range[1].format("YYYY-MM-DD"),
        },
      });
      setRequests(res.data.data);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(dateRange); }, [dateRange]);

  async function approve(id: string, targetType: string) {
    try {
      const res = await api.post(`/delete-requests/${id}/approve`, {});
      const msg: string = res.data.message ?? "已批准";
      if (targetType === "purchase_list") {
        setStockCountAlert(msg);
      } else {
        messageApi.success(msg);
      }
      await load(dateRange);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  async function submitReject() {
    if (!rejectModal.id) return;
    if (!rejectNote.trim()) {
      messageApi.warning("请填写拒绝原因");
      return;
    }
    setRejectSubmitting(true);
    try {
      await api.post(`/delete-requests/${rejectModal.id}/reject`, { reviewNote: rejectNote.trim() });
      messageApi.success("已拒绝");
      setRejectModal({ open: false, id: null });
      setRejectNote("");
      await load(dateRange);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    } finally {
      setRejectSubmitting(false);
    }
  }

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;
  const tableData = buildGroupedRows(requests);

  const columns = [
    {
      title: "类型",
      width: 130,
      onCell: (row: ApprovalsTableRow) =>
        isHeader(row)
          ? { colSpan: NCOLS, style: { background: "#f5f5f5", fontWeight: 600, color: "#262626", padding: "8px 16px" } }
          : {},
      render: (_: unknown, row: ApprovalsTableRow) => {
        if (isHeader(row)) {
          return (
            <span>
              {dayjs(row.date).format("YYYY年MM月DD日")}
              <span style={{ fontWeight: 400, color: "#8c8c8c", marginLeft: 8 }}>（{row.count} 条）</span>
            </span>
          );
        }
        return TARGET_TYPE_LABEL[(row as RecordRow).targetType] ?? (row as RecordRow).targetType;
      },
    },
    {
      title: "申请内容",
      onCell: (row: ApprovalsTableRow) => (isHeader(row) ? { colSpan: 0 } : {}),
      render: (_: unknown, row: ApprovalsTableRow) => {
        if (isHeader(row)) return null;
        return describeTarget(row as RecordRow);
      },
    },
    {
      title: "申请人",
      width: 90,
      onCell: (row: ApprovalsTableRow) => (isHeader(row) ? { colSpan: 0 } : {}),
      render: (_: unknown, row: ApprovalsTableRow) => {
        if (isHeader(row)) return null;
        return (row as RecordRow).requester?.realName;
      },
    },
    {
      title: "申请时间",
      width: 140,
      onCell: (row: ApprovalsTableRow) => (isHeader(row) ? { colSpan: 0 } : {}),
      render: (_: unknown, row: ApprovalsTableRow) => {
        if (isHeader(row)) return null;
        return dayjs((row as RecordRow).requestTime).format("HH:mm");
      },
    },
    {
      title: "状态",
      width: 90,
      onCell: (row: ApprovalsTableRow) => (isHeader(row) ? { colSpan: 0 } : {}),
      render: (_: unknown, row: ApprovalsTableRow) => {
        if (isHeader(row)) return null;
        const map: Record<string, { label: string; color: string }> = {
          PENDING:  { label: "待审批", color: "orange" },
          APPROVED: { label: "已批准", color: "green" },
          REJECTED: { label: "已拒绝", color: "default" },
        };
        const t = map[(row as RecordRow).status];
        return <Tag color={t.color}>{t.label}</Tag>;
      },
    },
    {
      title: "审批人 / 备注",
      onCell: (row: ApprovalsTableRow) => (isHeader(row) ? { colSpan: 0 } : {}),
      render: (_: unknown, row: ApprovalsTableRow) => {
        if (isHeader(row)) return null;
        const rec = row as RecordRow;
        if (!rec.reviewer) return "-";
        return (
          <span>
            {rec.reviewer.realName}
            {rec.reviewNote ? `：${rec.reviewNote}` : ""}
          </span>
        );
      },
    },
    {
      title: "操作",
      width: 160,
      onCell: (row: ApprovalsTableRow) => (isHeader(row) ? { colSpan: 0 } : {}),
      render: (_: unknown, row: ApprovalsTableRow) => {
        if (isHeader(row)) return null;
        const rec = row as RecordRow;
        if (rec.status !== "PENDING") return null;
        return (
          <div style={{ display: "flex", gap: 8 }}>
            <Popconfirm
              title="确认批准"
              description="批准后将自动执行删除/取消操作，不可撤销。确认吗？"
              okText="批准"
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={() => void approve(rec.id, rec.targetType)}
            >
              <Button size="small" type="primary" danger>
                批准
              </Button>
            </Popconfirm>
            <Button
              size="small"
              onClick={() => {
                setRejectNote("");
                setRejectModal({ open: true, id: rec.id });
              }}
            >
              拒绝
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      {contextHolder}
      <h1 className="page-title">审批管理{pendingCount > 0 ? `（${pendingCount} 条待处理）` : ""}</h1>
      {stockCountAlert && (
        <Alert
          type="warning"
          showIcon
          closable
          message="采购清单已取消"
          description={stockCountAlert}
          style={{ marginBottom: 16 }}
          onClose={() => setStockCountAlert(null)}
        />
      )}
      <Card>
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <DatePicker.RangePicker
            value={dateRange}
            onChange={(range) => {
              if (range) {
                setDateRange([range[0] ?? dayjs().startOf("day"), range[1] ?? dayjs().endOf("day")]);
              }
            }}
            allowClear={false}
          />
          <span style={{ color: "#8c8c8c", fontSize: 12 }}>{`共 ${requests.length} 条`}</span>
        </div>
        <Table
          rowKey={(row) => (isHeader(row) ? row.key : (row as RecordRow).id)}
          loading={loading}
          dataSource={tableData}
          columns={columns}
          pagination={false}
        />
      </Card>

      <Modal
        title="拒绝申请"
        open={rejectModal.open}
        onCancel={() => setRejectModal({ open: false, id: null })}
        onOk={submitReject}
        okText="确认拒绝"
        okButtonProps={{ danger: true }}
        confirmLoading={rejectSubmitting}
        destroyOnClose
      >
        <Input.TextArea
          rows={3}
          placeholder="请填写拒绝原因（必填）"
          value={rejectNote}
          onChange={(e) => setRejectNote(e.target.value)}
          style={{ marginTop: 16 }}
        />
      </Modal>
    </>
  );
}
