import {
  AppstoreOutlined,
  BarChartOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
  FileAddOutlined,
  FileSearchOutlined,
  InboxOutlined,
  KeyOutlined,
  LogoutOutlined,
  ScheduleOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Button, Form, Input, Layout, Menu, Modal, Spin, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { api, getErrorMessage } from "./api/client";
import {
  canAccessAnalytics,
  canAccessPurchaseRequests,
  canAccessStockMovements,
  canManageUsers,
  canManageItems,
  isCncSupervisor,
  isGeneralManager,
  isProcurementManager,
  isAdmin,
  roleLabel,
} from "./lib/roles";
import AnalyticsPage from "./pages/Analytics";
import DashboardPage from "./pages/Dashboard";
import InventoryPage from "./pages/Inventory";
import ItemsPage from "./pages/Items";
import LoginPage from "./pages/Login";
import PurchaseRequestsPage from "./pages/PurchaseRequests";
import StockMovementsPage from "./pages/StockMovements";
import ApprovalsPage from "./pages/Approvals";
import MyRecordsPage from "./pages/MyRecords";
import OperationLogsPage from "./pages/OperationLogs";
import StockCountsPage from "./pages/StockCounts";
import SuppliersPage from "./pages/Suppliers";
import UsersPage from "./pages/Users";
import type { User } from "./types";

type PageKey = "dashboard" | "inventory" | "items" | "stock" | "purchase" | "myRecords" | "analysis" | "users" | "suppliers" | "stockCounts" | "operationLogs" | "approvals";

const { Header, Sider, Content } = Layout;

type ChangePasswordForm = { currentPassword: string; newPassword: string; confirmPassword: string };

export default function App() {
  const [messageApi, contextHolder] = message.useMessage();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(Boolean(sessionStorage.getItem("token")));
  const [page, setPage] = useState<PageKey>("dashboard");
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [pwForm] = Form.useForm<ChangePasswordForm>();

  useEffect(() => {
    const token = sessionStorage.getItem("token");
    if (!token) {
      setLoadingUser(false);
      return;
    }

    api
      .get("/auth/me")
      .then((res) => setUser(res.data.user))
      .catch(() => {
        sessionStorage.removeItem("token");
        setUser(null);
      })
      .finally(() => setLoadingUser(false));
  }, []);

  const pageNode = useMemo(() => {
    switch (page) {
      case "inventory":
        return <InventoryPage user={user} />;
      case "items":
        return <ItemsPage user={user} />;
      case "stock":
        return <StockMovementsPage user={user} />;
      case "purchase":
        return <PurchaseRequestsPage user={user} />;
      case "myRecords":
        return <MyRecordsPage user={user} />;
      case "approvals":
        return <ApprovalsPage />;
      case "analysis":
        return <AnalyticsPage user={user} />;
      case "users":
        return <UsersPage user={user} />;
      case "suppliers":
        return <SuppliersPage />;
      case "stockCounts":
        return <StockCountsPage user={user} />;
      case "operationLogs":
        return <OperationLogsPage />;
      default:
        return <DashboardPage user={user} />;
    }
  }, [page, user]);

  if (loadingUser) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        {contextHolder}
        <LoginPage
          onLogin={(nextUser) => {
            setUser(nextUser);
            messageApi.success("登录成功");
          }}
          onError={(error) => messageApi.error(getErrorMessage(error))}
        />
      </>
    );
  }

  async function changePassword(values: ChangePasswordForm) {
    if (values.newPassword !== values.confirmPassword) {
      messageApi.error("两次输入的新密码不一致");
      return;
    }
    setPwSubmitting(true);
    try {
      await api.patch("/auth/password", {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      messageApi.success("密码已修改，请重新登录");
      setPwModalOpen(false);
      pwForm.resetFields();
      sessionStorage.removeItem("token");
      setUser(null);
      setPage("dashboard");
    } catch (error) {
      messageApi.error(getErrorMessage(error));
    } finally {
      setPwSubmitting(false);
    }
  }

  const menuItems = [
    { key: "dashboard", icon: <AppstoreOutlined />, label: "Dashboard" },
    { key: "inventory", icon: <DatabaseOutlined />, label: "库存" },
    ...(canManageItems(user) ? [{ key: "items", icon: <InboxOutlined />, label: "物品" }] : []),
    ...(canAccessStockMovements(user) ? [{ key: "stock", icon: <FileAddOutlined />, label: "出入库" }] : []),
    ...(canAccessPurchaseRequests(user) ? [{ key: "purchase", icon: <ShoppingCartOutlined />, label: "采购" }] : []),
    ...(isCncSupervisor(user) ? [{ key: "myRecords", icon: <ScheduleOutlined />, label: "我的记录" }] : []),
    ...(canAccessAnalytics(user) ? [{ key: "analysis", icon: <BarChartOutlined />, label: "统计分析" }] : []),
    ...(canManageUsers(user) ? [{ key: "users", icon: <TeamOutlined />, label: "用户管理" }] : []),
    ...((isProcurementManager(user) || isAdmin(user)) ? [{ key: "suppliers", icon: <ShopOutlined />, label: "供应商" }] : []),
    ...((isProcurementManager(user) || isCncSupervisor(user)) ? [{ key: "stockCounts", icon: <FileSearchOutlined />, label: "库存盘点" }] : []),
    ...((isProcurementManager(user) || isAdmin(user)) ? [{ key: "operationLogs", icon: <AuditOutlined />, label: "操作日志" }] : []),
    ...((isGeneralManager(user) || isAdmin(user)) ? [{ key: "approvals", icon: <CheckCircleOutlined />, label: "审批管理" }] : []),
  ];

  return (
    <>
      <Layout className="app-layout">
        {contextHolder}
        <Sider breakpoint="lg" collapsedWidth="0" theme="light">
          <div style={{ padding: 20, fontWeight: 700, color: "#143b2d" }}>Mills Inventory</div>
          <Menu
            mode="inline"
            selectedKeys={[page]}
            onClick={({ key }) => setPage(key as PageKey)}
            items={menuItems}
          />
        </Sider>
        <Layout>
          <Header className="app-header">
            <div className="app-title">刀具及杂项库存与采购管理系统</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Button icon={<KeyOutlined />} onClick={() => setPwModalOpen(true)}>
                修改密码
              </Button>
              <Button
                icon={<LogoutOutlined />}
                onClick={() => {
                  sessionStorage.removeItem("token");
                  setUser(null);
                  setPage("dashboard");
                }}
              >
                {`${user.realName} · ${roleLabel(user.role)}`}
              </Button>
            </div>
          </Header>
          <Content className="app-content">{pageNode}</Content>
        </Layout>
      </Layout>
      <Modal
        title="修改密码"
        open={pwModalOpen}
        onCancel={() => {
          setPwModalOpen(false);
          pwForm.resetFields();
        }}
        onOk={() => void pwForm.submit()}
        okText="确认修改"
        confirmLoading={pwSubmitting}
        destroyOnClose
      >
        <Form form={pwForm} layout="vertical" onFinish={changePassword} style={{ marginTop: 16 }}>
          <Form.Item label="当前密码" name="currentPassword" rules={[{ required: true, message: "请输入当前密码" }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item label="新密码" name="newPassword" rules={[{ required: true, message: "请输入新密码" }, { min: 6, message: "至少6位" }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item label="确认新密码" name="confirmPassword" rules={[{ required: true, message: "请再次输入新密码" }]}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
