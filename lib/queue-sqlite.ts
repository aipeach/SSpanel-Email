import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type QueueJobStatus = "queued" | "running" | "done" | "failed" | "partial";
export type QueueItemStatus = "pending" | "success" | "failed";

export type QueueJobRow = {
  id: number;
  campaign_id: number;
  status: QueueJobStatus;
  stop_requested: number;
  rate_per_minute: number;
  total_count: number;
  success_count: number;
  failed_count: number;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type QueueItemRow = {
  id: number;
  job_id: number;
  campaign_recipient_id: number;
  email: string;
  user_name: string;
  status: QueueItemStatus;
  error_message: string | null;
  provider_message_id: string | null;
  created_at: string;
  sent_at: string | null;
};

let queueDb: DatabaseSync | null = null;

function ensureColumnExists(db: DatabaseSync, tableName: string, columnName: string, alterSql: string) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;

  const exists = columns.some((column) => column.name === columnName);

  if (!exists) {
    db.exec(alterSql);
  }
}

function resolveQueueDbPath() {
  const projectRoot = /*turbopackIgnore: true*/ process.cwd();
  const configured = process.env.QUEUE_SQLITE_PATH?.trim();

  if (!configured) {
    return path.join(projectRoot, "data", "email-queue.sqlite");
  }

  if (path.isAbsolute(configured)) {
    return configured;
  }

  return path.join(projectRoot, configured);
}

function ensureQueueSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_queue_job (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('queued','running','done','failed','partial')),
      stop_requested INTEGER NOT NULL DEFAULT 0,
      rate_per_minute INTEGER NOT NULL,
      total_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT NULL,
      finished_at TEXT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS email_queue_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      campaign_recipient_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      user_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','success','failed')),
      error_message TEXT NULL,
      provider_message_id TEXT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      sent_at TEXT NULL,
      FOREIGN KEY(job_id) REFERENCES email_queue_job(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_email_queue_job_status_created
    ON email_queue_job(status, created_at)
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_email_queue_job_active_campaign
    ON email_queue_job(campaign_id)
    WHERE status IN ('queued', 'running')
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_email_queue_item_job_status_id
    ON email_queue_item(job_id, status, id)
  `);

  ensureColumnExists(
    db,
    "email_queue_job",
    "stop_requested",
    "ALTER TABLE email_queue_job ADD COLUMN stop_requested INTEGER NOT NULL DEFAULT 0",
  );
}

export function getQueueDb() {
  if (queueDb) {
    return queueDb;
  }

  const dbPath = resolveQueueDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  queueDb = new DatabaseSync(dbPath);
  queueDb.exec("PRAGMA journal_mode = WAL;");
  queueDb.exec("PRAGMA foreign_keys = ON;");

  ensureQueueSchema(queueDb);

  return queueDb;
}

export function findActiveQueueJobByCampaign(campaignId: number) {
  const db = getQueueDb();

  const row = db
    .prepare(
      `
        SELECT
          id,
          campaign_id,
          status,
          stop_requested,
          rate_per_minute,
          total_count,
          success_count,
          failed_count,
          error_message,
          created_at,
          started_at,
          finished_at
        FROM email_queue_job
        WHERE campaign_id = ? AND status IN ('queued', 'running')
        ORDER BY id DESC
        LIMIT 1
      `,
    )
    .get(campaignId);

  return (row as QueueJobRow | undefined) || null;
}

export function createQueueJob(input: {
  campaignId: number;
  ratePerMinute: number;
  recipients: Array<{
    campaignRecipientId: number;
    email: string;
    userName: string;
  }>;
}) {
  const db = getQueueDb();

  db.exec("BEGIN");

  try {
    const insertJobResult = db
      .prepare(
        `
          INSERT INTO email_queue_job (campaign_id, status, rate_per_minute, total_count)
          VALUES (?, 'queued', ?, ?)
        `,
      )
      .run(input.campaignId, input.ratePerMinute, input.recipients.length);

    const jobId = Number(insertJobResult.lastInsertRowid);
    const insertItem = db.prepare(
      `
        INSERT INTO email_queue_item (job_id, campaign_recipient_id, email, user_name, status)
        VALUES (?, ?, ?, ?, 'pending')
      `,
    );

    for (const recipient of input.recipients) {
      insertItem.run(jobId, recipient.campaignRecipientId, recipient.email, recipient.userName);
    }

    db.exec("COMMIT");

    return {
      jobId,
      totalCount: input.recipients.length,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function claimNextQueueJob() {
  const db = getQueueDb();

  const running = db
    .prepare(
      `
        SELECT
          id,
          campaign_id,
          status,
          stop_requested,
          rate_per_minute,
          total_count,
          success_count,
          failed_count,
          error_message,
          created_at,
          started_at,
          finished_at
        FROM email_queue_job
        WHERE status = 'running'
        ORDER BY id ASC
        LIMIT 1
      `,
    )
    .get() as QueueJobRow | undefined;

  if (running) {
    return running;
  }

  const queued = db
    .prepare(
      `
        SELECT
          id,
          campaign_id,
          status,
          stop_requested,
          rate_per_minute,
          total_count,
          success_count,
          failed_count,
          error_message,
          created_at,
          started_at,
          finished_at
        FROM email_queue_job
        WHERE status = 'queued'
        ORDER BY id ASC
        LIMIT 1
      `,
    )
    .get() as QueueJobRow | undefined;

  if (!queued) {
    return null;
  }

  const updateResult = db
    .prepare(
      `
        UPDATE email_queue_job
        SET status = 'running', started_at = COALESCE(started_at, datetime('now'))
        WHERE id = ? AND status = 'queued'
      `,
    )
    .run(queued.id);

  if (updateResult.changes === 0) {
    return claimNextQueueJob();
  }

  return {
    ...queued,
    status: "running",
    started_at: queued.started_at || new Date().toISOString(),
  } satisfies QueueJobRow;
}

export function getNextPendingQueueItem(jobId: number) {
  const db = getQueueDb();

  const row = db
    .prepare(
      `
        SELECT
          id,
          job_id,
          campaign_recipient_id,
          email,
          user_name,
          status,
          error_message,
          provider_message_id,
          created_at,
          sent_at
        FROM email_queue_item
        WHERE job_id = ? AND status = 'pending'
        ORDER BY id ASC
        LIMIT 1
      `,
    )
    .get(jobId);

  return (row as QueueItemRow | undefined) || null;
}

export function isQueueJobStopRequested(jobId: number) {
  const db = getQueueDb();

  const row = db
    .prepare(
      `
        SELECT stop_requested
        FROM email_queue_job
        WHERE id = ?
        LIMIT 1
      `,
    )
    .get(jobId) as { stop_requested: number } | undefined;

  return Boolean(row?.stop_requested);
}

export function requestStopQueueJobByCampaign(campaignId: number) {
  const db = getQueueDb();

  const updateResult = db
    .prepare(
      `
        UPDATE email_queue_job
        SET stop_requested = 1
        WHERE campaign_id = ? AND status IN ('queued', 'running')
      `,
    )
    .run(campaignId);

  if (updateResult.changes === 0) {
    return null;
  }

  const row = db
    .prepare(
      `
        SELECT
          id,
          campaign_id,
          status,
          stop_requested,
          rate_per_minute,
          total_count,
          success_count,
          failed_count,
          error_message,
          created_at,
          started_at,
          finished_at
        FROM email_queue_job
        WHERE campaign_id = ? AND status IN ('queued', 'running')
        ORDER BY id DESC
        LIMIT 1
      `,
    )
    .get(campaignId);

  return (row as QueueJobRow | undefined) || null;
}

export function markQueueItemSuccess(itemId: number, providerMessageId: string | null) {
  const db = getQueueDb();

  db.prepare(
    `
      UPDATE email_queue_item
      SET status = 'success', provider_message_id = ?, error_message = NULL, sent_at = datetime('now')
      WHERE id = ?
    `,
  ).run(providerMessageId, itemId);
}

export function markQueueItemFailed(itemId: number, errorMessage: string) {
  const db = getQueueDb();

  db.prepare(
    `
      UPDATE email_queue_item
      SET status = 'failed', error_message = ?, provider_message_id = NULL, sent_at = datetime('now')
      WHERE id = ?
    `,
  ).run(errorMessage.slice(0, 2000), itemId);
}

export function summarizeQueueJob(jobId: number) {
  const db = getQueueDb();

  const rows = db
    .prepare(
      `
        SELECT status, COUNT(*) AS total
        FROM email_queue_item
        WHERE job_id = ?
        GROUP BY status
      `,
    )
    .all(jobId) as Array<{
    status: QueueItemStatus;
    total: number;
  }>;

  const summary = {
    pending: 0,
    success: 0,
    failed: 0,
    total: 0,
  };

  for (const row of rows) {
    summary[row.status] = Number(row.total);
    summary.total += Number(row.total);
  }

  return summary;
}

export function finishQueueJob(input: {
  jobId: number;
  status: QueueJobStatus;
  summary: {
    success: number;
    failed: number;
    total: number;
  };
  errorMessage?: string;
}) {
  const db = getQueueDb();

  db.prepare(
    `
      UPDATE email_queue_job
      SET
        status = ?,
        stop_requested = 0,
        success_count = ?,
        failed_count = ?,
        total_count = ?,
        error_message = ?,
        finished_at = datetime('now')
      WHERE id = ?
    `,
  ).run(
    input.status,
    input.summary.success,
    input.summary.failed,
    input.summary.total,
    input.errorMessage || null,
    input.jobId,
  );
}
