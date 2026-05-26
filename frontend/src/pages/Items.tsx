import { AutoComplete, Button, Card, Col, Divider, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Table, Tabs, Tag, message } from "antd";
import { useEffect, useState } from "react";
import { api, getErrorMessage } from "../api/client";
import { canManageItems, isAdmin, isProcurementManager } from "../lib/roles";
import type { Category, Item, Supplier } from "../types";

type ItemFormValues = {
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

type ItemsPageProps = {
  user: import("../types").User | null;
};

const TRACKING_MODE_OPTIONS = [
  { value: "CLOSED_LOOP", label: "闭环刀具" },
  { value: "CONSUMABLE", label: "普通消耗品" },
  { value: "HIGH_VALUE_CONSUMABLE", label: "高值消耗品" },
  { value: "REPAIR_PENDING", label: "待修/寄修件" },
];

const TRACKING_MODE_TAG: Record<string, { color: string; text: string }> = {
  CLOSED_LOOP: { color: "green", text: "闭环" },
  CONSUMABLE: { color: "default", text: "消耗品" },
  HIGH_VALUE_CONSUMABLE: { color: "orange", text: "高值消耗" },
  REPAIR_PENDING: { color: "blue", text: "待修件" },
};

export default function ItemsPage({ user }: ItemsPageProps) {
  const [form] = Form.useForm<ItemFormValues>();
  const [catForm] = Form.useForm<{ name: string; parentId: string }>();
  const [messageApi, contextHolder] = message.useMessage();
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catSubmitting, setCatSubmitting] = useState(false);

  async function load(nextSearch = search, nextCategory = filterCategoryId) {
    const normalizedSearch = nextSearch.trim();
    const params: Record<string, string> = {};
    if (normalizedSearch) params.search = normalizedSearch;
    if (nextCategory) params.categoryId = nextCategory;
    try {
      const [itemsRes, categoriesRes, suppliersRes] = await Promise.all([
        api.get("/items", { params }),
        api.get("/categories"),
        api.get("/suppliers"),
      ]);
      setItems(itemsRes.data.data);
      setCategories(categoriesRes.data.data);
      setSuppliers(suppliersRes.data.data);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  useEffect(() => {
    void load("");
  }, []);

  const supplierNameOptions = suppliers.map((supplier) => ({
    value: supplier.name,
    label: supplier.channel ? `${supplier.name} / ${supplier.channel}` : supplier.name,
  }));

  const rootCategories = categories.filter((c) => c.level === 1);
  const subCategories = categories.filter((c) => c.level === 2);

  // 按大类分组，给新增表单用
  const categorySelectOptions = rootCategories.map((root) => ({
    label: root.name,
    options: subCategories
      .filter((c) => c.parentId === root.id)
      .map((c) => ({ value: c.id, label: c.name })),
  }));

  // 筛选器只列出当前结果里出现过的小类
  const activeCategoryIds = new Set(items.map((item) => item.categoryId).filter(Boolean) as string[]);
  const filterCategoryOptions = subCategories
    .filter((c) => activeCategoryIds.has(c.id) || c.id === filterCategoryId)
    .map((c) => ({ value: c.id, label: c.name }));

  async function deleteItem(id: string) {
    try {
      await api.delete(`/items/${id}`);
      messageApi.success("物品已删除");
      await load();
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  async function submit(values: ItemFormValues) {
    try {
      await api.post("/items", values);
      messageApi.success("物品已新增");
      form.resetFields();
      await load();
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  async function addCategory(values: { name: string; parentId: string }) {
    setCatSubmitting(true);
    try {
      await api.post("/categories", { name: values.name.trim(), parentId: values.parentId });
      messageApi.success("分类已添加");
      catForm.resetFields();
      await load();
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    } finally {
      setCatSubmitting(false);
    }
  }

  async function deleteCategory(id: string) {
    try {
      await api.delete(`/categories/${id}`);
      messageApi.success("分类已删除");
      await load();
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  const canManageCats = isProcurementManager(user) || isAdmin(user);

  return (
    <>
      {contextHolder}
      <h1 className="page-title">物品</h1>

      {canManageItems(user) && (
        <Card title="新增物品" style={{ marginBottom: 16 }}>
          <Form
            form={form}
            layout="vertical"
            initialValues={{ unit: "支", trackingMode: "CLOSED_LOOP", safeStock: 0 }}
            onFinish={submit}
          >
            <Divider orientation="left" orientationMargin={0} style={{ marginTop: 0 }}>基本信息</Divider>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label="名称" name="name" rules={[{ required: true, message: "请输入名称" }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="规格" name="specification">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="品牌" name="brand">
                  <Input />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label="编码" name="itemCode">
                  <Input placeholder="留空自动生成" />
                </Form.Item>
              </Col>
            </Row>

            <Divider orientation="left" orientationMargin={0}>分类 & 属性</Divider>
            <Row gutter={16}>
              <Col span={10}>
                <Form.Item label="小类" name="categoryId" rules={[{ required: true, message: "请选择小类" }]}>
                  <Select
                    showSearch
                    placeholder="输入或选择小类"
                    optionFilterProp="label"
                    options={categorySelectOptions}
                  />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item label="单位" name="unit" rules={[{ required: true, message: "请输入单位" }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col span={10}>
                <Form.Item label="跟踪模式" name="trackingMode">
                  <Select options={TRACKING_MODE_OPTIONS} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item label="安全库存" name="safeStock">
                  <InputNumber min={0} precision={0} step={1} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
            </Row>

            <Divider orientation="left" orientationMargin={0}>采购</Divider>
            <Row gutter={16}>
              <Col span={12}>
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
              </Col>
            </Row>
            <Form.Item label="备注" name="remark">
              <Input.TextArea rows={3} />
            </Form.Item>

            <Button type="primary" htmlType="submit">
              新增物品
            </Button>
          </Form>
        </Card>
      )}

      <Tabs
        items={[
          {
            key: "list",
            label: `已添加物品（${items.length}）`,
            children: (
              <>
                <div className="toolbar" style={{ marginBottom: 16 }}>
                  <Input.Search
                    allowClear
                    placeholder="搜索编码、名称、规格、品牌"
                    style={{ maxWidth: 360 }}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onSearch={(value) => void load(value, filterCategoryId)}
                  />
                  <Select
                    allowClear
                    placeholder="按小类筛选"
                    style={{ width: 160 }}
                    options={filterCategoryOptions}
                    value={filterCategoryId}
                    onChange={(value) => {
                      const next = value ?? null;
                      setFilterCategoryId(next);
                      void load(search, next);
                    }}
                  />
                  <Button onClick={() => void load()}>刷新</Button>
                  {canManageCats && (
                    <Button onClick={() => setCatModalOpen(true)}>管理分类</Button>
                  )}
                </div>
                <Table
                  rowKey="id"
                  dataSource={items}
                  pagination={{ pageSize: 5, showTotal: (total) => `共 ${total} 个物品`, showSizeChanger: false }}
                  columns={[
                    { title: "编码", dataIndex: "itemCode" },
                    { title: "名称", dataIndex: "name" },
                    { title: "规格", dataIndex: "specification" },
                    { title: "品牌", dataIndex: "brand" },
                    { title: "分类", dataIndex: ["category", "name"] },
                    { title: "默认供应商", dataIndex: ["defaultSupplier", "name"] },
                    { title: "单位", dataIndex: "unit" },
                    { title: "安全库存", dataIndex: "safeStock" },
                    {
                      title: "模式",
                      render: (_: unknown, row: Item) => {
                        const t = TRACKING_MODE_TAG[row.trackingMode] ?? { color: "default", text: row.trackingMode };
                        return <Tag color={t.color}>{t.text}</Tag>;
                      },
                    },
                    ...(isProcurementManager(user)
                      ? [
                          {
                            title: "操作",
                            render: (_: unknown, row: Item) => (
                              <Popconfirm
                                title="确认删除"
                                description="删除后不可恢复，确认删除该物品吗？"
                                okText="删除"
                                okButtonProps={{ danger: true }}
                                cancelText="取消"
                                onConfirm={() => void deleteItem(row.id)}
                              >
                                <Button size="small" danger>
                                  删除
                                </Button>
                              </Popconfirm>
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              </>
            ),
          },
        ]}
      />

      {/* 分类管理 Modal */}
      <Modal
        title="管理分类"
        open={catModalOpen}
        onCancel={() => setCatModalOpen(false)}
        footer={null}
        width={560}
      >
        <Form
          form={catForm}
          layout="inline"
          style={{ marginBottom: 16 }}
          onFinish={addCategory}
        >
          <Form.Item name="parentId" rules={[{ required: true, message: "请选择大类" }]}>
            <Select placeholder="选择大类" style={{ width: 120 }}>
              {rootCategories.map((r) => (
                <Select.Option key={r.id} value={r.id}>
                  {r.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="name" rules={[{ required: true, message: "请输入小类名称" }]}>
            <Input placeholder="新小类名称" style={{ width: 160 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={catSubmitting}>
              添加
            </Button>
          </Form.Item>
        </Form>

        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={subCategories}
          columns={[
            {
              title: "大类",
              render: (_, row) => rootCategories.find((r) => r.id === row.parentId)?.name ?? "-",
            },
            { title: "小类名称", dataIndex: "name" },
            {
              title: "操作",
              render: (_, row) => (
                <Popconfirm
                  title="确认删除"
                  description="该小类下有物品时无法删除"
                  okText="删除"
                  okButtonProps={{ danger: true }}
                  cancelText="取消"
                  onConfirm={() => void deleteCategory(row.id)}
                >
                  <Button size="small" danger>
                    删除
                  </Button>
                </Popconfirm>
              ),
            },
          ]}
        />
      </Modal>
    </>
  );
}
