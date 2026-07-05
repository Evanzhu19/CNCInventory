import { AutoComplete, Button, Card, DatePicker, Form, Input, InputNumber, Popconfirm, Select, Steps, Table, Tabs, Tag, Tooltip, message } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { api, getErrorMessage } from "../api/client";
import ItemPriceHistory from "../components/ItemPriceHistory";
import { canManagePurchaseLists, isProcurementManager } from "../lib/roles";
import type { CancelRequest, Item, ItemDetail, PurchaseList, PurchaseListItem, PurchaseRequest, Supplier, User } from "../types";

type PurchaseRequestItemRow = {
  itemId?: string;
  requestedName: string;
  requestedSpecification?: string;
  requestedQty: number;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  reason?: string;
};

type PurchaseRequestValues = {
  items: PurchaseRequestItemRow[];
};

type PurchaseRequestsPageProps = {
  user: User | null;
};

type PurchaseListItemDraft = {
  referencePrice?: number;
  referenceSupplierName: string;
  status: PurchaseListItem["status"];
  remark: string;
};

type PurchaseListStockInDraft = {
  selected: boolean;
  qty: number;
  unitPrice: number;
  purchaseChannel: string;
  remark: string;
};

const purchaseRequestStatusLabels: Record<PurchaseRequest["status"], string> = {
  PENDING: "待处理",
  MERGED: "已汇总",
  PURCHASED: "已采购",
  CANCELLED: "已取消",
};

