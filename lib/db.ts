import mysql from "mysql2/promise";

type DatabaseConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

let pool: mysql.Pool | null = null;

function getDatabaseConfig(): DatabaseConfig {
  const host = process.env.MYSQL_HOST;
  const portRaw = process.env.MYSQL_PORT;
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD;
  const database = process.env.MYSQL_DATABASE;

  if (!host || !user || !database) {
    throw new Error("MySQL 配置不完整，请检查 MYSQL_HOST/MYSQL_USER/MYSQL_DATABASE");
  }

  const port = Number(portRaw || "3306");

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("MYSQL_PORT 配置无效");
  }

  return {
    host,
    port,
    user,
    password: password || "",
    database,
  };
}

export function getPool() {
  if (pool) {
    return pool;
  }

  const config = getDatabaseConfig();
  pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60_000,
    queueLimit: 0,
    charset: "utf8mb4",
  });

  return pool;
}

export async function queryRows<T>(sql: string, params: unknown[] = []) {
  const db = getPool();
  const [rows] = await db.query(sql, params as any[]);
  return rows as T[];
}

export async function execute(sql: string, params: unknown[] = []) {
  const db = getPool();
  await db.execute(sql, params as any[]);
}
