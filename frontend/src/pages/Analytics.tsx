import { Alert, Card, DatePicker, Select, Spin, Statistic, Table, Tabs, message } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import { api, getErrorMessage } from "../api/client";
import { canAccessAnalytics } from "../lib/roles";
import type {
  AnalyticsHistoryResponse,
  AnalyticsHistoryType,
  AnalyticsReport,
  LossRecord,
  RecoveryRecord,
  User,
} from "../types";

type AnalyticsPageProps = {
  user: User | null;
};

const rangeOptions = [
  { value: "month", label: "月度" },
  { value: "half_year", label: "近半年" },
  { value: "year", label: "近一年" },
] as const;

const historyTypeLabels: Record<AnalyticsHistoryType, string> = {
  stock_in: "入库历史",
  stock_out: "出库历史",
  recovery: "回收历史",
  loss: "损耗/报废历史",
};

const recoveryStatusLabels: Record<RecoveryRecord["recoveryStatus"], string> = {
  REUSABLE: "可继续使用",
  ROUGHING_REUSABLE: "可开粗使用",
  PENDING_INSPECTION: "待判定",
  REPAIRABLE: "修磨后可用",
  SCRAPPED: "直接报废",
};

const lossTypeLabels: Record<LossRecord["lossType"], string> = {
  NORMAL_WEAR: "正常磨损",
  BROKEN: "断刀",
  SCRAPPED: "报废",
  LOST: "遗失",
  OTHER: "其他",
};

function formatMonth(value?: string | null) {
  return value ? dayjs(value).format("YYYY-MM") : "-";
}

function formatDateTime(value?: string | null) {
  return value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-";
}

