import { defineConfig } from "@playwright/test";

const e2eEnv = {
  DATABASE_URL: "mysql://tooling_user:tooling_password@127.0.0.1:3306/tooling_inventory_e2e_test",
  E2E_DATABASE_NAME: "tooling_inventory_e2e_test",
  E2E_DB_ROOT_USER: "root",
  E2E_DB_ROOT_PASSWORD: "root_password",
  E2E_DB_ROOT_HOST: "127.0.0.1",
  E2E_DB_ROOT_PORT: "3306",
  JWT_SECRET: "e2e-test-super-secret-1234567890",
  BCRYPT_SALT_ROUNDS: "4",
  HOST: "127.0.0.1",
  PORT: "4100",
  CORS_ORIGIN: "http://127.0.0.1:4173",
  VITE_PORT: "4173",
  VITE_API_PROXY_TARGET: "http://127.0.0.1:4100",
  INITIAL_ADMIN_USERNAME: "admin_e2e",
  INITIAL_ADMIN_PASSWORD: "AdminE2E#123",
  INITIAL_ADMIN_REAL_NAME: "E2E管理员",
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    channel: "chrome",
    viewport: { width: 1440, height: 1200 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "./scripts/run-e2e-stack.sh",
      cwd: "/Users/zhiwenzhu/Desktop/瑞宏/Mills-inventory-Sys",
      env: {
        ...process.env,
        ...e2eEnv,
      },
      url: "http://127.0.0.1:4173",
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
