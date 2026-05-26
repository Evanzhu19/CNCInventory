import {
  AutoComplete,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Table,
  Tag,
  Tabs,
  message,
} from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { api, getErrorMessage } from "../api/client";
import { exportToExcel } from "../lib/excel";
import { canAccessStockMovements, isProcurementManager } from "../lib/roles";
import type { Item, LossRecord, RecoveryRecord, StockInRecord, StockOutRecord, Supplier, User } from "../types";

type StockInValues = {
  supplierName: string;
  itemId: string;
  qty: number;
  unitPrice: number;
  purchaseChannel?: string;
  remark?: string;
};

type StockOutValues = {
  itemId: string;
  qty: number;
  receiverId: string;
  department?: string;
  purpose?: string;
};

type RecoveryValues = {
  itemId: string;
  qty: number;
  returnedBy: string;
  recoveryStatus: string;
};

type LossValues = {
  itemId: string;
  qty: number;
  sourceBucket: string;
  lossType: string;
  responsiblePerson?: string;
};

type EditableStockInItem = {
  id: string;
  itemLabel: string;
  qty: string;
  unitPrice: number;
  purchaseChannel: string;
  remark: string;
};

type StockMovementsPageProps = {
  user: User | null;
};

function formatDateTime(value?: string | null) {
  return value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-";
}

