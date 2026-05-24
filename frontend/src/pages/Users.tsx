import { Button, Form, Input, Modal, Select, Table, Tag, message } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { api, getErrorMessage } from "../api/client";
import { isAdmin, roleLabel } from "../lib/roles";
import type { ManagedUser, User } from "../types";

type UsersPageProps = {
  user: User | null;
};

type UserFormValues = {
  username: string;
  password?: string;
  realName: string;
  role: User["role"];
  status: number;
};

const statusColor = {
  1: "green",
  0: "red",
} as const;

type RoleOption = {
  value: User["role"];
  label: string;
};

export default function UsersPage({ user }: UsersPageProps) {
  const [createForm] = Form.useForm<UserFormValues>();
  const [editForm] = Form.useForm<UserFormValues>();
  const [messageApi, contextHolder] = message.useMessage();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);

  const roleOptions = useMemo<RoleOption[]>(() => {
    if (isAdmin(user)) {
      return (["ADMIN", "PROCUREMENT_MANAGER", "GENERAL_MANAGER", "CNC_SUPERVISOR"] as const).map((role) => ({
        value: role,
        label: roleLabel(role),
      }));
    }

    return [{ value: "CNC_SUPERVISOR", label: roleLabel("CNC_SUPERVISOR") }];
  }, [user]);

  async function load() {
    try {
      const res = await api.get("/users");
      setUsers(res.data.data);
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createUser(values: UserFormValues) {
    try {
      await api.post("/users", values);
      messageApi.success("用户已创建");
      createForm.resetFields();
      createForm.setFieldsValue({
        role: roleOptions[0]?.value,
        status: 1,
      });
      await load();
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  function openEdit(userRow: ManagedUser) {
    setEditingUser(userRow);
    editForm.setFieldsValue({
      username: userRow.username,
      realName: userRow.realName,
      role: userRow.role,
      status: userRow.status,
      password: undefined,
    });
  }

  async function updateUser(values: UserFormValues) {
    if (!editingUser) {
      return;
    }

    try {
      await api.patch(`/users/${editingUser.id}`, {
        username: values.username,
        realName: values.realName,
        role: values.role,
        status: values.status,
        ...(values.password ? { password: values.password } : {}),
      });
      messageApi.success("用户已更新");
      setEditingUser(null);
      await load();
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    }
  }

  return (
    <>
      {contextHolder}
      <h1 className="page-title">用户管理</h1>
      <Form
        form={createForm}
        layout="vertical"
        initialValues={{ role: roleOptions[0]?.value, status: 1 }}
        onFinish={createUser}
      >
        <div className="form-row">
          <Form.Item label="用户名" name="username" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[
              { required: true, message: "请输入密码" },
              { min: 8, message: "密码至少 8 位" },
            ]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item label="姓名" name="realName" rules={[{ required: true, message: "请输入姓名" }]}>
            <Input />
          </Form.Item>
          <Form.Item label="角色" name="role" rules={[{ required: true, message: "请选择角色" }]}>
            <Select options={roleOptions} />
          </Form.Item>
          <Form.Item label="状态" name="status" rules={[{ required: true, message: "请选择状态" }]}>
            <Select
              options={[
                { value: 1, label: "启用" },
                { value: 0, label: "停用" },
              ]}
            />
          </Form.Item>
        </div>
        <Button type="primary" htmlType="submit">
          新增用户
        </Button>
      </Form>

      <Table
        style={{ marginTop: 16 }}
        rowKey="id"
        dataSource={users}
        columns={[
          { title: "用户名", dataIndex: "username" },
          { title: "姓名", dataIndex: "realName" },
          { title: "角色", render: (_: unknown, row: ManagedUser) => roleLabel(row.role) },
          {
            title: "状态",
            render: (_: unknown, row: ManagedUser) => (
              <Tag color={statusColor[row.status as 0 | 1] ?? "default"}>
                {row.status === 1 ? "启用" : "停用"}
              </Tag>
            ),
          },
          {
            title: "创建时间",
            render: (_: unknown, row: ManagedUser) => dayjs(row.createdAt).format("YYYY-MM-DD HH:mm"),
          },
          {
            title: "操作",
            render: (_: unknown, row: ManagedUser) => (
              <Button size="small" onClick={() => openEdit(row)}>
                编辑
              </Button>
            ),
          },
        ]}
      />

      <Modal
        open={Boolean(editingUser)}
        title={editingUser ? `编辑用户 · ${editingUser.username}` : "编辑用户"}
        onCancel={() => setEditingUser(null)}
        onOk={() => void editForm.submit()}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={updateUser}>
          <Form.Item label="用户名" name="username" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input />
          </Form.Item>
          <Form.Item label="姓名" name="realName" rules={[{ required: true, message: "请输入姓名" }]}>
            <Input />
          </Form.Item>
          <Form.Item label="角色" name="role" rules={[{ required: true, message: "请选择角色" }]}>
            <Select options={roleOptions} />
          </Form.Item>
          <Form.Item label="状态" name="status" rules={[{ required: true, message: "请选择状态" }]}>
            <Select
              options={[
                { value: 1, label: "启用" },
                { value: 0, label: "停用" },
              ]}
            />
          </Form.Item>
          <Form.Item
            label="重置密码"
            name="password"
            extra="留空表示不修改密码"
            rules={[{ min: 8, message: "密码至少 8 位" }]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
