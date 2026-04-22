import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool, queryRows } from "@/lib/db";
import type { MailProvider } from "@/lib/mail-provider";
import type { RecipientFilters, RecipientRow } from "@/lib/recipient-filters";

export type CampaignStatus = "draft" | "sending" | "done" | "failed" | "partial" | "stopped";

export type CampaignListItem = {
  id: number;
  subject: string;
  recipient_count: number;
  status: CampaignStatus;
  send_provider: MailProvider;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type CampaignRecipientLog = {
  id: number;
  user_id: number;
  email: string;
  user_name: string;
  send_status: "pending" | "success" | "failed";
  provider_message_id: string | null;
  error_message: string | null;
  sent_at: string | null;
};

export type CampaignDetail = {
  id: number;
  subject: string;
  html_content: string;
  text_content: string | null;
  filter_json: string;
  recipient_count: number;
  status: CampaignStatus;
  send_provider: MailProvider;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  stats: {
    pending: number;
    success: number;
    failed: number;
  };
  sampleRecipients: CampaignRecipientLog[];
};

export type CampaignForSending = {
  id: number;
  subject: string;
  html_content: string;
  text_content: string | null;
  status: CampaignStatus;
  send_provider: MailProvider;
};

export type PendingCampaignRecipient = {
  id: number;
  email: string;
  user_name: string;
};

export type DraftCampaignMutationResult = "ok" | "not_found" | "invalid_status";

let schemaReadyPromise: Promise<void> | null = null;

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

export function ensureCampaignSchema() {
  if (schemaReadyPromise) {
    return schemaReadyPromise;
  }

  schemaReadyPromise = (async () => {
    const pool = getPool();

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS marketing_campaign (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        subject VARCHAR(255) NOT NULL,
        html_content LONGTEXT NOT NULL,
        text_content LONGTEXT NULL,
        filter_json JSON NOT NULL,
        recipient_count INT NOT NULL DEFAULT 0,
        status ENUM('draft','sending','done','failed','partial','stopped') NOT NULL DEFAULT 'draft',
        send_provider ENUM('sendgrid','resend') NOT NULL DEFAULT 'sendgrid',
        error_message TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        started_at DATETIME NULL,
        finished_at DATETIME NULL,
        PRIMARY KEY (id),
        KEY idx_marketing_campaign_created_at (created_at),
        KEY idx_marketing_campaign_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.execute(`
      ALTER TABLE marketing_campaign
      MODIFY COLUMN status ENUM('draft','sending','done','failed','partial','stopped') NOT NULL DEFAULT 'draft'
    `);

    await ensureMysqlColumnExists(
      "marketing_campaign",
      "send_provider",
      `
        ALTER TABLE marketing_campaign
        ADD COLUMN send_provider ENUM('sendgrid','resend') NOT NULL DEFAULT 'sendgrid'
      `,
    );

    await pool.execute(`
      ALTER TABLE marketing_campaign
      MODIFY COLUMN send_provider ENUM('sendgrid','resend') NOT NULL DEFAULT 'sendgrid'
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS marketing_campaign_recipient (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        campaign_id BIGINT UNSIGNED NOT NULL,
        user_id BIGINT UNSIGNED NOT NULL,
        email VARCHAR(255) NOT NULL,
        user_name VARCHAR(128) NOT NULL,
        send_status ENUM('pending','success','failed') NOT NULL DEFAULT 'pending',
        provider_message_id VARCHAR(255) NULL,
        error_message TEXT NULL,
        sent_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_campaign_email (campaign_id, email),
        KEY idx_campaign_status (campaign_id, send_status),
        KEY idx_campaign_id (campaign_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  })();

  return schemaReadyPromise;
}

export async function createCampaign(input: {
  subject: string;
  htmlContent: string;
  textContent?: string;
  filters: RecipientFilters;
  recipients: RecipientRow[];
}) {
  await ensureCampaignSchema();

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [campaignResult] = await connection.execute<ResultSetHeader>(
      `
        INSERT INTO marketing_campaign
          (subject, html_content, text_content, filter_json, recipient_count, status)
        VALUES (?, ?, ?, ?, ?, 'draft')
      `,
      [
        input.subject,
        input.htmlContent,
        input.textContent || null,
        JSON.stringify(input.filters),
        input.recipients.length,
      ],
    );

    const campaignId = Number(campaignResult.insertId);

    if (input.recipients.length > 0) {
      const batchSize = 500;

      for (let index = 0; index < input.recipients.length; index += batchSize) {
        const batch = input.recipients.slice(index, index + batchSize);
        const placeholders = batch.map(() => "(?,?,?,?,?)").join(",");
        const values = batch.flatMap((recipient) => [
          campaignId,
          recipient.id,
          recipient.email,
          recipient.user_name,
          "pending",
        ]);

        await connection.query(
          `
            INSERT INTO marketing_campaign_recipient
              (campaign_id, user_id, email, user_name, send_status)
            VALUES ${placeholders}
          `,
          values,
        );
      }
    }

    await connection.commit();

    return {
      id: campaignId,
      recipientCount: input.recipients.length,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listCampaigns(limit = 50) {
  await ensureCampaignSchema();

  return queryRows<CampaignListItem & RowDataPacket>(
    `
      SELECT
        id,
        subject,
        recipient_count,
        status,
        send_provider,
        created_at,
        started_at,
        finished_at
      FROM marketing_campaign
      ORDER BY id DESC
      LIMIT ?
    `,
    [limit],
  );
}

export async function getCampaignDetail(campaignId: number) {
  await ensureCampaignSchema();

  const campaigns = await queryRows<(Omit<CampaignDetail, "stats" | "sampleRecipients"> & RowDataPacket)>(
    `
      SELECT
        id,
        subject,
        html_content,
        text_content,
        filter_json,
        recipient_count,
        status,
        send_provider,
        error_message,
        created_at,
        started_at,
        finished_at
      FROM marketing_campaign
      WHERE id = ?
      LIMIT 1
    `,
    [campaignId],
  );

  const campaign = campaigns[0];

  if (!campaign) {
    return null;
  }

  const rows = await queryRows<
    {
      send_status: "pending" | "success" | "failed";
      total: number;
    } & RowDataPacket
  >(
    `
      SELECT send_status, COUNT(*) AS total
      FROM marketing_campaign_recipient
      WHERE campaign_id = ?
      GROUP BY send_status
    `,
    [campaignId],
  );

  const sampleRecipients = await queryRows<CampaignRecipientLog & RowDataPacket>(
    `
      SELECT
        id,
        user_id,
        email,
        user_name,
        send_status,
        provider_message_id,
        error_message,
        sent_at
      FROM marketing_campaign_recipient
      WHERE campaign_id = ?
      ORDER BY id DESC
      LIMIT 50
    `,
    [campaignId],
  );

  const stats = {
    pending: 0,
    success: 0,
    failed: 0,
  };

  for (const row of rows) {
    stats[row.send_status] = Number(row.total);
  }

  return {
    ...campaign,
    stats,
    sampleRecipients,
  } satisfies CampaignDetail;
}

export async function getCampaignForSending(campaignId: number) {
  await ensureCampaignSchema();

  const rows = await queryRows<CampaignForSending & RowDataPacket>(
    `
      SELECT id, subject, html_content, text_content, status, send_provider
      FROM marketing_campaign
      WHERE id = ?
      LIMIT 1
    `,
    [campaignId],
  );

  return rows[0] || null;
}

export async function startCampaignSending(campaignId: number, mailProvider: MailProvider) {
  await ensureCampaignSchema();
  const pool = getPool();

  const [result] = await pool.execute<ResultSetHeader>(
    `
      UPDATE marketing_campaign
      SET status = 'sending', send_provider = ?, started_at = NOW(), finished_at = NULL, error_message = NULL
      WHERE id = ? AND status IN ('draft', 'failed', 'partial', 'stopped')
    `,
    [mailProvider, campaignId],
  );

  return result.affectedRows > 0;
}

export async function listPendingRecipientsForCampaign(
  campaignId: number,
  limit = 100,
  afterRecipientId = 0,
) {
  await ensureCampaignSchema();

  return queryRows<PendingCampaignRecipient & RowDataPacket>(
    `
      SELECT id, email, user_name
      FROM marketing_campaign_recipient
      WHERE campaign_id = ? AND send_status = 'pending' AND id > ?
      ORDER BY id ASC
      LIMIT ?
    `,
    [campaignId, afterRecipientId, limit],
  );
}

export async function resetFailedRecipientsToPending(campaignId: number) {
  const pool = getPool();

  await pool.execute(
    `
      UPDATE marketing_campaign_recipient
      SET send_status = 'pending', error_message = NULL, provider_message_id = NULL, sent_at = NULL
      WHERE campaign_id = ? AND send_status = 'failed'
    `,
    [campaignId],
  );
}

export async function markCampaignRecipientSuccess(recipientId: number, providerMessageId: string | null) {
  const pool = getPool();

  await pool.execute(
    `
      UPDATE marketing_campaign_recipient
      SET send_status = 'success', provider_message_id = ?, error_message = NULL, sent_at = NOW()
      WHERE id = ?
    `,
    [providerMessageId, recipientId],
  );
}

export async function markCampaignRecipientFailed(recipientId: number, errorMessage: string) {
  const pool = getPool();

  await pool.execute(
    `
      UPDATE marketing_campaign_recipient
      SET send_status = 'failed', error_message = ?, sent_at = NOW()
      WHERE id = ?
    `,
    [errorMessage.slice(0, 2000), recipientId],
  );
}

export async function getCampaignRecipientStats(campaignId: number) {
  const rows = await queryRows<
    {
      send_status: "pending" | "success" | "failed";
      total: number;
    } & RowDataPacket
  >(
    `
      SELECT send_status, COUNT(*) AS total
      FROM marketing_campaign_recipient
      WHERE campaign_id = ?
      GROUP BY send_status
    `,
    [campaignId],
  );

  const stats = {
    pending: 0,
    success: 0,
    failed: 0,
  };

  for (const row of rows) {
    stats[row.send_status] = Number(row.total);
  }

  return stats;
}

export async function finalizeCampaignStatus(campaignId: number, status: CampaignStatus, errorMessage?: string) {
  const pool = getPool();

  await pool.execute(
    `
      UPDATE marketing_campaign
      SET status = ?, finished_at = NOW(), error_message = ?
      WHERE id = ?
    `,
    [status, errorMessage || null, campaignId],
  );
}

export async function updateDraftCampaign(input: {
  campaignId: number;
  subject: string;
  htmlContent: string;
  textContent?: string;
  filters: RecipientFilters;
  recipients: RecipientRow[];
}): Promise<DraftCampaignMutationResult> {
  await ensureCampaignSchema();

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [campaignRows] = await connection.execute<
      Array<
        {
          status: CampaignStatus;
        } & RowDataPacket
      >
    >(
      `
        SELECT status
        FROM marketing_campaign
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [input.campaignId],
    );

    const campaign = campaignRows[0];

    if (!campaign) {
      await connection.rollback();
      return "not_found";
    }

    if (campaign.status !== "draft") {
      await connection.rollback();
      return "invalid_status";
    }

    await connection.execute(
      `
        UPDATE marketing_campaign
        SET
          subject = ?,
          html_content = ?,
          text_content = ?,
          filter_json = ?,
          recipient_count = ?,
          error_message = NULL
        WHERE id = ?
      `,
      [
        input.subject,
        input.htmlContent,
        input.textContent || null,
        JSON.stringify(input.filters),
        input.recipients.length,
        input.campaignId,
      ],
    );

    await connection.execute(
      `
        DELETE FROM marketing_campaign_recipient
        WHERE campaign_id = ?
      `,
      [input.campaignId],
    );

    if (input.recipients.length > 0) {
      const batchSize = 500;

      for (let index = 0; index < input.recipients.length; index += batchSize) {
        const batch = input.recipients.slice(index, index + batchSize);
        const placeholders = batch.map(() => "(?,?,?,?,?)").join(",");
        const values = batch.flatMap((recipient) => [
          input.campaignId,
          recipient.id,
          recipient.email,
          recipient.user_name,
          "pending",
        ]);

        await connection.query(
          `
            INSERT INTO marketing_campaign_recipient
              (campaign_id, user_id, email, user_name, send_status)
            VALUES ${placeholders}
          `,
          values,
        );
      }
    }

    await connection.commit();
    return "ok";
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteDraftCampaign(campaignId: number): Promise<DraftCampaignMutationResult> {
  await ensureCampaignSchema();

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [campaignRows] = await connection.execute<
      Array<
        {
          status: CampaignStatus;
        } & RowDataPacket
      >
    >(
      `
        SELECT status
        FROM marketing_campaign
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [campaignId],
    );

    const campaign = campaignRows[0];

    if (!campaign) {
      await connection.rollback();
      return "not_found";
    }

    if (campaign.status !== "draft") {
      await connection.rollback();
      return "invalid_status";
    }

    await connection.execute(
      `
        DELETE FROM marketing_campaign_recipient
        WHERE campaign_id = ?
      `,
      [campaignId],
    );

    await connection.execute(
      `
        DELETE FROM marketing_campaign
        WHERE id = ?
      `,
      [campaignId],
    );

    await connection.commit();
    return "ok";
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