function formatQty(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return Number(value).toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function formatMoney(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return Number(value).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value?: number | null) {
  if (value === null || value === undefined) {
    return "-";
  }

  return `${Number(value).toFixed(2)}%`;
}

export default function AnalyticsPage({ user }: AnalyticsPageProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [range, setRange] = useState<"month" | "half_year" | "year">("month");
  const [anchorMonth, setAnchorMonth] = useState<Dayjs>(dayjs().startOf("month"));
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [itemPage, setItemPage] = useState(1);
  const [sourcePage, setSourcePage] = useState(1);
  const [historyType, setHistoryType] = useState<AnalyticsHistoryType>("stock_in");
  const [historyPage, setHistoryPage] = useState(1);
  const [history, setHistory] = useState<AnalyticsHistoryResponse | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    setItemPage(1);
    setSourcePage(1);
    setHistoryPage(1);
  }, [range, anchorMonth]);

  useEffect(() => {
    if (!canAccessAnalytics(user)) {
      return;
    }

    async function loadReport() {
      setLoadingReport(true);
      try {
        const res = await api.get("/analytics/report", {
          params: {
            range,
            anchorMonth: anchorMonth.format("YYYY-MM"),
            itemPage,
            itemPageSize: 20,
            sourcePage,
            sourcePageSize: 20,
          },
        });
        setReport(res.data);
      } catch (error) {
        messageApi.error(getErrorMessage(error));
      } finally {
        setLoadingReport(false);
      }
    }

    void loadReport();
  }, [anchorMonth, itemPage, messageApi, range, sourcePage, user]);

  useEffect(() => {
    if (!canAccessAnalytics(user)) {
      return;
    }

    async function loadHistory() {
      setLoadingHistory(true);
      try {
        const res = await api.get("/analytics/history", {
          params: {
            range,
            anchorMonth: anchorMonth.format("YYYY-MM"),
            type: historyType,
            page: historyPage,
            pageSize: 20,
          },
        });
        setHistory(res.data);
      } catch (error) {
        messageApi.error(getErrorMessage(error));
      } finally {
        setLoadingHistory(false);
      }
    }

    void loadHistory();
  }, [anchorMonth, historyPage, historyType, messageApi, range, user]);

  if (!canAccessAnalytics(user)) {
    return <Card>当前账号没有统计分析权限。</Card>;
  }

  const historyTable = (() => {
    if (!history) {
      return <Spin />;
    }

    if (history.type === "stock_in") {
      const rows = history.data as AnalyticsHistoryResponse["data"] & Array<{
        id: string;
        inNo: string;
        inTime: string;
        qty: string;
        unitPrice: string;
        totalPrice: string;
        purchaseChannel?: string | null;
        supplierName?: string | null;
        item: { itemCode: string; name: string; specification?: string | null };
      }>;

      return (
        <Table
          rowKey="id"
          loading={loadingHistory}
          dataSource={rows}
          pagination={{
            current: history.pagination.page,
            pageSize: history.pagination.pageSize,
            total: history.pagination.total,
            onChange: (page) => setHistoryPage(page),
          }}
          columns={[
            { title: "时间", render: (_: unknown, row) => formatDateTime(row.inTime) },
            { title: "单号", dataIndex: "inNo" },
            { title: "编码", dataIndex: ["item", "itemCode"] },
            { title: "名称", dataIndex: ["item", "name"] },
            { title: "规格", dataIndex: ["item", "specification"] },
            { title: "供应商", dataIndex: "supplierName" },
            { title: "渠道", dataIndex: "purchaseChannel" },
            { title: "数量", render: (_: unknown, row) => formatQty(row.qty) },
            { title: "单价", render: (_: unknown, row) => formatMoney(row.unitPrice) },
            { title: "金额", render: (_: unknown, row) => formatMoney(row.totalPrice) },
          ]}
        />
      );
    }

    if (history.type === "stock_out") {
      const rows = history.data as AnalyticsHistoryResponse["data"] & Array<{
        id: string;
        outNo: string;
        outTime: string;
        qty: string;
        receiverName: string;
        department?: string | null;
        purpose?: string | null;
        item: { itemCode: string; name: string; specification?: string | null };
      }>;

      return (
        <Table
          rowKey="id"
          loading={loadingHistory}
          dataSource={rows}
          pagination={{
            current: history.pagination.page,
            pageSize: history.pagination.pageSize,
            total: history.pagination.total,
            onChange: (page) => setHistoryPage(page),
          }}
          columns={[
            { title: "时间", render: (_: unknown, row) => formatDateTime(row.outTime) },
            { title: "单号", dataIndex: "outNo" },
            { title: "编码", dataIndex: ["item", "itemCode"] },
            { title: "名称", dataIndex: ["item", "name"] },
            { title: "规格", dataIndex: ["item", "specification"] },
            { title: "领取人", dataIndex: "receiverName" },
            { title: "部门", dataIndex: "department" },
            { title: "用途", dataIndex: "purpose" },
            { title: "数量", render: (_: unknown, row) => formatQty(row.qty) },
          ]}
        />
      );
    }

    if (history.type === "recovery") {
      const rows = history.data as AnalyticsHistoryResponse["data"] & Array<{
        id: string;
        recoveryTime: string;
        qty: string;
        returnedBy: string;
        recoveryStatus: RecoveryRecord["recoveryStatus"];
        remark?: string | null;
        operator: { realName: string };
        item: { itemCode: string; name: string; specification?: string | null };
      }>;

      return (
        <Table
          rowKey="id"
          loading={loadingHistory}
          dataSource={rows}
          pagination={{
            current: history.pagination.page,
            pageSize: history.pagination.pageSize,
            total: history.pagination.total,
            onChange: (page) => setHistoryPage(page),
          }}
          columns={[
            { title: "时间", render: (_: unknown, row) => formatDateTime(row.recoveryTime) },
            { title: "编码", dataIndex: ["item", "itemCode"] },
            { title: "名称", dataIndex: ["item", "name"] },
            { title: "规格", dataIndex: ["item", "specification"] },
            { title: "归还人", dataIndex: "returnedBy" },
            { title: "状态", render: (_: unknown, row) => recoveryStatusLabels[row.recoveryStatus] },
            { title: "数量", render: (_: unknown, row) => formatQty(row.qty) },
            { title: "操作人", dataIndex: ["operator", "realName"] },
            { title: "备注", dataIndex: "remark" },
          ]}
        />
      );
    }

    const rows = history.data as AnalyticsHistoryResponse["data"] & Array<{
      id: string;
      recordTime: string;
      qty: string;
      lossType: LossRecord["lossType"];
      sourceBucket: LossRecord["sourceBucket"];
      responsiblePerson?: string | null;
      remark?: string | null;
      operator: { realName: string };
      item: { itemCode: string; name: string; specification?: string | null };
    }>;

    return (
      <Table
        rowKey="id"
        loading={loadingHistory}
        dataSource={rows}
        pagination={{
          current: history.pagination.page,
          pageSize: history.pagination.pageSize,
          total: history.pagination.total,
          onChange: (page) => setHistoryPage(page),
        }}
        columns={[
          { title: "时间", render: (_: unknown, row) => formatDateTime(row.recordTime) },
          { title: "编码", dataIndex: ["item", "itemCode"] },
          { title: "名称", dataIndex: ["item", "name"] },
          { title: "规格", dataIndex: ["item", "specification"] },
          { title: "损耗类型", render: (_: unknown, row) => lossTypeLabels[row.lossType] },
          { title: "扣减来源", dataIndex: "sourceBucket" },
          { title: "数量", render: (_: unknown, row) => formatQty(row.qty) },
          { title: "责任人", dataIndex: "responsiblePerson" },
          { title: "操作人", dataIndex: ["operator", "realName"] },
          { title: "备注", dataIndex: "remark" },
        ]}
      />
    );
  })();

  return (
    <>
      {contextHolder}
      <h1 className="page-title">统计分析</h1>
      <div className="toolbar">
        <Select
          style={{ width: 160 }}
          value={range}
          options={rangeOptions.map((option) => ({ value: option.value, label: option.label }))}
          onChange={(value) => setRange(value)}
        />
        <DatePicker picker="month" value={anchorMonth} onChange={(value) => setAnchorMonth(value ?? dayjs().startOf("month"))} />
      </div>

      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message="所有累计、月度、排行和历史都按当前筛选条件在后端聚合并分页，前端只请求当前结果页。"
      />

      {loadingReport && !report ? (
        <div style={{ minHeight: 240, display: "grid", placeItems: "center" }}>
          <Spin size="large" />
        </div>
      ) : report ? (
        <>
          <div className="stat-grid">
            <Card>
              <Statistic title="累计入库" value={report.totals.stockInQty} precision={3} />
            </Card>
            <Card>
              <Statistic title="累计出库" value={report.totals.stockOutQty} precision={3} />
            </Card>
            <Card>
              <Statistic title="累计回收" value={report.totals.recoveryQty} precision={3} />
            </Card>
            <Card>
              <Statistic title="累计损耗" value={report.totals.lossQty} precision={3} />
            </Card>
            <Card>
              <Statistic title="净使用量" value={report.totals.netUsageQty} precision={3} />
            </Card>
            <Card>
              <Statistic title="入库金额" value={report.totals.stockInAmount} precision={2} />
            </Card>
          </div>

          <div className="stat-grid" style={{ marginTop: 16 }}>
            <Card>
              <Statistic title="回收率" value={report.totals.recoveryRate} precision={2} suffix="%" />
            </Card>
            <Card>
              <Statistic title="损耗率" value={report.totals.lossRate} precision={2} suffix="%" />
            </Card>
            <Card>
              <Statistic title="统计起始月" value={report.period.startMonth} />
            </Card>
            <Card>
              <Statistic title="统计截止月" value={report.period.endMonth} />
            </Card>
          </div>

          <Card title="月度累计" style={{ marginTop: 16 }}>
            <Table
              rowKey="month"
              pagination={false}
              dataSource={report.monthly}
              columns={[
                { title: "月份", dataIndex: "month" },
                { title: "入库量", render: (_: unknown, row) => formatQty(row.stockInQty) },
                { title: "入库金额", render: (_: unknown, row) => formatMoney(row.stockInAmount) },
                { title: "出库量", render: (_: unknown, row) => formatQty(row.stockOutQty) },
                { title: "回收量", render: (_: unknown, row) => formatQty(row.recoveryQty) },
                { title: "损耗量", render: (_: unknown, row) => formatQty(row.lossQty) },
                { title: "净使用量", render: (_: unknown, row) => formatQty(row.netUsageQty) },
              ]}
            />
          </Card>

          <Card title="物品使用与损耗排行" style={{ marginTop: 16 }}>
            <Table
              rowKey="itemId"
              loading={loadingReport}
              dataSource={report.itemRanking.data}
              pagination={{
                current: report.itemRanking.pagination.page,
                pageSize: report.itemRanking.pagination.pageSize,
                total: report.itemRanking.pagination.total,
                onChange: (page) => setItemPage(page),
              }}
              columns={[
                { title: "编码", dataIndex: "itemCode" },
                { title: "名称", dataIndex: "itemName" },
                { title: "规格", dataIndex: "specification" },
                { title: "累计入库", render: (_: unknown, row) => formatQty(row.stockInQty) },
                { title: "累计出库", render: (_: unknown, row) => formatQty(row.stockOutQty) },
                { title: "累计回收", render: (_: unknown, row) => formatQty(row.recoveryQty) },
                { title: "累计损耗", render: (_: unknown, row) => formatQty(row.lossQty) },
                { title: "净使用量", render: (_: unknown, row) => formatQty(row.netUsageQty) },
                { title: "损耗率", render: (_: unknown, row) => formatPercent(row.lossRate) },
              ]}
            />
          </Card>

          <Card title="供应商 / 渠道参考分析" style={{ marginTop: 16 }}>
            <Alert style={{ marginBottom: 16 }} type="warning" showIcon message={report.notes.sourceAttribution} />
            <Table
              rowKey={(row) => `${row.supplierName ?? ""}-${row.purchaseChannel ?? ""}`}
              loading={loadingReport}
              dataSource={report.sourceAnalysis.data}
              pagination={{
                current: report.sourceAnalysis.pagination.page,
                pageSize: report.sourceAnalysis.pagination.pageSize,
                total: report.sourceAnalysis.pagination.total,
                onChange: (page) => setSourcePage(page),
              }}
              columns={[
                { title: "供应商", render: (_: unknown, row) => row.supplierName ?? "未填写" },
                { title: "购买渠道", render: (_: unknown, row) => row.purchaseChannel ?? "未填写" },
                { title: "期间采购量", render: (_: unknown, row) => formatQty(row.purchasedQty) },
                { title: "期间采购额", render: (_: unknown, row) => formatMoney(row.purchasedAmount) },
                { title: "归因使用量", render: (_: unknown, row) => formatQty(row.attributedUsageQty) },
                { title: "归因回收量", render: (_: unknown, row) => formatQty(row.attributedRecoveryQty) },
                { title: "归因损耗量", render: (_: unknown, row) => formatQty(row.attributedLossQty) },
                { title: "净使用量", render: (_: unknown, row) => formatQty(row.netUsageQty) },
                { title: "归因损耗率", render: (_: unknown, row) => formatPercent(row.lossRate) },
              ]}
            />
          </Card>

          <Card title="历史记录" style={{ marginTop: 16 }}>
            <Tabs
              activeKey={historyType}
              onChange={(key) => {
                setHistoryType(key as AnalyticsHistoryType);
                setHistoryPage(1);
              }}
              items={[
                { key: "stock_in", label: historyTypeLabels.stock_in },
                { key: "stock_out", label: historyTypeLabels.stock_out },
                { key: "recovery", label: historyTypeLabels.recovery },
                { key: "loss", label: historyTypeLabels.loss },
              ]}
            />
            {historyTable}
          </Card>
        </>
      ) : null}
    </>
  );
}
