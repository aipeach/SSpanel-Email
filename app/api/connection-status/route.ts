import type { RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { queryRows } from "@/lib/db";
import { getQueueDb } from "@/lib/queue-sqlite";
import { getConfigSource, getConfigValue } from "@/lib/runtime-config";

type Status = "ok" | "error";

type ServiceStatus = {
  status: Status;
  latencyMs: number;
  message: string;
  details: Record<string, unknown>;
};

function toPlainValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  return value;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "未知错误";
}

async function checkMySqlStatus(): Promise<ServiceStatus> {
  const start = Date.now();

  try {
    const rows = await queryRows<
      {
        session_time_zone: string;
        global_time_zone: string;
        system_time_zone: string;
        now_local: Date | string;
        now_utc: Date | string;
        connection_id: number;
      } & RowDataPacket
    >(
      `
        SELECT
          @@session.time_zone AS session_time_zone,
          @@global.time_zone AS global_time_zone,
          @@system_time_zone AS system_time_zone,
          NOW() AS now_local,
          UTC_TIMESTAMP() AS now_utc,
          CONNECTION_ID() AS connection_id
      `,
    );

    const row = rows[0];

    return {
      status: "ok",
      latencyMs: Date.now() - start,
      message: "连接正常",
      details: {
        host: getConfigValue("MYSQL_HOST") || null,
        port: Number(getConfigValue("MYSQL_PORT") || "3306"),
        database: getConfigValue("MYSQL_DATABASE") || null,
        configuredTimeZone: getConfigValue("MYSQL_TIMEZONE")?.trim() || "+08:00",
        hostSource: getConfigSource("MYSQL_HOST"),
        databaseSource: getConfigSource("MYSQL_DATABASE"),
        configuredTimeZoneSource: getConfigSource("MYSQL_TIMEZONE"),
        sessionTimeZone: row?.session_time_zone || null,
        globalTimeZone: row?.global_time_zone || null,
        systemTimeZone: row?.system_time_zone || null,
        nowLocal: toPlainValue(row?.now_local),
        nowUtc: toPlainValue(row?.now_utc),
        connectionId: toPlainValue(row?.connection_id),
      },
    };
  } catch (error) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      message: getErrorMessage(error),
      details: {
        host: getConfigValue("MYSQL_HOST") || null,
        port: Number(getConfigValue("MYSQL_PORT") || "3306"),
        database: getConfigValue("MYSQL_DATABASE") || null,
        configuredTimeZone: getConfigValue("MYSQL_TIMEZONE")?.trim() || "+08:00",
        hostSource: getConfigSource("MYSQL_HOST"),
        databaseSource: getConfigSource("MYSQL_DATABASE"),
        configuredTimeZoneSource: getConfigSource("MYSQL_TIMEZONE"),
      },
    };
  }
}

function checkSqliteStatus(): ServiceStatus {
  const start = Date.now();

  try {
    const db = getQueueDb();
    const row = db
      .prepare(
        `
          SELECT
            sqlite_version() AS sqlite_version,
            datetime('now') AS now_utc,
            datetime('now', 'localtime') AS now_local
        `,
      )
      .get() as
      | {
          sqlite_version: string;
          now_utc: string;
          now_local: string;
        }
      | undefined;

    return {
      status: "ok",
      latencyMs: Date.now() - start,
      message: "连接正常",
      details: {
        queueDbPath: getConfigValue("QUEUE_SQLITE_PATH")?.trim() || "./data/email-queue.sqlite",
        queueDbPathSource: getConfigSource("QUEUE_SQLITE_PATH"),
        sqliteVersion: row?.sqlite_version || null,
        nowUtc: row?.now_utc || null,
        nowLocal: row?.now_local || null,
      },
    };
  } catch (error) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      message: getErrorMessage(error),
      details: {
        queueDbPath: getConfigValue("QUEUE_SQLITE_PATH")?.trim() || "./data/email-queue.sqlite",
        queueDbPathSource: getConfigSource("QUEUE_SQLITE_PATH"),
      },
    };
  }
}

export async function GET() {
  const [mysql, sqlite] = await Promise.all([checkMySqlStatus(), Promise.resolve(checkSqliteStatus())]);

  return NextResponse.json({
    ok: mysql.status === "ok" && sqlite.status === "ok",
    checkedAt: new Date().toISOString(),
    process: {
      nodeVersion: process.version,
      envTZ: process.env.TZ || null,
      resolvedTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      now: new Date().toISOString(),
    },
    mysql,
    sqlite,
  });
}
