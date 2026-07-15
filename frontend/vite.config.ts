import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const vitePort = Number(env.VITE_PORT || 5173);
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || "http://127.0.0.1:4000";

  return {
    // 统一门户下挂 /tools/ 子路径（Docker 构建时传 VITE_BASE=/tools/，本地开发默认 /）
    base: env.VITE_BASE || "/",
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: vitePort,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: "0.0.0.0",
      port: vitePort,
    },
  };
});
