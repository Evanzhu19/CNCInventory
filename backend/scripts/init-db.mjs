import { spawn } from "node:child_process";
import process from "node:process";
import * as mariadb from "mariadb";

const databaseUrl = process.env.DATABASE_URL;
const shouldSkipSeed = process.env.SKIP_SEED === "1";

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const url = new URL(databaseUrl);
const database = url.pathname.replace(/^\//, "");
const connectionConfig = {
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database,
  connectTimeout: 5000,
  allowPublicKeyRetrieval: true,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
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
      connection = await mariadb.createConnection(connectionConfig);
      await connection.ping();
      await connection.end();
      console.log(`Database is reachable after ${attempt} attempt(s).`);
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

async function inspectDatabase() {
  const connection = await mariadb.createConnection(connectionConfig);

  try {
    const tableRows = await connection.query(
      `
        SELECT TABLE_NAME AS tableName
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
      `,
      [database],
    );

    const tableNames = tableRows.map((row) => row.tableName);
    const hasMigrationsTable = tableNames.includes("_prisma_migrations");
    const hasApplicationTables = tableNames.some((tableName) => tableName !== "_prisma_migrations");
    let failedMigrations = [];

    if (hasMigrationsTable) {
      failedMigrations = await connection.query(
        `
          SELECT migration_name AS migrationName
          FROM _prisma_migrations
          WHERE finished_at IS NULL
            AND rolled_back_at IS NULL
        `,
      );
    }

    return {
      hasMigrationsTable,
      hasApplicationTables,
      failedMigrations: failedMigrations.map((row) => row.migrationName),
    };
  } finally {
    await connection.end();
  }
}

async function markFailedMigrationsRolledBack(migrationNames) {
  if (migrationNames.length === 0) {
    return;
  }

  const connection = await mariadb.createConnection(connectionConfig);

  try {
    for (const migrationName of migrationNames) {
      await connection.query(
        `
          UPDATE _prisma_migrations
          SET rolled_back_at = NOW(3)
          WHERE migration_name = ?
            AND finished_at IS NULL
            AND rolled_back_at IS NULL
        `,
        [migrationName],
      );
    }
  } finally {
    await connection.end();
  }
}

async function main() {
  await waitForDatabase();

  const { hasMigrationsTable, hasApplicationTables, failedMigrations } = await inspectDatabase();

  if (hasApplicationTables && failedMigrations.length > 0) {
    console.log(`Found failed migrations on an existing database: ${failedMigrations.join(", ")}. Marking them as rolled back for compatibility.`);
    await markFailedMigrationsRolledBack(failedMigrations);
  }

  if (!hasMigrationsTable && hasApplicationTables) {
    console.log("Detected existing tables without Prisma migration history. Running prisma db push for compatibility.");
    await runCommand("npx", ["prisma", "db", "push", "--accept-data-loss"]);
  } else {
    const modeLabel = hasMigrationsTable ? "Detected Prisma migration history. Running migrate deploy." : "Detected empty database. Applying initial migrations.";
    console.log(modeLabel);

    try {
      await runCommand("npx", ["prisma", "migrate", "deploy"]);
    } catch (error) {
      if (!hasApplicationTables) {
        throw error;
      }

      console.log("migrate deploy failed on an existing database. Falling back to prisma db push for compatibility.");
      await runCommand("npx", ["prisma", "db", "push", "--accept-data-loss"]);
    }
  }

  if (shouldSkipSeed) {
    console.log("SKIP_SEED=1 detected. Skipping seed.");
    return;
  }

  console.log("Running seed.");
  await runCommand("npm", ["run", "db:seed"]);
}

main().catch((error) => {
  console.error("Database initialization failed.");
  console.error(error);
  process.exit(1);
});
