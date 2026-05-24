import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "../env.js";

function createMariaDbAdapter() {
  const url = new URL(env.DATABASE_URL);

  return new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    connectionLimit: 10,
    allowPublicKeyRetrieval: true,
  });
}

export const prisma = new PrismaClient({
  adapter: createMariaDbAdapter(),
});