const purchaseListStatusLabels: Record<PurchaseList["status"], string> = {
  PENDING: "待处理",
  PURCHASING: "采购中",
  ARRIVED: "部分到货",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

const purchaseListItemStatusLabels: Record<PurchaseListItem["status"], string> = {
  PENDING: "待处理",
  ORDERED: "已下单",
  ARRIVED: "部分到货",
  STOCKED_IN: "已全部入库",
  CANCELLED: "已取消",
};

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

function normalizeText(value?: string | null) {
  return value?.trim() ?? "";
}

function requestStatusColor(status: PurchaseRequest["status"]) {
  if (status === "PURCHASED") {
    return "green";
  }

  if (status === "MERGED") {
    return "blue";
  }

  if (status === "CANCELLED") {
    return "default";
  }

  return "gold";
}

function purchaseListStatusColor(status: PurchaseList["status"]) {
  if (status === "COMPLETED") {
    return "green";
  }

  if (status === "PURCHASING" || status === "ARRIVED") {
    return "blue";
  }

  if (status === "CANCELLED") {
    return "default";
  }

  return "gold";
}

function purchaseListItemStatusColor(status: PurchaseListItem["status"]) {
  if (status === "STOCKED_IN") {
    return "green";
  }

  if (status === "ORDERED" || status === "ARRIVED") {
    return "blue";
  }

  if (status === "CANCELLED") {
    return "default";
  }

  return "gold";
}

function priorityLabel(priority: PurchaseRequest["priority"]) {
  switch (priority) {
    case "LOW":
      return "低";
    case "MEDIUM":
      return "中";
    case "HIGH":
      return "高";
    case "URGENT":
      return "紧急";
    default:
      return priority;
  }
}

function priorityColor(priority: PurchaseRequest["priority"]) {
  if (priority === "URGENT") {
    return "red";
  }

  if (priority === "HIGH") {
    return "orange";
  }

  return undefined;
}

function CancelRequestBadge({ cr }: { cr: CancelRequest }) {
  if (cr.status === "PENDING") {
    return (
      <span style={{ color: "#fa8c16", fontWeight: 500 }}>
        &#x26A0; 取消申请待审批（{dayjs(cr.requestTime).format("MM-DD HH:mm")} 提交）
      </span>
    );
  }
  if (cr.status === "APPROVED") {
    return (
      <span style={{ color: "#8c8c8c" }}>
        取消申请已批准（{cr.reviewer?.realName}，{dayjs(cr.reviewedAt ?? cr.requestTime).format("MM-DD HH:mm")}）
      </span>
    );
  }
  if (cr.status === "REJECTED") {
    return (
      <span style={{ color: "#cf1322" }}>
        取消申请已拒绝{cr.reviewNote ? `：${cr.reviewNote}` : ""}（{cr.reviewer?.realName}，{dayjs(cr.reviewedAt ?? cr.requestTime).format("MM-DD HH:mm")}）
      </span>
    );
  }
  return null;
}

function getLinkedListStatus(request: PurchaseRequest): PurchaseList["status"] | null {
  if (request.status !== "MERGED") return null;
  for (const item of request.items) {
    const link = item.purchaseListLinks?.[0];
    if (link) return link.purchaseListItem.purchaseList.status;
  }
  return null;
}

function getEffectiveStatusDisplay(request: PurchaseRequest): { label: string; color: string } {
  if (request.status === "PENDING") return { label: "待处理", color: "gold" };
  if (request.status === "CANCELLED") return { label: "已取消", color: "default" };
  if (request.status === "PURCHASED") return { label: "已完成", color: "green" };
  if (request.status === "MERGED") {
    const listStatus = getLinkedListStatus(request);
    switch (listStatus) {
      case "PENDING":    return { label: "待下单", color: "orange" };
      case "PURCHASING": return { label: "采购中", color: "blue" };
      case "ARRIVED":    return { label: "部分到货", color: "cyan" };
      case "COMPLETED":  return { label: "已到货", color: "green" };
      case "CANCELLED":  return { label: "清单取消", color: "default" };
      default:           return { label: "已汇总", color: "blue" };
    }
  }
  return { label: request.status, color: "default" };
}

function requestItemLines(request: PurchaseRequest) {
  return request.items.map((item) => {
    const name = item.requestedName;
    const specification = item.requestedSpecification ? ` / ${item.requestedSpecification}` : "";
    const qty = ` x ${formatQty(item.requestedQty)}`;
    const unit = item.requestedUnit ?? item.item?.unit ?? "";
    return `${name}${specification}${qty}${unit}`;
  });
}

function getStockedInQty(item: PurchaseListItem) {
  return item.stockInItems.reduce((sum, stockInItem) => sum + Number(stockInItem.qty), 0);
}

function getRemainingQty(item: PurchaseListItem) {
  return Math.max(Number(item.qty) - getStockedInQty(item), 0);
}

function purchaseListRequestSources(item: PurchaseListItem) {
  return item.requestItemLinks.map((link) => {
    const purchaseRequest = link.purchaseRequestItem.purchaseRequest;
    return `${purchaseRequest.requestNo} / ${purchaseRequest.requester.realName} / ${formatQty(link.qty)}${item.unit ?? ""}`;
  });
}

function purchaseListStockIns(item: PurchaseListItem) {
  return item.stockInItems.map(
    (stockInItem) =>
      `${stockInItem.stockIn.inNo} / ${formatQty(stockInItem.qty)}${item.unit ?? ""} / ${formatDateTime(stockInItem.stockIn.inTime)}`,
  );
}

export default function PurchaseRequestsPage({ user }: PurchaseRequestsPageProps) {
  const [form] = Form.useForm<PurchaseRequestValues>();
  const [messageApi, contextHolder] = message.useMessage();
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("requests");
  const [items, setItems] = useState<Item[]>([]);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [purchaseLists, setPurchaseLists] = useState<PurchaseList[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedItemDetail, setSelectedItemDetail] = useState<ItemDetail | null>(null);
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>();
  const [createListRemark, setCreateListRemark] = useState("");
  const [purchaseListRemark, setPurchaseListRemark] = useState("");
  const [listItemDrafts, setListItemDrafts] = useState<Record<string, PurchaseListItemDraft>>({});
  const [stockInDrafts, setStockInDrafts] = useState<Record<string, PurchaseListStockInDraft>>({});
  const [stockInSupplierName, setStockInSupplierName] = useState("");
  const [stockInRemark, setStockInRemark] = useState("");

  const managePurchaseLists = canManagePurchaseLists(user);

  const [requestDateRange, setRequestDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(30, "day").startOf("day"),
    dayjs().endOf("day"),
  ]);
  const [requestStatusFilter, setRequestStatusFilter] = useState<PurchaseRequest["status"] | "ALL">("ALL");

  const [listDateRange, setListDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(30, "day").startOf("day"),
    dayjs().endOf("day"),
  ]);

  const selectedList = purchaseLists.find((purchaseList) => purchaseList.id === selectedListId) ?? null;
  const supplierNameOptions = suppliers.map((supplier) => ({
    value: supplier.name,
    label: supplier.channel ? `${supplier.name} / ${supplier.channel}` : supplier.name,
  }));

  async function loadStaticData() {
    try {
      if (managePurchaseLists) {
        const [itemsRes, suppliersRes] = await Promise.all([api.get("/items"), api.get("/suppliers")]);
        setItems(itemsRes.data.data);
        setSuppliers(suppliersRes.data.data);
      } else {
        const itemsRes = await api.get("/items");
        setItems(itemsRes.data.data);
      }
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  async function loadRequests(range: [dayjs.Dayjs, dayjs.Dayjs], status: string) {
    try {
      const params: Record<string, string> = {
        startDate: range[0].format("YYYY-MM-DD"),
        endDate: range[1].format("YYYY-MM-DD"),
      };
      if (status !== "ALL") params.status = status;
      const res = await api.get("/purchase-requests", { params });
      setRequests(res.data.data);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  async function loadLists(range: [dayjs.Dayjs, dayjs.Dayjs], preferredListId?: string) {
    if (!managePurchaseLists) return;
    try {
      const res = await api.get("/purchase-lists", {
        params: {
          startDate: range[0].format("YYYY-MM-DD"),
          endDate: range[1].format("YYYY-MM-DD"),
        },
      });
      const nextLists = res.data.data as PurchaseList[];
      setPurchaseLists(nextLists);
      setSelectedListId((current) => {
        const nextId = preferredListId ?? current;
        if (nextId && nextLists.some((l) => l.id === nextId)) return nextId;
        return nextLists[0]?.id;
      });
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  useEffect(() => {
    void loadStaticData();
  }, [managePurchaseLists]);

  useEffect(() => {
    void loadRequests(requestDateRange, requestStatusFilter);
  }, [requestDateRange, requestStatusFilter]);

  useEffect(() => {
    void loadLists(listDateRange);
  }, [listDateRange, managePurchaseLists]);

  useEffect(() => {
    if (!selectedList) {
      setPurchaseListRemark("");
      setListItemDrafts({});
      setStockInDrafts({});
      setStockInSupplierName("");
      setStockInRemark("");
      return;
    }

    setPurchaseListRemark(selectedList.remark ?? "");
    setListItemDrafts(
      Object.fromEntries(
        selectedList.items.map((item) => [
          item.id,
          {
            referencePrice:
              item.referencePrice === null || item.referencePrice === undefined ? undefined : Number(item.referencePrice),
            referenceSupplierName: item.referenceSupplier?.name ?? "",
            status: item.status,
            remark: item.remark ?? "",
          },
        ]),
      ),
    );
    setStockInDrafts(
      Object.fromEntries(
        selectedList.items.map((item) => {
          const remainingQty = getRemainingQty(item);
          return [
            item.id,
            {
              selected: Boolean(item.itemId) && remainingQty > 0 && item.status !== "CANCELLED",
              qty: remainingQty,
              unitPrice:
                item.referencePrice === null || item.referencePrice === undefined ? 0 : Number(item.referencePrice),
              purchaseChannel: "",
              remark: "",
            },
          ];
        }),
      ),
    );
    setStockInSupplierName(selectedList.items.find((item) => item.referenceSupplier?.name)?.referenceSupplier?.name ?? "");
    setStockInRemark("");
  }, [selectedListId, purchaseLists]);

  async function deleteRequest(id: string) {
    try {
      await api.delete(`/purchase-requests/${id}`);
      messageApi.success("采购申请已删除");
      await loadRequests(requestDateRange, requestStatusFilter);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  async function submit(values: PurchaseRequestValues) {
    setSubmitting(true);
    try {
      for (const row of values.items) {
        const selectedItem = items.find((item) => item.id === row.itemId);
        await api.post("/purchase-requests", {
          priority: row.priority,
          items: [
            {
              itemId: row.itemId,
              requestedName: row.requestedName || selectedItem?.name,
              requestedSpecification: row.requestedSpecification || selectedItem?.specification,
              requestedBrand: selectedItem?.brand,
              requestedUnit: selectedItem?.unit,
              requestedQty: row.requestedQty,
              reason: row.reason,
            },
          ],
        });
      }
      messageApi.success(
        values.items.length > 1
          ? `已提交 ${values.items.length} 条采购申请`
          : "采购申请已提交",
      );
      form.resetFields();
      setSelectedItemDetail(null);
      await loadRequests(requestDateRange, requestStatusFilter);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function loadItemDetail(itemId?: string) {
    if (!itemId) {
      setSelectedItemDetail(null);
      return;
    }

    try {
      const res = await api.get(`/items/${itemId}`);
      setSelectedItemDetail(res.data.data);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
      setSelectedItemDetail(null);
    }
  }

  async function createPurchaseList() {
    if (!selectedRequestIds.length) {
      messageApi.warning("请先选择待处理采购申请");
      return;
    }

    try {
      const res = await api.post("/purchase-lists", {
        purchaseRequestIds: selectedRequestIds,
        remark: normalizeText(createListRemark) || null,
      });
      messageApi.success("采购清单已生成");
      setSelectedRequestIds([]);
      setCreateListRemark("");
      setActiveTab("lists");
      await Promise.all([
        loadRequests(requestDateRange, requestStatusFilter),
        loadLists(listDateRange, res.data.data.id),
      ]);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  async function savePurchaseList() {
    if (!selectedList) return;

    try {
      await api.patch(`/purchase-lists/${selectedList.id}`, {
        remark: normalizeText(purchaseListRemark) || null,
        items: selectedList.items.map((item) => {
          const draft = listItemDrafts[item.id];
          return {
            id: item.id,
            referencePrice: draft?.referencePrice ?? null,
            supplierName: normalizeText(draft?.referenceSupplierName) || null,
            status: getStockedInQty(item) > 0 ? undefined : draft?.status,
            remark: normalizeText(draft?.remark) || null,
          };
        }),
      });
      messageApi.success("采购清单已保存");
      await loadLists(listDateRange, selectedList.id);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  async function cancelPurchaseList() {
    if (!selectedList) return;
    try {
      const res = await api.delete(`/purchase-lists/${selectedList.id}`);
      messageApi.success(res.data.message ?? "操作成功");
      await loadLists(listDateRange);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  async function markAllOrdered() {
    if (!selectedList) return;
    const pendingCount = selectedList.items.filter((i) => i.status === "PENDING").length;
    if (pendingCount === 0) {
      messageApi.info("没有待处理的明细");
      return;
    }
    try {
      await api.post(`/purchase-lists/${selectedList.id}/mark-ordered`);
      messageApi.success(`已将 ${pendingCount} 条明细标记为已下单`);
      await loadLists(listDateRange, selectedList.id);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  async function submitPurchaseListStockIn() {
    if (!selectedList) return;

    const normalizedSupplierName = normalizeText(stockInSupplierName);
    if (!normalizedSupplierName) {
      messageApi.warning("请输入供应商");
      return;
    }

    const selectedItems = selectedList.items
      .filter((item) => stockInDrafts[item.id]?.selected)
      .map((item) => ({ item, draft: stockInDrafts[item.id] }))
      .filter(({ item, draft }) => item.itemId && draft && draft.qty > 0);

    if (!selectedItems.length) {
      messageApi.warning("请至少选择一条待入库明细并填写本次入库数量");
      return;
    }

    try {
      await api.post(`/purchase-lists/${selectedList.id}/stock-in`, {
        supplierName: normalizedSupplierName,
        remark: normalizeText(stockInRemark) || null,
        items: selectedItems.map(({ item, draft }) => ({
          purchaseListItemId: item.id,
          qty: draft.qty,
          unitPrice: draft.unitPrice ?? 0,
          purchaseChannel: normalizeText(draft.purchaseChannel) || null,
          remark: normalizeText(draft.remark) || null,
        })),
      });
      messageApi.success("到货入库已提交");
      await loadLists(listDateRange, selectedList.id);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  function updateListItemDraft(itemId: string, patch: Partial<PurchaseListItemDraft>) {
    setListItemDrafts((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] ?? {
          referencePrice: undefined,
          referenceSupplierName: "",
          status: "PENDING",
          remark: "",
        }),
        ...patch,
      },
    }));
  }

  function updateStockInDraft(itemId: string, patch: Partial<PurchaseListStockInDraft>) {
    setStockInDrafts((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] ?? {
          selected: false,
          qty: 0,
          unitPrice: 0,
          purchaseChannel: "",
          remark: "",
        }),
        ...patch,
      },
    }));
  }

  const itemOptions = items.map((item) => ({
    value: item.id,
    label: `${item.itemCode} / ${item.name}${item.specification ? ` / ${item.specification}` : ""}`,
  }));

  const requestColumns = [
    { title: "申请单号", dataIndex: "requestNo", width: 160, ellipsis: true },
    { title: "申请人", dataIndex: ["requester", "realName"], width: 90 },
    {
      title: "申请内容",
      render: (_: unknown, row: PurchaseRequest) => (
        <div>
          {requestItemLines(row).map((line) => (
            <div key={line} style={{ whiteSpace: "nowrap" }}>{line}</div>
          ))}
        </div>
      ),
    },
    {
      title: "状态",
      width: 100,
      render: (_: unknown, row: PurchaseRequest) => {
        const s = getEffectiveStatusDisplay(row);
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: "紧急",
      width: 70,
      render: (_: unknown, row: PurchaseRequest) => (
        <Tag color={priorityColor(row.priority)}>{priorityLabel(row.priority)}</Tag>
      ),
    },
    {
      title: "时间",
      width: 130,
      render: (_: unknown, row: PurchaseRequest) => (
        <span style={{ whiteSpace: "nowrap" }}>{formatDateTime(row.requestTime)}</span>
      ),
    },
    ...(isProcurementManager(user) || user?.role === "CNC_SUPERVISOR"
      ? [
          {
            title: "操作",
            width: 70,
            render: (_: unknown, row: PurchaseRequest) =>
              row.status === "PENDING" ? (
                <Popconfirm
                  title="确认删除"
                  description="确认删除该采购申请吗？"
                  okText="删除"
                  okButtonProps={{ danger: true }}
                  cancelText="取消"
                  onConfirm={() => void deleteRequest(row.id)}
                >
                  <Button size="small" danger>
                    删除
                  </Button>
                </Popconfirm>
              ) : null,
          },
        ]
      : []),
  ];

  const purchaseListColumns = [
    { title: "清单号", dataIndex: "listNo", width: 150, ellipsis: true },
    {
      title: "状态",
      width: 90,
      render: (_: unknown, row: PurchaseList) => (
        <Tag color={purchaseListStatusColor(row.status)}>{purchaseListStatusLabels[row.status]}</Tag>
      ),
    },
    {
      title: "取消申请",
      width: 90,
      render: (_: unknown, row: PurchaseList) => {
        const cr = row.cancelRequest;
        if (!cr) return null;
        if (cr.status === "PENDING") return <Tag color="orange">待审批</Tag>;
        if (cr.status === "APPROVED") return <Tag color="default">已批准</Tag>;
        if (cr.status === "REJECTED") {
          return (
            <Tooltip title={cr.reviewNote ? `拒绝原因：${cr.reviewNote}` : "已拒绝"}>
              <Tag color="red">已拒绝</Tag>
            </Tooltip>
          );
        }
        return null;
      },
    },
    { title: "创建人", dataIndex: ["creator", "realName"], width: 80 },
    { title: "明细数", width: 70, render: (_: unknown, row: PurchaseList) => row.items.length },
    {
      title: "总数量",
      width: 80,
      render: (_: unknown, row: PurchaseList) => formatQty(row.items.reduce((sum, item) => sum + Number(item.qty), 0)),
    },
    {
      title: "创建时间",
      width: 140,
      defaultSortOrder: "descend" as const,
      sorter: (a: PurchaseList, b: PurchaseList) => dayjs(a.createdAt).unix() - dayjs(b.createdAt).unix(),
      render: (_: unknown, row: PurchaseList) => (
        <span style={{ whiteSpace: "nowrap" }}>{formatDateTime(row.createdAt)}</span>
      ),
    },
  ];

  const purchaseListItemColumns = [
    {
      title: "物品",
      width: 160,
      render: (_: unknown, row: PurchaseListItem) => (
        <div>
          <div>{row.itemName}</div>
          <div style={{ color: "#6b7c75", fontSize: 12 }}>
            {[row.specification, row.brand].filter(Boolean).join(" / ") || "—"}
          </div>
        </div>
      ),
    },
    {
      title: "需求来源",
      width: 200,
      render: (_: unknown, row: PurchaseListItem) => (
        <div style={{ fontSize: 12 }}>
          {purchaseListRequestSources(row).map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      ),
    },
    {
      title: "总量",
      width: 75,
      render: (_: unknown, row: PurchaseListItem) => `${formatQty(row.qty)}${row.unit ?? ""}`,
    },
    {
      title: "已入库",
      width: 75,
      render: (_: unknown, row: PurchaseListItem) => `${formatQty(getStockedInQty(row))}${row.unit ?? ""}`,
    },
    {
      title: "剩余",
      width: 70,
      render: (_: unknown, row: PurchaseListItem) => `${formatQty(getRemainingQty(row))}${row.unit ?? ""}`,
    },
    {
      title: "参考单价",
      width: 110,
      render: (_: unknown, row: PurchaseListItem) => (
        <InputNumber
          min={0}
          precision={2}
          style={{ width: "100%" }}
          value={listItemDrafts[row.id]?.referencePrice}
          onChange={(value) => updateListItemDraft(row.id, { referencePrice: value ?? undefined })}
        />
      ),
    },
    {
      title: "参考供应商",
      width: 180,
      render: (_: unknown, row: PurchaseListItem) => (
        <AutoComplete
          allowClear
          style={{ width: "100%" }}
          options={supplierNameOptions}
          value={listItemDrafts[row.id]?.referenceSupplierName}
          onChange={(value) => updateListItemDraft(row.id, { referenceSupplierName: value })}
          placeholder="输入或选择"
          filterOption={(inputValue, option) => (option?.value ?? "").toUpperCase().includes(inputValue.toUpperCase())}
        />
      ),
    },
    {
      title: "状态",
      width: 120,
      render: (_: unknown, row: PurchaseListItem) => (
        <Select
          style={{ width: "100%" }}
          disabled={getStockedInQty(row) > 0 || row.status === "STOCKED_IN"}
          value={listItemDrafts[row.id]?.status}
          options={[
            { value: "PENDING", label: "待处理" },
            { value: "ORDERED", label: "已下单" },
            { value: "ARRIVED", label: "已到货" },
            { value: "CANCELLED", label: "已取消" },
            ...(row.status === "STOCKED_IN" ? [{ value: "STOCKED_IN", label: "已全部入库" }] : []),
          ]}
          onChange={(value) => updateListItemDraft(row.id, { status: value })}
        />
      ),
    },
    {
      title: "备注",
      width: 120,
      render: (_: unknown, row: PurchaseListItem) => (
        <Input
          value={listItemDrafts[row.id]?.remark}
          onChange={(event) => updateListItemDraft(row.id, { remark: event.target.value })}
        />
      ),
    },
    {
      title: "入库记录",
      width: 220,
      render: (_: unknown, row: PurchaseListItem) => (
        <div style={{ fontSize: 12 }}>
          {purchaseListStockIns(row).length ? (
            purchaseListStockIns(row).map((line) => (
              <div key={line}>
                <Tag color={purchaseListItemStatusColor(row.status)}>{line}</Tag>
              </div>
            ))
          ) : (
            <Tag>{purchaseListItemStatusLabels[row.status]}</Tag>
          )}
        </div>
      ),
    },
  ];

  const stockInCandidateItems =
    selectedList?.items.filter((item) => item.status !== "CANCELLED" && getRemainingQty(item) > 0) ?? [];

  const stockInColumns = [
    {
      title: "物品",
      width: 160,
      render: (_: unknown, row: PurchaseListItem) => (
        <div>
          <div>{row.itemName}</div>
          <div style={{ color: "#6b7c75", fontSize: 12 }}>{row.itemId ? row.item?.itemCode ?? "已关联" : "未关联主数据"}</div>
        </div>
      ),
    },
    {
      title: "状态",
      width: 90,
      render: (_: unknown, row: PurchaseListItem) => (
        <Tag color={purchaseListItemStatusColor(row.status)}>{purchaseListItemStatusLabels[row.status]}</Tag>
      ),
    },
    { title: "总量", width: 75, render: (_: unknown, row: PurchaseListItem) => `${formatQty(row.qty)}${row.unit ?? ""}` },
    { title: "已入库", width: 75, render: (_: unknown, row: PurchaseListItem) => `${formatQty(getStockedInQty(row))}${row.unit ?? ""}` },
    { title: "剩余", width: 70, render: (_: unknown, row: PurchaseListItem) => `${formatQty(getRemainingQty(row))}${row.unit ?? ""}` },
    {
      title: "本次入库量",
      width: 130,
      render: (_: unknown, row: PurchaseListItem) => (
        <InputNumber
          min={1}
          max={Math.floor(getRemainingQty(row))}
          precision={0}
          step={1}
          style={{ width: "100%" }}
          value={stockInDrafts[row.id]?.qty}
          onChange={(value) => updateStockInDraft(row.id, { qty: value ?? 0 })}
        />
      ),
    },
    {
      title: "本次单价",
      width: 110,
      render: (_: unknown, row: PurchaseListItem) => (
        <InputNumber
          min={0}
          precision={2}
          style={{ width: "100%" }}
          value={stockInDrafts[row.id]?.unitPrice}
          onChange={(value) => updateStockInDraft(row.id, { unitPrice: value ?? 0 })}
        />
      ),
    },
    {
      title: "购买渠道",
      width: 120,
      render: (_: unknown, row: PurchaseListItem) => (
        <Input
          value={stockInDrafts[row.id]?.purchaseChannel}
          onChange={(event) => updateStockInDraft(row.id, { purchaseChannel: event.target.value })}
        />
      ),
    },
    {
      title: "备注",
      width: 120,
      render: (_: unknown, row: PurchaseListItem) => (
        <Input
          value={stockInDrafts[row.id]?.remark}
          onChange={(event) => updateStockInDraft(row.id, { remark: event.target.value })}
        />
      ),
    },
  ];

  return (
    <>
      {contextHolder}
      <h1 className="page-title">{managePurchaseLists ? "采购管理" : "采购申请"}</h1>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "requests",
            label: "采购申请",
            children: (
              <>
                <Card title="新增采购申请" style={{ marginBottom: 16 }}>
                  <Form
                    form={form}
                    layout="vertical"
                    onFinish={submit}
                    initialValues={{ items: [{ priority: "MEDIUM", requestedQty: 1 }] }}
                  >
                    {/* 列表头 */}
                    <div style={{ display: "grid", gridTemplateColumns: "190px 150px 120px 70px 90px 1fr 32px", gap: 8, marginBottom: 4, padding: "0 2px", fontSize: 12, color: "#8c8c8c", fontWeight: 500 }}>
                      <span>关联库存物品（选填）</span>
                      <span>申请名称 *</span>
                      <span>规格</span>
                      <span>数量 *</span>
                      <span>紧急程度</span>
                      <span>申请原因</span>
                      <span />
                    </div>

                    <Form.List name="items">
                      {(fields, { add, remove }) => (
                        <>
                          {fields.map((field) => (
                            <div key={field.key} style={{ display: "grid", gridTemplateColumns: "190px 150px 120px 70px 90px 1fr 32px", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                              <Form.Item name={[field.name, "itemId"]} style={{ margin: 0 }}>
                                <Select
                                  allowClear
                                  showSearch
                                  optionFilterProp="label"
                                  options={itemOptions}
                                  placeholder="搜索物品"
                                  onChange={(itemId) => {
                                    const item = items.find((row) => row.id === itemId);
                                    form.setFieldValue(["items", field.name, "requestedName"], item?.name ?? "");
                                    form.setFieldValue(["items", field.name, "requestedSpecification"], item?.specification ?? "");
                                    void loadItemDetail(itemId);
                                  }}
                                />
                              </Form.Item>
                              <Form.Item name={[field.name, "requestedName"]} style={{ margin: 0 }} rules={[{ required: true, message: "请填写" }]}>
                                <Input placeholder="名称" />
                              </Form.Item>
                              <Form.Item name={[field.name, "requestedSpecification"]} style={{ margin: 0 }}>
                                <Input placeholder="规格" />
                              </Form.Item>
                              <Form.Item name={[field.name, "requestedQty"]} style={{ margin: 0 }} rules={[{ required: true, message: "请填写" }]}>
                                <InputNumber min={1} precision={0} step={1} style={{ width: "100%" }} />
                              </Form.Item>
                              <Form.Item name={[field.name, "priority"]} style={{ margin: 0 }}>
                                <Select
                                  options={[
                                    { value: "LOW", label: "低" },
                                    { value: "MEDIUM", label: "中" },
                                    { value: "HIGH", label: "高" },
                                    { value: "URGENT", label: "紧急" },
                                  ]}
                                />
                              </Form.Item>
                              <Form.Item name={[field.name, "reason"]} style={{ margin: 0 }}>
                                <Input placeholder="原因（选填）" />
                              </Form.Item>
                              <Button
                                type="text"
                                danger
                                disabled={fields.length === 1}
                                onClick={() => remove(field.name)}
                                style={{ padding: "4px 8px", marginTop: 1 }}
                              >
                                ×
                              </Button>
                            </div>
                          ))}
                          <Button
                            type="dashed"
                            onClick={() => add({ priority: "MEDIUM", requestedQty: 1 })}
                            style={{ marginBottom: 16 }}
                          >
                            + 添加物品
                          </Button>
                        </>
                      )}
                    </Form.List>

                    <Button type="primary" htmlType="submit" loading={submitting}>
                      提交申请
                    </Button>
                  </Form>
                  {selectedItemDetail && (
                    <Card size="small" title="历史价格参考" style={{ marginTop: 16 }}>
                      <ItemPriceHistory detail={selectedItemDetail} compact />
                    </Card>
                  )}
                </Card>

                <Card title="采购申请列表">
                  {managePurchaseLists ? (
                    <div className="toolbar">
                      <Input
                        placeholder="生成采购清单时备注（可选）"
                        style={{ maxWidth: 320 }}
                        value={createListRemark}
                        onChange={(event) => setCreateListRemark(event.target.value)}
                      />
                      <Button type="primary" disabled={!selectedRequestIds.length} onClick={createPurchaseList}>
                        汇总成采购清单
                      </Button>
                    </div>
                  ) : null}
                  <div className="toolbar" style={{ marginBottom: 8 }}>
                    <DatePicker.RangePicker
                      value={requestDateRange}
                      onChange={(range) => {
                        setRequestDateRange(
                          range
                            ? [range[0] ?? dayjs().startOf("day"), range[1] ?? dayjs().endOf("day")]
                            : [dayjs().startOf("day"), dayjs().endOf("day")],
                        );
                      }}
                      allowClear={false}
                    />
                    <Select
                      value={requestStatusFilter}
                      onChange={setRequestStatusFilter}
                      style={{ width: 110 }}
                      options={[
                        { value: "ALL", label: "全部状态" },
                        { value: "PENDING", label: "待处理" },
                        { value: "MERGED", label: "已汇总" },
                        { value: "PURCHASED", label: "已采购" },
                        { value: "CANCELLED", label: "已取消" },
                      ]}
                    />
                    <span style={{ color: "#8c8c8c", fontSize: 12 }}>{`共 ${requests.length} 条`}</span>
                  </div>
                  <Table
                    rowKey="id"
                    dataSource={requests}
                    size="small"
                    scroll={{ x: 700 }}
                    rowSelection={
                      managePurchaseLists
                        ? {
                            selectedRowKeys: selectedRequestIds,
                            onChange: (keys) => setSelectedRequestIds(keys.map(String)),
                            getCheckboxProps: (row: PurchaseRequest) => ({
                              disabled: row.status !== "PENDING" || row.items.length === 0,
                            }),
                          }
                        : undefined
                    }
                    columns={requestColumns}
                  />
                </Card>
              </>
            ),
          },
          ...(managePurchaseLists
            ? [
                {
                  key: "lists",
                  label: "采购清单",
                  children: (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <Card title="采购清单列表">
                        <div className="toolbar" style={{ marginBottom: 12 }}>
                          <DatePicker.RangePicker
                            value={listDateRange}
                            onChange={(range) => {
                              setListDateRange(
                                range
                                  ? [range[0] ?? dayjs().startOf("day"), range[1] ?? dayjs().endOf("day")]
                                  : [dayjs().startOf("day"), dayjs().endOf("day")],
                              );
                            }}
                            allowClear={false}
                          />
                          <span style={{ color: "#8c8c8c", fontSize: 12 }}>
                            {`共 ${purchaseLists.length} 条`}
                          </span>
                        </div>
                        <Table
                          rowKey="id"
                          size="small"
                          dataSource={purchaseLists}
                          pagination={false}
                          columns={purchaseListColumns}
                          rowClassName={(row) => (row.id === selectedListId ? "ant-table-row-selected" : "")}
                          onRow={(row) => ({
                            onClick: () => setSelectedListId(row.id),
                            style: { cursor: "pointer" },
                          })}
                        />
                      </Card>

                      {selectedList && (
                        <>
                          <Card title={`清单详情 · ${selectedList.listNo}`}>
                            <div className="toolbar" style={{ marginBottom: 16 }}>
                              <Tag color={purchaseListStatusColor(selectedList.status)}>
                                {purchaseListStatusLabels[selectedList.status]}
                              </Tag>
                              <span>{`创建人：${selectedList.creator.realName}`}</span>
                              <span>{`创建时间：${formatDateTime(selectedList.createdAt)}`}</span>
                              {selectedList.stockIns.length > 0 && (
                                <span style={{ color: "#52c41a" }}>{`已入库 ${selectedList.stockIns.length} 次`}</span>
                              )}
                              {selectedList.cancelRequest && (
                                <CancelRequestBadge cr={selectedList.cancelRequest} />
                              )}
                            </div>
                            <Steps
                              size="small"
                              current={
                                selectedList.status === "CANCELLED" ? -1 :
                                selectedList.status === "COMPLETED" ? 4 :
                                selectedList.status === "ARRIVED" ? 2 :
                                selectedList.status === "PURCHASING" ? 2 :
                                1
                              }
                              status={selectedList.status === "CANCELLED" ? "error" : undefined}
                              style={{ marginBottom: 20 }}
                              items={[
                                { title: "已汇总", description: "清单已创建" },
                                { title: "标记下单", description: "一键标记全部已下单" },
                                { title: "到货入库", description: selectedList.status === "ARRIVED" ? "部分已入库" : "执行入库操作" },
                                { title: "全部完成" },
                              ]}
                            />
                            <Table
                              rowKey="id"
                              size="small"
                              dataSource={selectedList.items}
                              pagination={false}
                              columns={purchaseListItemColumns}
                              scroll={{ x: 1330 }}
                            />
                            <div style={{ marginTop: 16 }}>
                              <Input.TextArea
                                rows={2}
                                placeholder="采购清单备注"
                                value={purchaseListRemark}
                                onChange={(event) => setPurchaseListRemark(event.target.value)}
                              />
                            </div>
                            <div className="toolbar" style={{ marginTop: 16 }}>
                              <Button onClick={savePurchaseList}>
                                保存参考信息
                              </Button>
                              {selectedList.status === "PENDING" && (
                                <Popconfirm
                                  title="批量标记已下单"
                                  description={`将所有待处理 (${selectedList.items.filter((i) => i.status === "PENDING").length} 条) 明细标记为已下单？`}
                                  okText="确认"
                                  cancelText="取消"
                                  onConfirm={() => void markAllOrdered()}
                                >
                                  <Button type="primary">
                                    一键标记已下单
                                  </Button>
                                </Popconfirm>
                              )}
                              {(selectedList.status === "PURCHASING" || selectedList.status === "ARRIVED") && (
                                <Tag color="blue" style={{ padding: "4px 12px", fontSize: 13 }}>
                                  ↓ 已下单，请在下方执行到货入库
                                </Tag>
                              )}
                              {selectedList.status === "COMPLETED" && (
                                <Tag color="green" style={{ padding: "4px 12px", fontSize: 13 }}>
                                  全部入库完成
                                </Tag>
                              )}
                              {selectedList.status !== "CANCELLED" && (
                                <Popconfirm
                                  title={selectedList.status === "PENDING" ? "取消采购清单" : "申请取消采购清单"}
                                  description={
                                    selectedList.status === "PENDING"
                                      ? "将直接取消该清单，并将关联采购申请恢复为待处理状态。确认？"
                                      : "该清单已在处理中，将提交总经理审批，批准后执行取消。确认提交？"
                                  }
                                  okText={selectedList.status === "PENDING" ? "取消清单" : "提交申请"}
                                  okButtonProps={{ danger: true }}
                                  cancelText="不操作"
                                  onConfirm={() => void cancelPurchaseList()}
                                >
                                  <Button danger>
                                    {selectedList.status === "PENDING" ? "取消清单" : "申请取消"}
                                  </Button>
                                </Popconfirm>
                              )}
                            </div>
                          </Card>

                          <Card
                            title="到货入库"
                            headStyle={
                              selectedList.status === "PURCHASING" || selectedList.status === "ARRIVED"
                                ? { backgroundColor: "#e6f4ff", borderBottom: "2px solid #1677ff" }
                                : undefined
                            }
                          >
                            {stockInCandidateItems.length ? (
                              <>
                                <div className="toolbar">
                                  <AutoComplete
                                    style={{ minWidth: 260 }}
                                    options={supplierNameOptions}
                                    value={stockInSupplierName}
                                    onChange={setStockInSupplierName}
                                    placeholder="输入或选择供应商（必填）"
                                    filterOption={(inputValue, option) =>
                                      (option?.value ?? "").toUpperCase().includes(inputValue.toUpperCase())
                                    }
                                  />
                                </div>
                                <Table
                                  rowKey="id"
                                  size="small"
                                  dataSource={stockInCandidateItems}
                                  pagination={false}
                                  rowSelection={{
                                    selectedRowKeys: stockInCandidateItems
                                      .filter((item) => stockInDrafts[item.id]?.selected)
                                      .map((item) => item.id),
                                    onChange: (keys) => {
                                      const selectedKeys = new Set(keys.map(String));
                                      for (const item of stockInCandidateItems) {
                                        updateStockInDraft(item.id, { selected: selectedKeys.has(item.id) });
                                      }
                                    },
                                    getCheckboxProps: (row: PurchaseListItem) => ({
                                      disabled: !row.itemId,
                                    }),
                                  }}
                                  columns={stockInColumns}
                                  scroll={{ x: 950 }}
                                />
                                <div style={{ marginTop: 16 }}>
                                  <Input.TextArea
                                    rows={2}
                                    placeholder="本次到货入库备注"
                                    value={stockInRemark}
                                    onChange={(event) => setStockInRemark(event.target.value)}
                                  />
                                </div>
                                <div className="toolbar" style={{ marginTop: 16 }}>
                                  <Button type="primary" onClick={submitPurchaseListStockIn}>
                                    执行到货入库
                                  </Button>
                                </div>
                              </>
                            ) : (
                              <div>当前清单没有可入库明细。</div>
                            )}
                          </Card>
                        </>
                      )}
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
    </>
  );
}
