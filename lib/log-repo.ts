import type { RowDataPacket } from "mysql2/promise";
import { getPool, queryRows } from "@/lib/db";
import { ensureCampaignSchema } from "@/lib/campaign-repo";
import type { MailProvider } from "@/lib/mail-provider";

export type SystemLogSource = "campaign" | "direct";
export type SystemLogStatus = "success" | "failed";

export type SystemLogRow = {
  id: string;
  source: SystemLogSource;
  sourceRecordId: number;
  campaignId: number | null;
  mailProvider: MailProvider | null;
  toEmail: string;
  userName: string;
  subject: string;
  status: SystemLogStatus;
  providerMessageId: string | null;
  errorMessage: string | null;
  createdAt: string;
};

let directSendSchemaReadyPromise: Promise<void> | null = null;

async function ensureMysqlColumnExists(tableName: string, columnName: string, alterSql: string) {
  const rows = await queryRows<RowDataPacket>(
    `
      SELECT 1 AS v
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
    `,
    [tableName, columnName],
  );

  if (rows.length === 0) {
    const pool = getPool();
    await pool.execute(alterSql);
  }
}

export function ensureDirectSendLogSchema() {
  if (directSendSchemaReadyPromise) {
    return directSendSchemaReadyPromise;
  }

  directSendSchemaReadyPromise = (async () => {
    const pool = getPool();

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS direct_send_log (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        to_email VARCHAR(255) NOT NULL,
        user_name VARCHAR(128) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        mail_provider ENUM('sendgrid','resend') NOT NULL DEFAULT 'sendgrid',
        content_format ENUM('html','markdown') NOT NULL DEFAULT 'html',
        send_status ENUM('success','failed') NOT NULL,
        provider_message_id VARCHAR(255) NULL,
        error_message TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_direct_send_log_created_at (created_at),
        KEY idx_direct_send_log_status_created (send_status, created_at),
        KEY idx_direct_send_log_to_email (to_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await ensureMysqlColumnExists(
      "direct_send_log",
      "mail_provider",
      `
        ALTER TABLE direct_send_log
        ADD COLUMN mail_provider ENUM('sendgrid','resend') NOT NULL DEFAULT 'sendgrid'
      `,
    );

    await pool.execute(`
      ALTER TABLE direct_send_log
      MODIFY COLUMN mail_provider ENUM('sendgrid','resend') NOT NULL DEFAULT 'sendgrid'
    `);
  })();

  return directSendSchemaReadyPromise;
}

export async function recordDirectSendLog(input: {
  toEmail: string;
  userName: string;
  subject: string;
  mailProvider: MailProvider;
  contentFormat: "html" | "markdown";
  status: SystemLogStatus;
  providerMessageId?: string | null;
  errorMessage?: string | null;
}) {
  await ensureDirectSendLogSchema();

  const pool = getPool();

  await pool.execute(
    `
      INSERT INTO direct_send_log
        (to_email, user_name, subject, mail_provider, content_format, send_status, provider_message_id, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.toEmail,
      input.userName,
      input.subject,
      input.mailProvider,
      input.contentFormat,
      input.status,
      input.providerMessageId || null,
      input.errorMessage?.slice(0, 2000) || null,
    ],
  );
}

function toTimestamp(value: string) {
  const date = new Date(value);
  const time = date.getTime();

  if (Number.isNaN(time)) {
    return 0;
  }

  return time;
}

export async function listSystemLogs(input?: {
  limit?: number;
  source?: "all" | SystemLogSource;
  status?: "all" | SystemLogStatus;
  emailLike?: string;
}) {
  await Promise.all([ensureCampaignSchema(), ensureDirectSendLogSchema()]);

  const safeLimit = Math.min(Math.max(Math.floor(input?.limit || 100), 1), 500);
  const source = input?.source || "all";
  const status = input?.status || "all";
  const emailLike = input?.emailLike?.trim();
  const perSourceLimit = Math.min(safeLimit * 2, 1000);

  const campaignLogs: SystemLogRow[] = [];
  const directLogs: SystemLogRow[] = [];

  if (source === "all" || source === "campaign") {
    const campaignClauses = ["r.send_status IN ('success','failed')", "r.sent_at IS NOT NULL"];
    const campaignParams: Array<string | number> = [];

    if (status === "success" || status === "failed") {
      campaignClauses.push("r.send_status = ?");
      campaignParams.push(status);
    }

    if (emailLike) {
      campaignClauses.push("r.email LIKE ?");
      campaignParams.push(`%${emailLike}%`);
    }

    const rows = await queryRows<
      {
        source_record_id: number;
        campaign_id: number;
        mail_provider: MailProvider;
        to_email: string;
        user_name: string;
        subject: string;
        send_status: SystemLogStatus;
        provider_message_id: string | null;
        error_message: string | null;
        created_at: string;
      } & RowDataPacket
    >(
      `
        SELECT
          r.id AS source_record_id,
          r.campaign_id,
          c.send_provider AS mail_provider,
          r.email AS to_email,
          r.user_name,
          c.subject,
          r.send_status,
          r.provider_message_id,
          r.error_message,
          r.sent_at AS created_at
        FROM marketing_campaign_recipient r
        INNER JOIN marketing_campaign c ON c.id = r.campaign_id
        WHERE ${campaignClauses.join(" AND ")}
        ORDER BY r.sent_at DESC
        LIMIT ?
      `,
      [...campaignParams, perSourceLimit],
    );

    for (const row of rows) {
      campaignLogs.push({
        id: `campaign-${row.source_record_id}`,
        source: "campaign",
        sourceRecordId: Number(row.source_record_id),
        campaignId: Number(row.campaign_id),
        mailProvider: row.mail_provider,
        toEmail: row.to_email,
        userName: row.user_name,
        subject: row.subject,
        status: row.send_status,
        providerMessageId: row.provider_message_id,
        errorMessage: row.error_message,
        createdAt: row.created_at,
      });
    }
  }

  if (source === "all" || source === "direct") {
    const directClauses = ["1=1"];
    const directParams: Array<string | number> = [];

    if (status === "success" || status === "failed") {
      directClauses.push("send_status = ?");
      directParams.push(status);
    }

    if (emailLike) {
      directClauses.push("to_email LIKE ?");
      directParams.push(`%${emailLike}%`);
    }

    const rows = await queryRows<
      {
        source_record_id: number;
        mail_provider: MailProvider;
        to_email: string;
        user_name: string;
        subject: string;
        send_status: SystemLogStatus;
        provider_message_id: string | null;
        error_message: string | null;
        created_at: string;
      } & RowDataPacket
    >(
      `
        SELECT
          id AS source_record_id,
          mail_provider,
          to_email,
          user_name,
          subject,
          send_status,
          provider_message_id,
          error_message,
          created_at
        FROM direct_send_log
        WHERE ${directClauses.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT ?
      `,
      [...directParams, perSourceLimit],
    );

    for (const row of rows) {
      directLogs.push({
        id: `direct-${row.source_record_id}`,
        source: "direct",
        sourceRecordId: Number(row.source_record_id),
        campaignId: null,
        mailProvider: row.mail_provider,
        toEmail: row.to_email,
        userName: row.user_name,
        subject: row.subject,
        status: row.send_status,
        providerMessageId: row.provider_message_id,
        errorMessage: row.error_message,
        createdAt: row.created_at,
      });
    }
  }

  const logs = [...campaignLogs, ...directLogs]
    .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt))
    .slice(0, safeLimit);

  return {
    total: logs.length,
    logs,
  };
}
