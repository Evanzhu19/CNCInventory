import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Form, Input, Spin } from "antd";
import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { User } from "../types";

type LoginPageProps = {
  onLogin: (user: User) => void;
  onError: (error: unknown) => void;
};

export default function LoginPage({ onLogin, onError }: LoginPageProps) {
  // 统一登录：同一域名下 ERP 的 token 存在 localStorage('token')，
  // 有就先试 SSO 免登录；失败静默回退到本系统账号密码。
  const [ssoTrying, setSsoTrying] = useState(() => Boolean(localStorage.getItem("token")));
  const ssoAttempted = useRef(false);

  useEffect(() => {
    const erpToken = localStorage.getItem("token");
    if (!erpToken || ssoAttempted.current) {
      setSsoTrying(false);
      return;
    }
    ssoAttempted.current = true;
    (async () => {
      try {
        const res = await api.post("/auth/sso", { erpToken });
        sessionStorage.setItem("token", res.data.token);
        onLogin(res.data.user);
      } catch {
        setSsoTrying(false); // ERP token 无效/角色未开通，走正常登录
      }
    })();
  }, [onLogin]);

  return (
    <div className="login-page">
      <div className="login-panel">
        <h1 className="brand-title">库存管理</h1>
        <p className="brand-subtitle">刀具流转、低库存提醒、采购申请</p>
        {ssoTrying ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <Spin />
            <p style={{ marginTop: 12, color: "#888" }}>正在用 ERP 账号自动登录…</p>
          </div>
        ) : (
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
        )}
      </div>
      <div className="login-visual" />
    </div>
  );
}
