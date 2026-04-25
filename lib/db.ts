import mysql from "mysql2/promise";
import { getConfigValue } from "@/lib/runtime-config";

type DatabaseConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  timeZone: string;
};

let pool: mysql.Pool | null = null;

function getDatabaseConfig(): DatabaseConfig {
  const host = getConfigValue("MYSQL_HOST");
  const portRaw = getConfigValue("MYSQL_PORT");
  const user = getConfigValue("MYSQL_USER");
  const password = getConfigValue("MYSQL_PASSWORD");
  const database = getConfigValue("MYSQL_DATABASE");
  const timeZone = getConfigValue("MYSQL_TIMEZONE")?.trim() || "+08:00";

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
    timeZone,
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

  pool.pool.on("connection", (connection) => {
    // 统一 MySQL 会话时区，确保 NOW()/CURRENT_TIMESTAMP 与日志展示一致。
    connection.query("SET time_zone = ?", [config.timeZone], () => {
      // 忽略设置失败，保持由数据库默认时区兜底。
    });
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
