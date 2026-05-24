import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { UserRole } from "../src/generated/prisma/enums.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const url = new URL(databaseUrl);
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    connectionLimit: 5,
    allowPublicKeyRetrieval: true,
  }),
});

async function upsertRootCategory(name: string, sortOrder: number) {
  const existing = await prisma.category.findFirst({
    where: {
      name,
      parentId: null,
    },
  });

  if (existing) {
    return prisma.category.update({
      where: { id: existing.id },
      data: {
        status: 1,
        sortOrder,
      },
    });
  }

  return prisma.category.create({
    data: {
      name,
      level: 1,
      sortOrder,
    },
  });
}

async function upsertChildCategory(parentId: bigint, name: string, sortOrder: number) {
  return prisma.category.upsert({
    where: { parentId_name: { parentId, name } },
    create: {
      name,
      parentId,
      level: 2,
      sortOrder,
    },
    update: {
      status: 1,
      sortOrder,
    },
  });
}

type BootstrapUserConfig = {
  usernameEnv: string;
  passwordEnv: string;
  realNameEnv: string;
  defaultRealName: string;
  role: UserRole;
};

async function ensureBootstrapUser(config: BootstrapUserConfig) {
  const username = process.env[config.usernameEnv]?.trim();
  const password = process.env[config.passwordEnv]?.trim();
  const realName = process.env[config.realNameEnv]?.trim() || config.defaultRealName;

  if (!username && !password) {
    return null;
  }

  if (!username || !password) {
    throw new Error(`${config.usernameEnv} and ${config.passwordEnv} must be provided together.`);
  }

  const passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_SALT_ROUNDS || 10));

  return prisma.user.upsert({
    where: { username },
    create: {
      username,
      passwordHash,
      realName,
      role: config.role,
      status: 1,
    },
    update: {
      passwordHash,
      realName,
      role: config.role,
      status: 1,
    },
  });
}

async function ensureBootstrapUsers() {
  const users = await Promise.all([
    ensureBootstrapUser({
      usernameEnv: "INITIAL_ADMIN_USERNAME",
      passwordEnv: "INITIAL_ADMIN_PASSWORD",
      realNameEnv: "INITIAL_ADMIN_REAL_NAME",
      defaultRealName: "系统管理员",
      role: UserRole.ADMIN,
    }),
  ]);

  return users.filter((user) => user !== null);
}

async function main() {
  await prisma.warehouse.upsert({
    where: { id: BigInt(1) },
    create: {
      id: BigInt(1),
      name: "默认仓库",
      status: 1,
    },
    update: {
      name: "默认仓库",
      status: 1,
    },
  });

  const toolCategory = await upsertRootCategory("刀具", 10);
  const miscCategory = await upsertRootCategory("杂项", 20);

  const toolSubcategories = [
    "铣刀",
    "球刀",
    "圆鼻刀",
    "倒角刀",
    "钻头",
    "中心钻",
    "定点钻",
    "铰刀",
    "丝攻",
    "板牙",
    "螺纹铣刀",
    "锪钻",
    "镗刀",
    "T型刀",
    "燕尾刀",
    "键槽刀",
    "刀片",
    "刀盘",
    "刀杆",
    "刀柄",
    "夹头",
    "拉钉",
    "寻边器",
    "测头",
  ] as const;

  const miscSubcategories = ["辅料", "量具", "治具", "夹具配件", "清洁保养", "紧固件"] as const;

  const toolCategoryMap = new Map<string, Awaited<ReturnType<typeof upsertChildCategory>>>();
  for (const [index, name] of toolSubcategories.entries()) {
    const category = await upsertChildCategory(toolCategory.id, name, (index + 1) * 10);
    toolCategoryMap.set(name, category);
  }

  for (const [index, name] of miscSubcategories.entries()) {
    await upsertChildCategory(miscCategory.id, name, (index + 1) * 10);
  }

  const bootstrapUsers = await ensureBootstrapUsers();

  if (bootstrapUsers.length > 0) {
    console.log(`Seed completed. Bootstrap users are ready: ${bootstrapUsers.map((user) => user.username).join(", ")}`);
    return;
  }

  console.warn(
    "Seed completed without bootstrap users. Provide INITIAL_ADMIN_USERNAME / INITIAL_ADMIN_PASSWORD if you want an initial admin account.",
  );
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
