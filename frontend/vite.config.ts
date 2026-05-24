import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const vitePort = Number(env.VITE_PORT || 5173);
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || "http://127.0.0.1:4000";

  return {
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
