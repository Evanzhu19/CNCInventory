import { spawn } from "node:child_process";
import process from "node:process";
import * as mariadb from "mariadb";

const databaseUrl = process.env.DATABASE_URL;
const rootUser = process.env.E2E_DB_ROOT_USER || "root";
const rootPassword = process.env.E2E_DB_ROOT_PASSWORD || "root_password";
const rootHost = process.env.E2E_DB_ROOT_HOST || "127.0.0.1";
const rootPort = Number(process.env.E2E_DB_ROOT_PORT || 3306);

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const url = new URL(databaseUrl);
const database = process.env.E2E_DATABASE_NAME || url.pathname.replace(/^\//, "");
const appUser = decodeURIComponent(url.username);
const appPassword = decodeURIComponent(url.password);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
      cwd: process.cwd(),
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`));
    });

    child.on("error", reject);
  });
}

async function waitForDatabase(maxAttempts = 60, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let connection;

    try {
      connection = await mariadb.createConnection({
        host: rootHost,
        port: rootPort,
        user: rootUser,
        password: rootPassword,
        connectTimeout: 5000,
        allowPublicKeyRetrieval: true,
      });
      await connection.ping();
      await connection.end();
      console.log(`E2E database is reachable after ${attempt} attempt(s).`);
      return;
    } catch (error) {
      if (connection) {
        await connection.end().catch(() => undefined);
      }

      if (attempt === maxAttempts) {
        throw error;
      }

      console.log(`Waiting for database (${attempt}/${maxAttempts})...`);
      await sleep(delayMs);
    }
  }
}

async function recreateDatabase() {
  const connection = await mariadb.createConnection({
    host: rootHost,
    port: rootPort,
    user: rootUser,
    password: rootPassword,
    connectTimeout: 5000,
    multipleStatements: true,
    allowPublicKeyRetrieval: true,
  });

  try {
    await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await connection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.query(`CREATE USER IF NOT EXISTS '${appUser}'@'%' IDENTIFIED BY ?`, [appPassword]);
    await connection.query(`CREATE USER IF NOT EXISTS '${appUser}'@'localhost' IDENTIFIED BY ?`, [appPassword]);
    await connection.query(`ALTER USER '${appUser}'@'%' IDENTIFIED BY ?`, [appPassword]);
    await connection.query(`ALTER USER '${appUser}'@'localhost' IDENTIFIED BY ?`, [appPassword]);
    await connection.query(`GRANT ALL PRIVILEGES ON \`${database}\`.* TO '${appUser}'@'%'`);
    await connection.query(`GRANT ALL PRIVILEGES ON \`${database}\`.* TO '${appUser}'@'localhost'`);
    await connection.query("FLUSH PRIVILEGES");
  } finally {
    await connection.end();
  }
}

async function main() {
  await waitForDatabase();
  await recreateDatabase();
  await runCommand("npx", ["prisma", "generate"]);
  await runCommand("npx", ["prisma", "migrate", "deploy"]);
  await runCommand("npm", ["run", "db:seed"]);
}

main().catch((error) => {
  console.error("E2E database preparation failed.");
  console.error(error);
  process.exit(1);
});
