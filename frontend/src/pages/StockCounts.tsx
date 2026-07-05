import { Button, Drawer, Input, InputNumber, Modal, Popconfirm, Select, Switch, Table, Tag, message } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { api, getErrorMessage } from "../api/client";
import { isCncSupervisor } from "../lib/roles";
import type { User } from "../types";

type ItemForSelection = {
  id: string;
  itemCode: string;
  name: string;
  specification?: string | null;
  unit: string;
  category?: { id: string; name: string } | null;
};

type StockCountItem = {
  id: string;
  systemAvailableQty: string;
  systemBorrowedQty: string;
  systemPendingQty: string;
  actualAvailableQty: string;
  actualBorrowedQty: string;
  actualPendingQty: string;
  availableDiffQty: string;
  borrowedDiffQty: string;
  pendingDiffQty: string;
  explanation?: string | null;
  item: {
    id: string;
    itemCode: string;
    name: string;
    specification?: string | null;
    unit: string;
    category?: { name: string } | null;
  };
};

type StockCount = {
  id: string;
  countNo: string;
  status: "DRAFT" | "CONFIRMED" | "VOIDED";
  countTime: string;
  createdAt: string;
  remark?: string | null;
  createdBy: { id: string; realName: string };
  approvedBy?: { id: string; realName: string } | null;
  _count?: { items: number };
  items?: StockCountItem[];
};

type DraftValues = Record<string, {
  actualAvailableQty: number;
  actualBorrowedQty: number;
  actualPendingQty: number;
  explanation: string;
}>;

const STATUS_TAG: Record<StockCount["status"], { label: string; color: string }> = {
  DRAFT:     { label: "草稿", color: "orange" },
  CONFIRMED: { label: "已确认", color: "green" },
  VOIDED:    { label: "已作废", color: "default" },
};

function diffColor(diff: number) {
  if (diff > 0) return "#52c41a";
  if (diff < 0) return "#ff4d4f";
  return undefined;
}

function DiffCell({ diff }: { diff: number }) {
  return <span style={{ color: diffColor(diff) }}>{diff > 0 ? `+${diff}` : diff}</span>;
}

type StockCountsPageProps = {
  user: User | null;
};

