import { AutoComplete, Button, Card, Form, Input, InputNumber, Popconfirm, Select, Table, Tag, message } from "antd";
import { useEffect, useState } from "react";
import { api, getErrorMessage } from "../api/client";
import { canManageItems, isProcurementManager } from "../lib/roles";
import type { Category, Item, Supplier } from "../types";

type ItemFormValues = {
  itemCode?: string;
  name: string;
  specification?: string;
  brand?: string;
  categoryId: string;
  unit: string;
  trackingMode: "CLOSED_LOOP" | "CONSUMABLE";
  safeStock: number;
  defaultSupplierName?: string;
  remark?: string;
};

type ItemsPageProps = {
  user: import("../types").User | null;
};

export default function ItemsPage({ user }: ItemsPageProps) {
  const [form] = Form.useForm<ItemFormValues>();
  const [messageApi, contextHolder] = message.useMessage();
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");

  async function load(nextSearch = search) {
    const normalizedSearch = nextSearch.trim();
    const [itemsRes, categoriesRes, suppliersRes] = await Promise.all([
      api.get("/items", {
        params: normalizedSearch ? { search: normalizedSearch } : undefined,
      }),
      api.get("/categories"),
      api.get("/suppliers"),
    ]);
    setItems(itemsRes.data.data);
    setCategories(categoriesRes.data.data);
    setSuppliers(suppliersRes.data.data);
  }

  useEffect(() => {
    void load("");
  }, []);

  const supplierNameOptions = suppliers.map((supplier) => ({
    value: supplier.name,
    label: supplier.channel ? `${supplier.name} / ${supplier.channel}` : supplier.name,
  }));

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

  return (
    <>
      {contextHolder}
      <h1 className="page-title">物品</h1>
      <div className="toolbar">
        <Input.Search
          allowClear
          placeholder="搜索编码、名称、规格、品牌"
          style={{ maxWidth: 360 }}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onSearch={(value) => void load(value)}
        />
        <Button onClick={() => void load()}>刷新</Button>
      </div>
      {canManageItems(user) && (
        <Card title="新增物品" style={{ marginBottom: 16 }}>
          <Form
            form={form}
            layout="vertical"
            initialValues={{ unit: "支", trackingMode: "CLOSED_LOOP", safeStock: 0 }}
            onFinish={submit}
          >
            <div className="form-row">
              <Form.Item label="编码" name="itemCode">
                <Input placeholder="留空自动生成" />
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
                  options={categories
                    .filter((category) => category.level === 2)
                    .map((category) => ({ value: category.id, label: category.name }))}
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
                  ]}
                />
              </Form.Item>
              <Form.Item label="安全库存" name="safeStock">
                <InputNumber min={0} style={{ width: "100%" }} />
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
                  value="系统会按最近一次采购入库价格自动更新"
                  readOnly
                  disabled
                />
              </Form.Item>
            </div>
            <Form.Item label="备注" name="remark">
              <Input.TextArea rows={3} />
            </Form.Item>
            <Button type="primary" htmlType="submit">
              新增物品
            </Button>
          </Form>
        </Card>
      )}
      <Table
        rowKey="id"
        dataSource={items}
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
            render: (_, row) =>
              row.trackingMode === "CLOSED_LOOP" ? <Tag color="green">闭环</Tag> : <Tag>消耗品</Tag>,
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
  );
}
