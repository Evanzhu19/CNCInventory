import {
  AppstoreOutlined,
  BarChartOutlined,
  DatabaseOutlined,
  FileAddOutlined,
  InboxOutlined,
  LogoutOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Button, Layout, Menu, Spin, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { api, getErrorMessage } from "./api/client";
import {
  canAccessAnalytics,
  canAccessPurchaseRequests,
  canAccessStockMovements,
  canManageUsers,
  canManageItems,
  roleLabel,
} from "./lib/roles";
import AnalyticsPage from "./pages/Analytics";
import DashboardPage from "./pages/Dashboard";
import InventoryPage from "./pages/Inventory";
import ItemsPage from "./pages/Items";
import LoginPage from "./pages/Login";
import PurchaseRequestsPage from "./pages/PurchaseRequests";
import StockMovementsPage from "./pages/StockMovements";
import UsersPage from "./pages/Users";
import type { User } from "./types";

type PageKey = "dashboard" | "inventory" | "items" | "stock" | "purchase" | "analysis" | "users";

const { Header, Sider, Content } = Layout;

export default function App() {
  const [messageApi, contextHolder] = message.useMessage();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(Boolean(localStorage.getItem("token")));
  const [page, setPage] = useState<PageKey>("dashboard");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoadingUser(false);
      return;
    }

    api
      .get("/auth/me")
      .then((res) => setUser(res.data.user))
      .catch(() => {
        localStorage.removeItem("token");
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
      case "analysis":
        return <AnalyticsPage user={user} />;
      case "users":
        return <UsersPage user={user} />;
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

  const menuItems = [
    { key: "dashboard", icon: <AppstoreOutlined />, label: "Dashboard" },
    { key: "inventory", icon: <DatabaseOutlined />, label: "库存" },
    ...(canManageItems(user) ? [{ key: "items", icon: <InboxOutlined />, label: "物品" }] : []),
    ...(canAccessStockMovements(user) ? [{ key: "stock", icon: <FileAddOutlined />, label: "出入库" }] : []),
    ...(canAccessPurchaseRequests(user) ? [{ key: "purchase", icon: <ShoppingCartOutlined />, label: "采购" }] : []),
    ...(canAccessAnalytics(user) ? [{ key: "analysis", icon: <BarChartOutlined />, label: "统计分析" }] : []),
    ...(canManageUsers(user) ? [{ key: "users", icon: <TeamOutlined />, label: "用户管理" }] : []),
  ];

  return (
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
          <Button
            icon={<LogoutOutlined />}
            onClick={() => {
              localStorage.removeItem("token");
              setUser(null);
            }}
          >
            {`${user.realName} · ${roleLabel(user.role)}`}
          </Button>
        </Header>
        <Content className="app-content">{pageNode}</Content>
      </Layout>
    </Layout>
  );
}