export default function StockCountsPage({ user }: StockCountsPageProps) {
  const cncMode = isCncSupervisor(user);
  const [messageApi, contextHolder] = message.useMessage();
  const [counts, setCounts] = useState<StockCount[]>([]);

  // Create modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [allItems, setAllItems] = useState<ItemForSelection[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [itemSearch, setItemSearch] = useState("");
  const [loadingItems, setLoadingItems] = useState(false);
  const [creating, setCreating] = useState(false);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeCount, setActiveCount] = useState<StockCount | null>(null);
  const [draftValues, setDraftValues] = useState<DraftValues>({});
  const [saving, setSaving] = useState(false);
  const [showDiffOnly, setShowDiffOnly] = useState(false);

  async function load() {
    try {
      const res = await api.get("/stock-counts");
      setCounts(res.data.data);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  useEffect(() => { void load(); }, []);

  // ── Create modal ──────────────────────────────────────────────

  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of allItems) {
      if (item.category) seen.set(item.category.id, item.category.name);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [allItems]);

  const filteredModalItems = useMemo(() => {
    const search = itemSearch.trim().toLowerCase();
    return allItems.filter((item) => {
      if (categoryFilter !== "ALL" && item.category?.id !== categoryFilter) return false;
      if (search && !item.name.toLowerCase().includes(search) && !item.itemCode.toLowerCase().includes(search)) return false;
      return true;
    });
  }, [allItems, categoryFilter, itemSearch]);

  async function openCreateModal() {
    setCreateModalOpen(true);
    setLoadingItems(true);
    setCategoryFilter("ALL");
    setItemSearch("");
    try {
      const res = await api.get("/items");
      const items: ItemForSelection[] = res.data.data;
      setAllItems(items);
      setSelectedItemIds(items.map((i) => i.id));
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    } finally {
      setLoadingItems(false);
    }
  }

  async function createCount() {
    if (selectedItemIds.length === 0) {
      messageApi.warning("请至少选择一个物品");
      return;
    }
    setCreating(true);
    try {
      const res = await api.post("/stock-counts", { itemIds: selectedItemIds });
      messageApi.success("盘点单已创建");
      setCreateModalOpen(false);
      await load();
      await openCount(res.data.data.id);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    } finally {
      setCreating(false);
    }
  }

  // ── Drawer ────────────────────────────────────────────────────

  async function openCount(id: string) {
    try {
      const res = await api.get(`/stock-counts/${id}`);
      const count: StockCount = res.data.data;
      setActiveCount(count);
      const draft: DraftValues = {};
      for (const item of count.items ?? []) {
        draft[item.id] = {
          actualAvailableQty: Math.round(Number(item.actualAvailableQty)),
          actualBorrowedQty:  Math.round(Number(item.actualBorrowedQty)),
          actualPendingQty:   Math.round(Number(item.actualPendingQty)),
          explanation: item.explanation ?? "",
        };
      }
      setDraftValues(draft);
      setShowDiffOnly(false);
      setDrawerOpen(true);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  async function saveCount() {
    if (!activeCount) return;
    setSaving(true);
    try {
      const items = Object.entries(draftValues).map(([id, v]) => ({
        id,
        actualAvailableQty: v.actualAvailableQty,
        actualBorrowedQty:  v.actualBorrowedQty,
        actualPendingQty:   v.actualPendingQty,
        explanation: v.explanation || null,
      }));
      await api.patch(`/stock-counts/${activeCount.id}`, { items });
      messageApi.success("盘点数据已保存");
      await openCount(activeCount.id);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function confirmCount() {
    if (!activeCount) return;
    try {
      const res = await api.post(`/stock-counts/${activeCount.id}/confirm`);
      messageApi.success(res.data?.message ?? "盘点已确认");
      setDrawerOpen(false);
      await load();
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  async function voidCount(id: string) {
    try {
      await api.post(`/stock-counts/${id}/void`);
      messageApi.success("盘点单已作废");
      await load();
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  function updateDraft(itemId: string, patch: Partial<DraftValues[string]>) {
    setDraftValues((cur) => ({ ...cur, [itemId]: { ...cur[itemId], ...patch } }));
  }

  const isDraft = activeCount?.status === "DRAFT";

  // Live diff helper (uses draftValues for DRAFT, stored value for CONFIRMED)
  function liveDiff(row: StockCountItem, field: "available" | "borrowed" | "pending") {
    if (isDraft) {
      const vals = draftValues[row.id];
      if (!vals) return 0;
      if (field === "available") return vals.actualAvailableQty - Math.round(Number(row.systemAvailableQty));
      if (field === "borrowed")  return vals.actualBorrowedQty  - Math.round(Number(row.systemBorrowedQty));
      return vals.actualPendingQty - Math.round(Number(row.systemPendingQty));
    }
    if (field === "available") return Math.round(Number(row.availableDiffQty));
    if (field === "borrowed")  return Math.round(Number(row.borrowedDiffQty));
    return Math.round(Number(row.pendingDiffQty));
  }

  const drawerItems = useMemo(() => {
    const items = activeCount?.items ?? [];
    if (!showDiffOnly) return items;
    return items.filter((row) =>
      liveDiff(row, "available") !== 0 ||
      liveDiff(row, "borrowed")  !== 0 ||
      liveDiff(row, "pending")   !== 0,
    );
  }, [activeCount, showDiffOnly, draftValues, isDraft]);

  const diffCount = useMemo(
    () =>
      (activeCount?.items ?? []).filter(
        (row) => liveDiff(row, "available") !== 0 || liveDiff(row, "borrowed") !== 0 || liveDiff(row, "pending") !== 0,
      ).length,
    [activeCount, draftValues, isDraft],
  );

  // ── Render ────────────────────────────────────────────────────

  return (
    <>
      {contextHolder}
      <h1 className="page-title">库存盘点</h1>
      <div className="toolbar">
        <Button type="primary" onClick={() => void openCreateModal()}>
          发起盘点
        </Button>
        <Button onClick={() => void load()}>刷新</Button>
      </div>

      <Table
        rowKey="id"
        dataSource={counts}
        columns={[
          {
            title: "时间",
            dataIndex: "countTime",
            width: 160,
            render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm"),
          },
          { title: "单号", dataIndex: "countNo", width: 180 },
          {
            title: "状态",
            dataIndex: "status",
            width: 90,
            render: (v: StockCount["status"]) => (
              <Tag color={STATUS_TAG[v].color}>{STATUS_TAG[v].label}</Tag>
            ),
          },
          {
            title: "物品数",
            dataIndex: ["_count", "items"],
            width: 80,
            align: "right" as const,
          },
          { title: "创建人", dataIndex: ["createdBy", "realName"] },
          {
            title: "确认人",
            dataIndex: ["approvedBy", "realName"],
            render: (v?: string) => v ?? "-",
          },
          {
            title: "操作",
            width: 160,
            render: (_: unknown, row: StockCount) => (
              <div style={{ display: "flex", gap: 8 }}>
                <Button size="small" onClick={() => void openCount(row.id)}>
                  {row.status === "DRAFT" ? "填写" : "查看"}
                </Button>
                {row.status === "DRAFT" && (
                  <Popconfirm
                    title="确认作废该盘点单？"
                    okText="作废"
                    okButtonProps={{ danger: true }}
                    cancelText="取消"
                    onConfirm={() => void voidCount(row.id)}
                  >
                    <Button size="small" danger>作废</Button>
                  </Popconfirm>
                )}
              </div>
            ),
          },
        ]}
      />

      {/* ── Create modal ── */}
      <Modal
        title="发起盘点"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={() => void createCount()}
        okText={`创建盘点单（已选 ${selectedItemIds.length} 个物品）`}
        cancelText="取消"
        confirmLoading={creating}
        width={720}
        destroyOnClose
      >
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <Select
            style={{ width: 160 }}
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: "ALL", label: "全部分类" },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <Input.Search
            placeholder="搜索物品名称 / 编号"
            style={{ flex: 1 }}
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            allowClear
          />
          <Button
            size="small"
            onClick={() => setSelectedItemIds(filteredModalItems.map((i) => i.id))}
          >
            全选当前
          </Button>
          <Button
            size="small"
            onClick={() =>
              setSelectedItemIds((cur) => {
                const curSet = new Set(cur);
                const toRemove = new Set(filteredModalItems.map((i) => i.id));
                return cur.filter((id) => !toRemove.has(id));
              })
            }
          >
            取消当前
          </Button>
        </div>
        <Table
          rowKey="id"
          size="small"
          loading={loadingItems}
          dataSource={filteredModalItems}
          pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 个物品` }}
          rowSelection={{
            selectedRowKeys: selectedItemIds,
            onChange: (keys, rows) => {
              // Merge: keep selections from OTHER categories, replace for current filtered set
              const filteredIds = new Set(filteredModalItems.map((i) => i.id));
              const kept = selectedItemIds.filter((id) => !filteredIds.has(id));
              setSelectedItemIds([...kept, ...keys.map(String)]);
            },
          }}
          columns={[
            { title: "编号", dataIndex: "itemCode", width: 110, ellipsis: true },
            { title: "名称", dataIndex: "name", width: 150, ellipsis: true },
            { title: "规格", dataIndex: "specification", width: 120, ellipsis: true, render: (v?: string | null) => v ?? "-" },
            { title: "单位", dataIndex: "unit", width: 55 },
            {
              title: "分类",
              width: 90,
              render: (_: unknown, row: ItemForSelection) => row.category?.name ?? "-",
            },
          ]}
        />
      </Modal>

      {/* ── Detail drawer ── */}
      <Drawer
        open={drawerOpen}
        title={activeCount ? `${activeCount.countNo} · ${STATUS_TAG[activeCount.status].label}` : "盘点单"}
        width={1100}
        onClose={() => setDrawerOpen(false)}
        extra={
          isDraft ? (
            <div style={{ display: "flex", gap: 8 }}>
              <Button loading={saving} onClick={() => void saveCount()}>保存</Button>
              <Popconfirm
                title="确认盘点"
                description={
                  cncMode
                    ? "确认后，盘盈将自动生成入库单，盘亏将自动生成出库单，操作不可逆，请确认数据无误。"
                    : "确认后将根据实际数量调整库存，操作不可逆，请确认数据无误。"
                }
                okText="确认盘点"
                cancelText="取消"
                onConfirm={() => void confirmCount()}
              >
                <Button type="primary">确认盘点</Button>
              </Popconfirm>
            </div>
          ) : null
        }
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <Switch
            checked={showDiffOnly}
            onChange={setShowDiffOnly}
            checkedChildren="只看差异"
            unCheckedChildren="全部物品"
          />
          {diffCount > 0 ? (
            <span style={{ color: "#ff4d4f", fontSize: 13 }}>
              {`有差异 ${diffCount} / 共 ${activeCount?.items?.length ?? 0} 个物品`}
            </span>
          ) : (
            <span style={{ color: "#8c8c8c", fontSize: 13 }}>
              {`共 ${activeCount?.items?.length ?? 0} 个物品，暂无差异`}
            </span>
          )}
        </div>

        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={drawerItems}
          scroll={{ x: 980 }}
          rowClassName={(row) => {
            const hasDiff = liveDiff(row, "available") !== 0 || liveDiff(row, "borrowed") !== 0 || liveDiff(row, "pending") !== 0;
            return hasDiff ? "ant-table-row-selected" : "";
          }}
          columns={[
            {
              title: "分类",
              dataIndex: ["item", "category", "name"],
              width: 80,
              render: (v?: string) => v ?? "-",
            },
            { title: "名称", dataIndex: ["item", "name"], width: 120 },
            {
              title: "规格",
              dataIndex: ["item", "specification"],
              width: 100,
              render: (v?: string | null) => v ?? "-",
            },
            { title: "单位", dataIndex: ["item", "unit"], width: 55 },
            {
              title: "系统可用",
              dataIndex: "systemAvailableQty",
              width: 80,
              align: "right" as const,
              render: (v: string) => Math.round(Number(v)),
            },
            {
              title: "实际可用",
              width: 100,
              render: (_: unknown, row: StockCountItem) =>
                isDraft ? (
                  <InputNumber
                    size="small"
                    min={0}
                    precision={0}
                    step={1}
                    style={{ width: 80 }}
                    value={draftValues[row.id]?.actualAvailableQty ?? Math.round(Number(row.actualAvailableQty))}
                    onChange={(v) => updateDraft(row.id, { actualAvailableQty: v ?? 0 })}
                  />
                ) : (
                  Math.round(Number(row.actualAvailableQty))
                ),
            },
            {
              title: "可用差",
              width: 70,
              align: "right" as const,
              render: (_: unknown, row: StockCountItem) => <DiffCell diff={liveDiff(row, "available")} />,
            },
            // CNC主管盘点只调整可用数量，在外数量不展示编辑列
            ...(cncMode
              ? []
              : [
                  {
                    title: "系统在外",
                    dataIndex: "systemBorrowedQty",
                    width: 80,
                    align: "right" as const,
                    render: (v: string) => Math.round(Number(v)),
                  },
                  {
                    title: "实际在外",
                    width: 100,
                    render: (_: unknown, row: StockCountItem) =>
                      isDraft ? (
                        <InputNumber
                          size="small"
                          min={0}
                          precision={0}
                          step={1}
                          style={{ width: 80 }}
                          value={draftValues[row.id]?.actualBorrowedQty ?? Math.round(Number(row.actualBorrowedQty))}
                          onChange={(v) => updateDraft(row.id, { actualBorrowedQty: v ?? 0 })}
                        />
                      ) : (
                        Math.round(Number(row.actualBorrowedQty))
                      ),
                  },
                  {
                    title: "在外差",
                    width: 70,
                    align: "right" as const,
                    render: (_: unknown, row: StockCountItem) => <DiffCell diff={liveDiff(row, "borrowed")} />,
                  },
                ]),
            {
              title: "备注说明",
              render: (_: unknown, row: StockCountItem) =>
                isDraft ? (
                  <Input
                    size="small"
                    placeholder="差异原因"
                    value={draftValues[row.id]?.explanation ?? ""}
                    onChange={(e) => updateDraft(row.id, { explanation: e.target.value })}
                  />
                ) : (
                  row.explanation ?? "-"
                ),
            },
          ]}
        />
      </Drawer>
    </>
  );
}
