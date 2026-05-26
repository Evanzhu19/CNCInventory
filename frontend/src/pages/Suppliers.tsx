import { Button, Form, Input, Modal, Popconfirm, Table, message } from "antd";
import { useEffect, useState } from "react";
import { api, getErrorMessage } from "../api/client";
import type { Supplier } from "../types";

type SupplierFormValues = {
  name: string;
  channel?: string;
  contactPerson?: string;
  phone?: string;
  remark?: string;
};

export default function SuppliersPage() {
  const [messageApi, contextHolder] = message.useMessage();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<SupplierFormValues>();

  async function load() {
    try {
      const res = await api.get("/suppliers");
      setSuppliers(res.data.data);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openAdd() {
    setEditingId(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(row: Supplier) {
    setEditingId(row.id);
    form.setFieldsValue({
      name: row.name,
      channel: row.channel ?? undefined,
      contactPerson: row.contactPerson ?? undefined,
      phone: row.phone ?? undefined,
      remark: row.remark ?? undefined,
    });
    setModalOpen(true);
  }

  async function submit(values: SupplierFormValues) {
    setSubmitting(true);
    try {
      if (editingId) {
        await api.patch(`/suppliers/${editingId}`, values);
        messageApi.success("供应商已更新");
      } else {
        await api.post("/suppliers", values);
        messageApi.success("供应商已添加");
      }
      setModalOpen(false);
      form.resetFields();
      await load();
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteSupplier(id: string) {
    try {
      await api.delete(`/suppliers/${id}`);
      messageApi.success("供应商已删除");
      await load();
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  return (
    <>
      {contextHolder}
      <h1 className="page-title">供应商管理</h1>
      <div className="toolbar">
        <Button type="primary" onClick={openAdd}>
          新增供应商
        </Button>
        <Button onClick={() => void load()}>刷新</Button>
      </div>

      <Table
        rowKey="id"
        dataSource={suppliers}
        columns={[
          { title: "名称", dataIndex: "name" },
          { title: "采购渠道", dataIndex: "channel", render: (v?: string | null) => v ?? "-" },
          { title: "联系人", dataIndex: "contactPerson", render: (v?: string | null) => v ?? "-" },
          { title: "联系电话", dataIndex: "phone", render: (v?: string | null) => v ?? "-" },
          { title: "备注", dataIndex: "remark", render: (v?: string | null) => v ?? "-" },
          {
            title: "操作",
            width: 140,
            render: (_: unknown, row: Supplier) => (
              <div style={{ display: "flex", gap: 8 }}>
                <Button size="small" onClick={() => openEdit(row)}>
                  编辑
                </Button>
                <Popconfirm
                  title="确认删除"
                  description="被物品引用的供应商无法删除"
                  okText="删除"
                  okButtonProps={{ danger: true }}
                  cancelText="取消"
                  onConfirm={() => void deleteSupplier(row.id)}
                >
                  <Button size="small" danger>
                    删除
                  </Button>
                </Popconfirm>
              </div>
            ),
          },
        ]}
      />

      <Modal
        title={editingId ? "编辑供应商" : "新增供应商"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        onOk={() => void form.submit()}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submit} style={{ marginTop: 16 }}>
          <Form.Item label="名称" name="name" rules={[{ required: true, message: "请输入供应商名称" }]}>
            <Input />
          </Form.Item>
          <Form.Item label="采购渠道" name="channel">
            <Input placeholder="例如：官网、代理商" />
          </Form.Item>
          <Form.Item label="联系人" name="contactPerson">
            <Input />
          </Form.Item>
          <Form.Item label="联系电话" name="phone">
            <Input />
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
