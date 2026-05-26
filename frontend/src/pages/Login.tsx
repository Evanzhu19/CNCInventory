import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Form, Input } from "antd";
import { api } from "../api/client";
import type { User } from "../types";

type LoginPageProps = {
  onLogin: (user: User) => void;
  onError: (error: unknown) => void;
};

export default function LoginPage({ onLogin, onError }: LoginPageProps) {
  return (
    <div className="login-page">
      <div className="login-panel">
        <h1 className="brand-title">库存管理</h1>
        <p className="brand-subtitle">刀具流转、低库存提醒、采购申请</p>
        <Form
          layout="vertical"
          autoComplete="off"
          onFinish={async (values) => {
            try {
              const res = await api.post("/auth/login", values);
              sessionStorage.setItem("token", res.data.token);
              onLogin(res.data.user);
            } catch (error) {
              onError(error);
            }
          }}
        >
          <Form.Item label="用户名" name="username" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input prefix={<UserOutlined />} autoComplete="off" />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password prefix={<LockOutlined />} autoComplete="off" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            登录
          </Button>
        </Form>
      </div>
      <div className="login-visual" />
    </div>
  );
}