function formatMoney(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "-";
  return Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normalizeText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

const today: [dayjs.Dayjs, dayjs.Dayjs] = [dayjs().startOf("day"), dayjs().endOf("day")];

function dateParams(range: [dayjs.Dayjs, dayjs.Dayjs]) {
  return { startDate: range[0].format("YYYY-MM-DD"), endDate: range[1].format("YYYY-MM-DD") };
}

export default function StockMovementsPage({ user }: StockMovementsPageProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [items, setItems] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [receivers, setReceivers] = useState<Array<{ id: string; realName: string; role: string }>>([]);
  const [stockIns, setStockIns] = useState<StockInRecord[]>([]);
  const [stockOuts, setStockOuts] = useState<StockOutRecord[]>([]);
  const [recoveries, setRecoveries] = useState<RecoveryRecord[]>([]);
  const [losses, setLosses] = useState<LossRecord[]>([]);
  const [editingStockIn, setEditingStockIn] = useState<StockInRecord | null>(null);
  const [editingSupplierName, setEditingSupplierName] = useState("");
  const [editingRemark, setEditingRemark] = useState("");
  const [editingItems, setEditingItems] = useState<EditableStockInItem[]>([]);
  const [stockInForm] = Form.useForm<StockInValues>();
  const [stockOutForm] = Form.useForm<StockOutValues>();
  const [recoveryForm] = Form.useForm<RecoveryValues>();
  const [lossForm] = Form.useForm<LossValues>();
  const [stockInSubmitting, setStockInSubmitting] = useState(false);
  const [stockOutSubmitting, setStockOutSubmitting] = useState(false);
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);
  const [lossSubmitting, setLossSubmitting] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  const [stockInRange, setStockInRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(today);
  const [stockOutRange, setStockOutRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(today);
  const [recoveryRange, setRecoveryRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(today);
  const [lossRange, setLossRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(today);

  async function loadStaticData() {
    try {
      const [itemsRes, suppliersRes, receiversRes] = await Promise.all([
        api.get("/items"),
        api.get("/suppliers"),
        api.get("/users/receivers"),
      ]);
      setItems(itemsRes.data.data);
      setSuppliers(suppliersRes.data.data);
      setReceivers(receiversRes.data.data);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  async function loadStockIns(range: [dayjs.Dayjs, dayjs.Dayjs]) {
    try {
      const res = await api.get("/stock-in", { params: dateParams(range) });
      setStockIns(res.data.data);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  async function loadStockOuts(range: [dayjs.Dayjs, dayjs.Dayjs]) {
    try {
      const res = await api.get("/stock-out", { params: dateParams(range) });
      setStockOuts(res.data.data);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  async function loadRecoveries(range: [dayjs.Dayjs, dayjs.Dayjs]) {
    try {
      const res = await api.get("/recoveries", { params: dateParams(range) });
      setRecoveries(res.data.data);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  async function loadLosses(range: [dayjs.Dayjs, dayjs.Dayjs]) {
    try {
      const res = await api.get("/losses", { params: dateParams(range) });
      setLosses(res.data.data);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  useEffect(() => { void loadStaticData(); }, []);
  useEffect(() => { void loadStockIns(stockInRange); }, [stockInRange]);
  useEffect(() => { void loadStockOuts(stockOutRange); }, [stockOutRange]);
  useEffect(() => { void loadRecoveries(recoveryRange); }, [recoveryRange]);
  useEffect(() => { void loadLosses(lossRange); }, [lossRange]);

  const itemOptions = items.map((item) => ({
    value: item.id,
    label: `${item.itemCode} / ${item.name}${item.specification ? ` / ${item.specification}` : ""}`,
  }));
  const supplierNameOptions = suppliers.map((supplier) => ({
    value: supplier.name,
    label: supplier.channel ? `${supplier.name} / ${supplier.channel}` : supplier.name,
  }));

  async function submitStockIn(values: StockInValues) {
    setStockInSubmitting(true);
    try {
      await api.post("/stock-in", {
        supplierName: normalizeText(values.supplierName),
        items: [{ itemId: values.itemId, qty: values.qty, unitPrice: values.unitPrice ?? 0, purchaseChannel: normalizeText(values.purchaseChannel), remark: normalizeText(values.remark) }],
      });
      messageApi.success("入库已提交");
      stockInForm.resetFields();
      await loadStockIns(stockInRange);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    } finally {
      setStockInSubmitting(false);
    }
  }

  async function submitStockOut(values: StockOutValues) {
    const receiver = receivers.find((r) => r.id === values.receiverId);
    setStockOutSubmitting(true);
    try {
      await api.post("/stock-out", {
        receiverId: values.receiverId,
        receiverName: receiver?.realName ?? "",
        department: values.department,
        purpose: values.purpose,
        items: [{ itemId: values.itemId, qty: values.qty }],
      });
      messageApi.success("出库已提交");
      stockOutForm.resetFields();
      await loadStockOuts(stockOutRange);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    } finally {
      setStockOutSubmitting(false);
    }
  }

  async function submitRecovery(values: RecoveryValues) {
    setRecoverySubmitting(true);
    try {
      await api.post("/recoveries", values);
      messageApi.success("回收已提交");
      recoveryForm.resetFields();
      await loadRecoveries(recoveryRange);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    } finally {
      setRecoverySubmitting(false);
    }
  }

  async function deleteRecovery(id: string) {
    try {
      const res = await api.delete(`/recoveries/${id}`);
      messageApi.success(res.data.message ?? "操作成功");
      await loadRecoveries(recoveryRange);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  async function submitLoss(values: LossValues) {
    setLossSubmitting(true);
    try {
      await api.post("/losses", values);
      messageApi.success("损耗已提交");
      lossForm.resetFields();
      await loadLosses(lossRange);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    } finally {
      setLossSubmitting(false);
    }
  }

  async function deleteStockIn(id: string) {
    try {
      await api.delete(`/stock-in/${id}`);
      messageApi.success("入库单已删除，库存已回退");
      await loadStockIns(stockInRange);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  async function deleteStockOut(id: string) {
    try {
      await api.delete(`/stock-out/${id}`);
      messageApi.success("出库单已删除，库存已回退");
      await loadStockOuts(stockOutRange);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  function openEditStockIn(record: StockInRecord) {
    setEditingStockIn(record);
    setEditingSupplierName(record.supplier?.name ?? "");
    setEditingRemark(record.remark ?? "");
    setEditingItems(
      record.items.map((item) => ({
        id: item.id,
        itemLabel: `${item.item.itemCode} / ${item.item.name}${item.item.specification ? ` / ${item.item.specification}` : ""}`,
        qty: item.qty,
        unitPrice: Number(item.unitPrice),
        purchaseChannel: item.purchaseChannel ?? "",
        remark: item.remark ?? "",
      })),
    );
  }

  function updateEditingItem(itemId: string, patch: Partial<EditableStockInItem>) {
    setEditingItems((current) => current.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  }

  async function saveStockInEdit() {
    if (!editingStockIn) return;
    const supplierName = normalizeText(editingSupplierName);
    if (!supplierName) { messageApi.warning("请输入供应商"); return; }
    setEditSaving(true);
    try {
      await api.patch(`/stock-in/${editingStockIn.id}`, {
        supplierName,
        remark: normalizeText(editingRemark),
        items: editingItems.map((item) => ({ id: item.id, unitPrice: item.unitPrice, purchaseChannel: normalizeText(item.purchaseChannel), remark: normalizeText(item.remark) })),
      });
      messageApi.success("入库单已更新");
      setEditingStockIn(null);
      await loadStockIns(stockInRange);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <>
      {contextHolder}
      <h1 className="page-title">出入库</h1>
      {!canAccessStockMovements(user) ? (
        <Card>当前账号没有出入库权限。</Card>
      ) : (
        <>
          <Tabs
            items={[
              {
                key: "in",
                label: "入库",
                children: (
                  <Card title="新增入库">
                    <Form form={stockInForm} layout="vertical" onFinish={submitStockIn} initialValues={{ qty: 1, unitPrice: 0 }}>
                      <div className="form-row">
                        <Form.Item label="供应商" name="supplierName" rules={[{ required: true, message: "请输入供应商" }]}>
                          <AutoComplete options={supplierNameOptions} placeholder="输入或选择供应商" filterOption={(inputValue, option) => (option?.value ?? "").toUpperCase().includes(inputValue.toUpperCase())} />
                        </Form.Item>
                        <Form.Item label="物品" name="itemId" rules={[{ required: true, message: "请选择物品" }]}>
                          <Select showSearch options={itemOptions} optionFilterProp="label" />
                        </Form.Item>
                        <Form.Item label="数量" name="qty" rules={[{ required: true, message: "请输入数量" }]}>
                          <InputNumber min={1} precision={0} step={1} style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item label="单价" name="unitPrice">
                          <InputNumber min={0} precision={2} style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item label="购买渠道" name="purchaseChannel"><Input /></Form.Item>
                        <Form.Item label="备注" name="remark"><Input /></Form.Item>
                      </div>
                      <Button type="primary" htmlType="submit" loading={stockInSubmitting}>提交入库</Button>
                    </Form>
                    <div style={{ marginTop: 16, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                      <span>入库日期：</span>
                      <DatePicker.RangePicker
                        value={stockInRange}
                        onChange={(dates) => { if (dates?.[0] && dates?.[1]) setStockInRange([dates[0], dates[1]]); }}
                      />
                      <Button
                        onClick={() => {
                          const rows = stockIns.flatMap((r) => r.items.map((item) => ({
                            单号: r.inNo, 入库时间: dayjs(r.inTime).format("YYYY-MM-DD HH:mm"), 供应商: r.supplier?.name ?? "",
                            来源采购清单: r.purchaseList?.listNo ?? "", 物品名称: item.item.name, 规格: item.item.specification ?? "",
                            数量: Number(item.qty), 单价: Number(item.unitPrice), 金额: Number(item.qty) * Number(item.unitPrice), 采购渠道: item.purchaseChannel ?? "",
                          })));
                          exportToExcel([{ name: "入库记录", rows }], `入库记录_${dayjs().format("YYYYMMDD")}.xlsx`);
                        }}
                      >导出 Excel</Button>
                    </div>
                    <Table
                      style={{ marginTop: 8 }}
                      rowKey="id"
                      dataSource={stockIns}
                      columns={[
                        { title: "单号", dataIndex: "inNo" },
                        { title: "供应商", render: (_: unknown, row: StockInRecord) => row.supplier?.name ?? "未填写" },
                        { title: "来源采购清单", render: (_: unknown, row: StockInRecord) => row.purchaseList?.listNo ?? "-" },
                        { title: "金额", render: (_: unknown, row: StockInRecord) => formatMoney(row.totalAmount) },
                        { title: "时间", render: (_: unknown, row: StockInRecord) => formatDateTime(row.inTime) },
                        {
                          title: "操作",
                          render: (_: unknown, row: StockInRecord) => (
                            <div style={{ display: "flex", gap: 8 }}>
                              <Button size="small" onClick={() => openEditStockIn(row)}>修改</Button>
                              <Popconfirm title="确认删除" description="删除后库存将自动回退，确认删除该入库单吗？" okText="删除" okButtonProps={{ danger: true }} cancelText="取消" onConfirm={() => void deleteStockIn(row.id)}>
                                <Button size="small" danger>删除</Button>
                              </Popconfirm>
                            </div>
                          ),
                        },
                      ]}
                    />
                  </Card>
                ),
              },
              {
                key: "out",
                label: "出库",
                children: (
                  <Card title="新增出库">
                    <Form form={stockOutForm} layout="vertical" onFinish={submitStockOut} initialValues={{ qty: 1 }}>
                      <div className="form-row">
                        <Form.Item label="物品" name="itemId" rules={[{ required: true, message: "请选择物品" }]}>
                          <Select showSearch options={itemOptions} optionFilterProp="label" />
                        </Form.Item>
                        <Form.Item label="数量" name="qty" rules={[{ required: true, message: "请输入数量" }]}>
                          <InputNumber min={1} precision={0} step={1} style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item label="领取人" name="receiverId" rules={[{ required: true, message: "请选择领取人" }]}>
                          <Select showSearch placeholder="选择领取人" optionFilterProp="label" options={receivers.map((r) => ({ value: r.id, label: r.realName }))} />
                        </Form.Item>
                        <Form.Item label="部门" name="department"><Input /></Form.Item>
                        <Form.Item label="用途 / 机台 / 工单" name="purpose"><Input /></Form.Item>
                      </div>
                      <Button type="primary" htmlType="submit" loading={stockOutSubmitting}>提交出库</Button>
                    </Form>
                    <div style={{ marginTop: 16, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                      <span>出库日期：</span>
                      <DatePicker.RangePicker
                        value={stockOutRange}
                        onChange={(dates) => { if (dates?.[0] && dates?.[1]) setStockOutRange([dates[0], dates[1]]); }}
                      />
                      <Button
                        onClick={() => {
                          const rows = stockOuts.flatMap((r) => r.items.map((item) => ({
                            单号: r.outNo, 出库时间: dayjs(r.outTime).format("YYYY-MM-DD HH:mm"), 领取人: r.receiverName,
                            部门: r.department ?? "", 用途: r.purpose ?? "", 物品名称: item.item.name, 规格: item.item.specification ?? "", 数量: Number(item.qty),
                          })));
                          exportToExcel([{ name: "出库记录", rows }], `出库记录_${dayjs().format("YYYYMMDD")}.xlsx`);
                        }}
                      >导出 Excel</Button>
                    </div>
                    <Table
                      style={{ marginTop: 8 }}
                      rowKey="id"
                      dataSource={stockOuts}
                      expandable={{
                        expandedRowRender: (row: StockOutRecord) => (
                          <Table rowKey="id" size="small" pagination={false} dataSource={row.items} columns={[
                            { title: "物品编码", width: 120, render: (_: unknown, item) => item.item.itemCode },
                            { title: "物品名称", render: (_: unknown, item) => item.item.name },
                            { title: "规格", render: (_: unknown, item) => item.item.specification ?? "-" },
                            { title: "单位", width: 70, render: (_: unknown, item) => item.item.unit ?? "-" },
                            { title: "数量", width: 80, dataIndex: "qty" },
                          ]} />
                        ),
                      }}
                      columns={[
                        { title: "单号", dataIndex: "outNo", width: 160 },
                        { title: "领取人", dataIndex: "receiverName", width: 100 },
                        { title: "用途", dataIndex: "purpose" },
                        { title: "时间", width: 130, render: (_: unknown, row: StockOutRecord) => formatDateTime(row.outTime) },
                        {
                          title: "操作", width: 70,
                          render: (_: unknown, row: StockOutRecord) => (
                            <Popconfirm title="确认删除" description="删除后库存将自动回退，确认删除该出库单吗？" okText="删除" okButtonProps={{ danger: true }} cancelText="取消" onConfirm={() => void deleteStockOut(row.id)}>
                              <Button size="small" danger>删除</Button>
                            </Popconfirm>
                          ),
                        },
                      ]}
                    />
                  </Card>
                ),
              },
              {
                key: "recovery",
                label: "回收",
                children: (
                  <Card title="新增回收">
                    <Form form={recoveryForm} layout="vertical" onFinish={submitRecovery} initialValues={{ qty: 1, recoveryStatus: "REUSABLE" }}>
                      <div className="form-row">
                        <Form.Item label="物品" name="itemId" rules={[{ required: true, message: "请选择物品" }]}>
                          <Select showSearch options={itemOptions} optionFilterProp="label" />
                        </Form.Item>
                        <Form.Item label="数量" name="qty" rules={[{ required: true, message: "请输入数量" }]}>
                          <InputNumber min={1} precision={0} step={1} style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item label="归还人" name="returnedBy" rules={[{ required: true, message: "请选择归还人" }]}>
                          <Select showSearch placeholder="选择归还人" optionFilterProp="label" options={receivers.map((r) => ({ value: r.realName, label: r.realName }))} />
                        </Form.Item>
                        <Form.Item label="回收状态" name="recoveryStatus">
                          <Select options={[
                            { value: "REUSABLE", label: "可继续使用" }, { value: "ROUGHING_REUSABLE", label: "可开粗使用" },
                            { value: "PENDING_INSPECTION", label: "待判定" }, { value: "REPAIRABLE", label: "修磨后可用" }, { value: "SCRAPPED", label: "直接报废" },
                          ]} />
                        </Form.Item>
                      </div>
                      <Button type="primary" htmlType="submit" loading={recoverySubmitting}>提交回收</Button>
                    </Form>
                    <div style={{ marginTop: 16, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                      <span>回收日期：</span>
                      <DatePicker.RangePicker
                        value={recoveryRange}
                        onChange={(dates) => { if (dates?.[0] && dates?.[1]) setRecoveryRange([dates[0], dates[1]]); }}
                      />
                    </div>
                    <Table
                      style={{ marginTop: 8 }}
                      rowKey="id"
                      dataSource={recoveries}
                      columns={[
                        { title: "物品", render: (_: unknown, row: RecoveryRecord) => `${row.item.itemCode} / ${row.item.name}` },
                        { title: "数量", dataIndex: "qty", width: 80 },
                        { title: "归还人", dataIndex: "returnedBy", width: 100 },
                        {
                          title: "回收状态", width: 110,
                          render: (_: unknown, row: RecoveryRecord) => {
                            const map: Record<string, { label: string; color: string }> = {
                              REUSABLE: { label: "可继续使用", color: "green" }, ROUGHING_REUSABLE: { label: "可开粗使用", color: "cyan" },
                              PENDING_INSPECTION: { label: "待判定", color: "orange" }, REPAIRABLE: { label: "修磨后可用", color: "blue" }, SCRAPPED: { label: "直接报废", color: "red" },
                            };
                            const info = map[row.recoveryStatus];
                            return <Tag color={info?.color}>{info?.label ?? row.recoveryStatus}</Tag>;
                          },
                        },
                        { title: "操作人", width: 90, render: (_: unknown, row: RecoveryRecord) => row.operator.realName },
                        { title: "时间", width: 130, render: (_: unknown, row: RecoveryRecord) => formatDateTime(row.recoveryTime) },
                        ...(isProcurementManager(user)
                          ? [{
                              title: "操作", width: 130,
                              render: (_: unknown, row: RecoveryRecord) => {
                                const isSameMonth = (() => {
                                  const d = new Date(row.recoveryTime); const now = new Date();
                                  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
                                })();
                                return (
                                  <Popconfirm
                                    title={isSameMonth ? "确认删除回收记录" : "申请跨月删除"}
                                    description={isSameMonth ? "将同步还原库存，确认删除？" : "该记录已跨月，将提交总经理审批，批准后自动删除。确认提交？"}
                                    okText={isSameMonth ? "删除" : "提交申请"} okButtonProps={{ danger: isSameMonth }} cancelText="取消"
                                    onConfirm={() => void deleteRecovery(row.id)}
                                  >
                                    <Button size="small" danger={isSameMonth}>{isSameMonth ? "删除" : "申请删除"}</Button>
                                  </Popconfirm>
                                );
                              },
                            }]
                          : []),
                      ]}
                    />
                  </Card>
                ),
              },
              {
                key: "loss",
                label: "损耗",
                children: (
                  <Card title="新增损耗">
                    <Form form={lossForm} layout="vertical" onFinish={submitLoss} initialValues={{ qty: 1, sourceBucket: "BORROWED", lossType: "BROKEN" }}>
                      <div className="form-row">
                        <Form.Item label="物品" name="itemId" rules={[{ required: true, message: "请选择物品" }]}>
                          <Select showSearch options={itemOptions} optionFilterProp="label" />
                        </Form.Item>
                        <Form.Item label="数量" name="qty" rules={[{ required: true, message: "请输入数量" }]}>
                          <InputNumber min={1} precision={0} step={1} style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item label="扣减来源" name="sourceBucket">
                          <Select options={[{ value: "AVAILABLE", label: "可用库存" }, { value: "BORROWED", label: "在外数量" }, { value: "PENDING", label: "待处理数量" }]} />
                        </Form.Item>
                        <Form.Item label="损耗原因" name="lossType">
                          <Select options={[
                            { value: "NORMAL_WEAR", label: "正常磨损" }, { value: "BROKEN", label: "断刀" },
                            { value: "SCRAPPED", label: "报废" }, { value: "LOST", label: "遗失" }, { value: "OTHER", label: "其他" },
                          ]} />
                        </Form.Item>
                        <Form.Item label="责任人" name="responsiblePerson">
                          <Select showSearch allowClear placeholder="选择责任人（选填）" optionFilterProp="label" options={receivers.map((r) => ({ value: r.realName, label: r.realName }))} />
                        </Form.Item>
                      </div>
                      <Button type="primary" htmlType="submit" loading={lossSubmitting}>提交损耗</Button>
                    </Form>
                    <div style={{ marginTop: 16, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                      <span>损耗日期：</span>
                      <DatePicker.RangePicker
                        value={lossRange}
                        onChange={(dates) => { if (dates?.[0] && dates?.[1]) setLossRange([dates[0], dates[1]]); }}
                      />
                    </div>
                    <Table
                      style={{ marginTop: 8 }}
                      rowKey="id"
                      dataSource={losses}
                      columns={[
                        { title: "物品", render: (_: unknown, row: LossRecord) => `${row.item.itemCode} / ${row.item.name}` },
                        { title: "数量", dataIndex: "qty", width: 80 },
                        {
                          title: "损耗原因", width: 100,
                          render: (_: unknown, row: LossRecord) => {
                            const map: Record<string, { label: string; color: string }> = {
                              NORMAL_WEAR: { label: "正常磨损", color: "default" }, BROKEN: { label: "断刀", color: "orange" },
                              SCRAPPED: { label: "报废", color: "red" }, LOST: { label: "遗失", color: "volcano" }, OTHER: { label: "其他", color: "default" },
                            };
                            const info = map[row.lossType];
                            return <Tag color={info?.color}>{info?.label ?? row.lossType}</Tag>;
                          },
                        },
                        {
                          title: "扣减来源", width: 100,
                          render: (_: unknown, row: LossRecord) => ({ AVAILABLE: "可用库存", BORROWED: "在外数量", PENDING: "待处理数量" } as Record<string, string>)[row.sourceBucket] ?? row.sourceBucket,
                        },
                        { title: "责任人", dataIndex: "responsiblePerson", width: 90 },
                        { title: "操作人", width: 90, render: (_: unknown, row: LossRecord) => row.operator.realName },
                        { title: "时间", width: 130, render: (_: unknown, row: LossRecord) => formatDateTime(row.recordTime) },
                      ]}
                    />
                  </Card>
                ),
              },
            ]}
          />

          <Modal title={editingStockIn ? `修改入库单 · ${editingStockIn.inNo}` : "修改入库单"} open={Boolean(editingStockIn)} onCancel={() => setEditingStockIn(null)} onOk={saveStockInEdit} confirmLoading={editSaving} width={900} destroyOnClose>
            {editingStockIn ? (
              <>
                <div className="toolbar">
                  <AutoComplete style={{ minWidth: 260 }} options={supplierNameOptions} value={editingSupplierName} onChange={setEditingSupplierName} placeholder="输入或选择供应商（必填）" filterOption={(inputValue, option) => (option?.value ?? "").toUpperCase().includes(inputValue.toUpperCase())} />
                  <span>{`入库时间：${formatDateTime(editingStockIn.inTime)}`}</span>
                  <span>{`来源采购清单：${editingStockIn.purchaseList?.listNo ?? "-"}`}</span>
                </div>
                <Table rowKey="id" pagination={false} dataSource={editingItems} columns={[
                  { title: "物品", dataIndex: "itemLabel" },
                  { title: "数量", dataIndex: "qty" },
                  { title: "单价", render: (_: unknown, row: EditableStockInItem) => <InputNumber min={0} precision={2} style={{ width: 120 }} value={row.unitPrice} onChange={(value) => updateEditingItem(row.id, { unitPrice: value ?? 0 })} /> },
                  { title: "渠道", render: (_: unknown, row: EditableStockInItem) => <Input value={row.purchaseChannel} onChange={(event) => updateEditingItem(row.id, { purchaseChannel: event.target.value })} /> },
                  { title: "备注", render: (_: unknown, row: EditableStockInItem) => <Input value={row.remark} onChange={(event) => updateEditingItem(row.id, { remark: event.target.value })} /> },
                ]} />
                <div style={{ marginTop: 16 }}>
                  <Input.TextArea rows={3} placeholder="入库单备注" value={editingRemark} onChange={(event) => setEditingRemark(event.target.value)} />
                </div>
              </>
            ) : null}
          </Modal>
        </>
      )}
    </>
  );
}
