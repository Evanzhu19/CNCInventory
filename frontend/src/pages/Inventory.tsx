import { AutoComplete, Button, Drawer, Form, Input, InputNumber, Modal, Select, Table, Tag, message } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { api, getErrorMessage } from "../api/client";
import { exportToExcel } from "../lib/excel";
import ItemPriceHistory from "../components/ItemPriceHistory";
import { isProcurementManager } from "../lib/roles";
import type { Category, InventoryRow, ItemDetail, Supplier, User } from "../types";

const statusMap = {
  normal: { color: "green", text: "正常" },
  low_stock: { color: "orange", text: "低库存" },
  out_of_stock: { color: "red", text: "缺货" },
};

type InventoryPageProps = {
  user: User | null;
};

type InventoryAdjustmentDraft = {
  availableQty: number;
  borrowedQty: number;
  pendingQty: number;
  reason: string;
};

type ItemEditValues = {
  itemCode?: string;
  name: string;
  specification?: string;
  brand?: string;
  categoryId: string;
  unit: string;
  trackingMode: "CLOSED_LOOP" | "CONSUMABLE" | "HIGH_VALUE_CONSUMABLE" | "REPAIR_PENDING";
  safeStock: number;
  defaultSupplierName?: string;
  remark?: string;
};

export default function InventoryPage({ user }: InventoryPageProps) {
  const [itemForm] = Form.useForm<ItemEditValues>();
  const [messageApi, contextHolder] = message.useMessage();
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allCategoryIds, setAllCategoryIds] = useState<Set<string>>(new Set());
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [adjustingRow, setAdjustingRow] = useState<InventoryRow | null>(null);
  const [editingItem, setEditingItem] = useState<InventoryRow | null>(null);
  const [adjustmentDraft, setAdjustmentDraft] = useState<InventoryAdjustmentDraft>({
    availableQty: 0,
    borrowedQty: 0,
    pendingQty: 0,
    reason: "",
  });
  const supplierNameOptions = suppliers.map((supplier) => ({
    value: supplier.name,
    label: supplier.channel ? `${supplier.name} / ${supplier.channel}` : supplier.name,
  }));

  async function load(overrideCategory?: string | null) {
    try {
      const catId = overrideCategory !== undefined ? overrideCategory : filterCategoryId;
      const params: Record<string, string> = {};
      if (search.trim()) params.search = search.trim();
      if (catId) params.categoryId = catId;

      const [inventoryRes, categoriesRes, suppliersRes] = await Promise.all([
        api.get("/inventory/list", { params }),
        api.get("/categories"),
        api.get("/suppliers"),
      ]);
      const newRows: InventoryRow[] = inventoryRes.data.data;
      setRows(newRows);
      setCategories(categoriesRes.data.data);
      setSuppliers(suppliersRes.data.data);

      // 首次加载（无筛选）时记录全量有库存的小类 ID，用于筛选器选项
      if (!catId && !params.search) {
        setAllCategoryIds(new Set(newRows.map((r) => r.item.category?.id).filter(Boolean) as string[]));
      }
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  async function openDetail(itemId: string) {
    setSelectedItemId(itemId);
    setDetailLoading(true);
    try {
      const res = await api.get(`/items/${itemId}`);
      setDetail(res.data.data);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openAdjustment(row: InventoryRow) {
    setAdjustingRow(row);
    setAdjustmentDraft({
      availableQty: Number(row.availableQty),
      borrowedQty: Number(row.borrowedQty),
      pendingQty: Number(row.pendingQty),
      reason: "",
    });
  }

  function openItemEdit(row: InventoryRow) {
    setEditingItem(row);
    itemForm.setFieldsValue({
      itemCode: row.item.itemCode,
      name: row.item.name,
      specification: row.item.specification ?? undefined,
      brand: row.item.brand ?? undefined,
      categoryId: row.item.categoryId ?? row.item.category?.id,
      unit: row.item.unit,
      trackingMode: row.item.trackingMode,
      safeStock: Number(row.item.safeStock),
      defaultSupplierName: row.item.defaultSupplier?.name ?? undefined,
      remark: row.item.remark ?? undefined,
    });
  }

  async function submitAdjustment() {
    if (!adjustingRow) {
      return;
    }

    if (!adjustmentDraft.reason.trim()) {
      messageApi.warning("请填写调整原因");
      return;
    }

    try {
      await api.patch(`/inventory/${adjustingRow.id}`, {
        availableQty: adjustmentDraft.availableQty,
        borrowedQty: adjustmentDraft.borrowedQty,
        pendingQty: adjustmentDraft.pendingQty,
        reason: adjustmentDraft.reason.trim(),
      });
      messageApi.success("库存已调整");
      setAdjustingRow(null);
      await load();
      if (selectedItemId === adjustingRow.item.id) {
        await openDetail(adjustingRow.item.id);
      }
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  async function submitItemEdit(values: ItemEditValues) {
    if (!editingItem) {
      return;
    }

    try {
      await api.patch(`/items/${editingItem.item.id}`, values);
      messageApi.success("物品主数据已更新");
      setEditingItem(null);
      await load();
      if (selectedItemId === editingItem.item.id) {
        await openDetail(editingItem.item.id);
      }
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  // 始终用首次全量加载的 ID 集合，筛选后也不变
  const activeCategoryOptions = categories
    .filter((c) => c.level === 2 && allCategoryIds.has(c.id))
    .map((c) => ({ value: c.id, label: c.name }));

  // 编辑物品时小类分组选项（可搜索）
  const rootCategories = categories.filter((c) => c.level === 1);
  const categorySelectOptions = rootCategories.map((root) => ({
    label: root.name,
    options: categories
      .filter((c) => c.level === 2 && c.parentId === root.id)
      .map((c) => ({ value: c.id, label: c.name })),
  }));

  return (
    <>
      {contextHolder}
      <h1 className="page-title">库存</h1>
      <div className="toolbar">
        <Input.Search
          allowClear
          placeholder="搜索编码、名称、规格、品牌"
          style={{ maxWidth: 360 }}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onSearch={() => void load()}
        />
        <Select
          allowClear
          placeholder="按小类筛选"
          style={{ width: 160 }}
          options={activeCategoryOptions}
          value={filterCategoryId}
          onChange={(value) => {
            const next = value ?? null;
            setFilterCategoryId(next);
            void load(next);
          }}
        />
        <Button onClick={() => void load()}>刷新</Button>
        <Button
          onClick={() => {
            exportToExcel(
              [
                {
                  name: "库存",
                  rows: rows.map((r) => ({
                    编码: r.item.itemCode,
                    名称: r.item.name,
                    规格: r.item.specification ?? "",
                    品牌: r.item.brand ?? "",
                    分类: r.item.category?.name ?? "",
                    可用: Number(r.availableQty),
                    在外: Number(r.borrowedQty),
                    待处理: Number(r.pendingQty),
                    安全库存: Number(r.item.safeStock),
                    状态: r.status === "out_of_stock" ? "缺货" : r.status === "low_stock" ? "低库存" : "正常",
                  })),
                },
              ],
              `库存_${dayjs().format("YYYYMMDD_HHmm")}.xlsx`,
            );
          }}
        >
          导出 Excel
        </Button>
      </div>
      <Table
        rowKey="id"
        dataSource={rows}
        rowClassName={(row) => (row.status === "out_of_stock" ? "row-out-of-stock" : row.status === "low_stock" ? "row-low-stock" : "")}
        onRow={(row) => ({
          onClick: () => void openDetail(row.item.id),
          style: { cursor: "pointer" },
        })}
        columns={[
          { title: "编码", dataIndex: ["item", "itemCode"] },
          { title: "名称", dataIndex: ["item", "name"] },
          { title: "规格", dataIndex: ["item", "specification"] },
          { title: "品牌", dataIndex: ["item", "brand"] },
          { title: "分类", dataIndex: ["item", "category", "name"] },
          { title: "可用", dataIndex: "availableQty" },
          { title: "在外", dataIndex: "borrowedQty" },
          { title: "待处理", dataIndex: "pendingQty" },
          { title: "安全库存", dataIndex: ["item", "safeStock"] },
          {
            title: "状态",
            render: (_: unknown, row: InventoryRow) => {
              const status = statusMap[row.status];
              return <Tag color={status.color}>{status.text}</Tag>;
            },
          },
          {
            title: "详情",
            render: (_: unknown, row: InventoryRow) => (
              <Button
                size="small"
                onClick={(event) => {
                  event.stopPropagation();
                  void openDetail(row.item.id);
                }}
              >
                历史价格
              </Button>
            ),
          },
          ...(isProcurementManager(user)
            ? [
                {
                  title: "编辑物品",
                  render: (_: unknown, row: InventoryRow) => (
                    <Button
                      size="small"
                      onClick={(event) => {
                        event.stopPropagation();
                        openItemEdit(row);
                      }}
                    >
                      编辑物品
                    </Button>
                  ),
                },
                {
                  title: "调整",
                  render: (_: unknown, row: InventoryRow) => (
                    <Button
                      size="small"
                      onClick={(event) => {
                        event.stopPropagation();
                        openAdjustment(row);
                      }}
                    >
                      手动调整
                    </Button>
                  ),
                },
              ]
            : []),
        ]}
      />
      <Drawer
        open={Boolean(selectedItemId)}
        title={detail ? `${detail.item.name} / ${detail.item.specification ?? "未填写规格"}` : "物品详情"}
        width={880}
        onClose={() => {
          setSelectedItemId(null);
          setDetail(null);
        }}
        loading={detailLoading}
      >
        <ItemPriceHistory detail={detail} />
      </Drawer>
      <Modal
        open={Boolean(adjustingRow)}
        title={adjustingRow ? `手动调整库存 · ${adjustingRow.item.itemCode}` : "手动调整库存"}
        onCancel={() => setAdjustingRow(null)}
        onOk={() => void submitAdjustment()}
        destroyOnClose
      >
        {adjustingRow ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div>{`${adjustingRow.item.name}${adjustingRow.item.specification ? ` / ${adjustingRow.item.specification}` : ""}`}</div>
            <InputNumber
              addonBefore="可用"
              min={0}
              precision={0}
              step={1}
              style={{ width: "100%" }}
              value={adjustmentDraft.availableQty}
              onChange={(value) =>
                setAdjustmentDraft((current) => ({ ...current, availableQty: value ?? 0 }))
              }
            />
            <InputNumber
              addonBefore="在外"
              min={0}
              precision={0}
              step={1}
              style={{ width: "100%" }}
              value={adjustmentDraft.borrowedQty}
              onChange={(value) =>
                setAdjustmentDraft((current) => ({ ...current, borrowedQty: value ?? 0 }))
              }
            />
            <InputNumber
              addonBefore="待处理"
              min={0}
              precision={0}
              step={1}
              style={{ width: "100%" }}
              value={adjustmentDraft.pendingQty}
              onChange={(value) =>
                setAdjustmentDraft((current) => ({ ...current, pendingQty: value ?? 0 }))
              }
            />
            <Input.TextArea
              rows={4}
              placeholder="请填写手动调整原因"
              value={adjustmentDraft.reason}
              onChange={(event) =>
                setAdjustmentDraft((current) => ({ ...current, reason: event.target.value }))
              }
            />
          </div>
        ) : null}
      </Modal>
      <Modal
        open={Boolean(editingItem)}
        title={editingItem ? `编辑物品 · ${editingItem.item.itemCode}` : "编辑物品"}
        onCancel={() => setEditingItem(null)}
        onOk={() => void itemForm.submit()}
        width={920}
        destroyOnClose
      >
        <Form form={itemForm} layout="vertical" onFinish={submitItemEdit}>
          <div className="form-row">
            <Form.Item label="编码" name="itemCode">
              <Input />
            </Form.Item>
            <Form.Item label="名称" name="name" rules={[{ required: true, message: "请输入名称" }]}>
              <Input />
            </Form.Item>
            <Form.Item label="规格" name="specification">
              <Input />
            </Form.Item>
            <Form.Item label="品牌" name="brand">
              <Input />
            </Form.Item>
            <Form.Item label="小类" name="categoryId" rules={[{ required: true, message: "请选择小类" }]}>
              <Select
                showSearch
                placeholder="输入或选择小类"
                optionFilterProp="label"
                options={categorySelectOptions}
              />
            </Form.Item>
            <Form.Item label="单位" name="unit" rules={[{ required: true, message: "请输入单位" }]}>
              <Input />
            </Form.Item>
            <Form.Item label="跟踪模式" name="trackingMode">
              <Select
                options={[
                  { value: "CLOSED_LOOP", label: "闭环刀具" },
                  { value: "CONSUMABLE", label: "普通消耗品" },
                  { value: "HIGH_VALUE_CONSUMABLE", label: "高值消耗品" },
                  { value: "REPAIR_PENDING", label: "待修/寄修件" },
                ]}
              />
            </Form.Item>
            <Form.Item label="安全库存" name="safeStock">
              <InputNumber min={0} precision={0} step={1} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label="默认供应商" name="defaultSupplierName">
              <AutoComplete
                allowClear
                options={supplierNameOptions}
                placeholder="输入或选择默认供应商"
                filterOption={(inputValue, option) =>
                  (option?.value ?? "").toUpperCase().includes(inputValue.toUpperCase())
                }
              />
            </Form.Item>
            <Form.Item label="默认价格">
              <Input
                value={
                  editingItem?.item.defaultPrice
                    ? `当前默认价 ¥${Number(editingItem.item.defaultPrice).toFixed(2)}，系统按最近一次采购入库自动更新`
                    : "暂无采购价格，系统会在首次采购入库后自动更新"
                }
                readOnly
                disabled
              />
            </Form.Item>
          </div>
          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
