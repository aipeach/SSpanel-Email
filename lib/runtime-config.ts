import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type ConfigSource = "env" | "sqlite" | "unset";
export type ConfigFieldType = "text" | "password" | "number" | "select";

type ConfigOption = {
  label: string;
  value: string;
};

export type ConfigField = {
  key: string;
  label: string;
  description: string;
  group: string;
  type: ConfigFieldType;
  placeholder?: string;
  options?: ConfigOption[];
};

export type ConfigFieldWithValue = ConfigField & {
  value: string;
  source: ConfigSource;
};

export const CONFIG_FIELDS: ConfigField[] = [
  {
    key: "DEFAULT_SEND_RATE_PER_MINUTE",
    label: "默认发送速率（封/分钟）",
    description: "任务发送留空速率时会使用该值。",
    group: "发件策略",
    type: "number",
    placeholder: "60",
  },
  {
    key: "DEFAULT_MAIL_PROVIDER",
    label: "默认发件渠道",
    description: "任务/直接发送未指定渠道时使用该值。",
    group: "发件策略",
    type: "select",
    options: [
      { label: "SendGrid", value: "sendgrid" },
      { label: "Resend", value: "resend" },
      { label: "SMTP", value: "smtp" },
    ],
  },
  {
    key: "SENDGRID_API_KEY",
    label: "SendGrid API Key",
    description: "启用 SendGrid 必填。",
    group: "SendGrid",
    type: "password",
  },
  {
    key: "SENDGRID_FROM_EMAIL",
    label: "SendGrid 发件邮箱",
    description: "启用 SendGrid 必填。",
    group: "SendGrid",
    type: "text",
    placeholder: "no-reply@example.com",
  },
  {
    key: "SENDGRID_FROM_NAME",
    label: "SendGrid 发件人名称",
    description: "可选，默认 SSPanel。",
    group: "SendGrid",
    type: "text",
    placeholder: "SSPanel",
  },
  {
    key: "RESEND_API_KEY",
    label: "Resend API Key",
    description: "启用 Resend 必填。",
    group: "Resend",
    type: "password",
  },
  {
    key: "RESEND_FROM_EMAIL",
    label: "Resend 发件邮箱",
    description: "建议配置；未配置会尝试回退 SENDGRID_FROM_EMAIL。",
    group: "Resend",
    type: "text",
    placeholder: "no-reply@example.com",
  },
  {
    key: "RESEND_FROM_NAME",
    label: "Resend 发件人名称",
    description: "可选，默认 SSPanel。",
    group: "Resend",
    type: "text",
    placeholder: "SSPanel",
  },
  {
    key: "SMTP_HOST",
    label: "SMTP Host",
    description: "启用 SMTP 必填。",
    group: "SMTP",
    type: "text",
    placeholder: "smtp.example.com",
  },
  {
    key: "SMTP_PORT",
    label: "SMTP Port",
    description: "启用 SMTP 必填，常见 587 或 465。",
    group: "SMTP",
    type: "number",
    placeholder: "587",
  },
  {
    key: "SMTP_SECURE",
    label: "SMTP Secure",
    description: "true 使用 TLS（通常 465），false 通常走 STARTTLS（587）。",
    group: "SMTP",
    type: "select",
    options: [
      { label: "false", value: "false" },
      { label: "true", value: "true" },
    ],
  },
  {
    key: "SMTP_USER",
    label: "SMTP 用户名",
    description: "启用 SMTP 必填。",
    group: "SMTP",
    type: "text",
    placeholder: "user@example.com",
  },
  {
    key: "SMTP_PASS",
    label: "SMTP 密码",
    description: "启用 SMTP 必填。",
    group: "SMTP",
    type: "password",
  },
  {
    key: "SMTP_FROM_EMAIL",
    label: "SMTP 发件邮箱",
    description: "启用 SMTP 必填。",
    group: "SMTP",
    type: "text",
    placeholder: "no-reply@example.com",
  },
  {
    key: "SMTP_FROM_NAME",
    label: "SMTP 发件人名称",
    description: "可选，默认 SSPanel。",
    group: "SMTP",
    type: "text",
    placeholder: "SSPanel",
  },
];

const EDITABLE_KEY_SET = new Set(CONFIG_FIELDS.map((item) => item.key));
const SQLITE_FALLBACK_KEY_SET = new Set(CONFIG_FIELDS.map((item) => item.key));

let configDb: DatabaseSync | null = null;

function resolveConfigDbPath() {
  const projectRoot = process.cwd();
  const configured = process.env.APP_CONFIG_SQLITE_PATH?.trim();

  if (!configured) {
    return path.join(projectRoot, "data", "app-config.sqlite");
  }

  if (path.isAbsolute(configured)) {
    return configured;
  }

  return path.join(projectRoot, configured);
}

function ensureConfigSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

function getConfigDb() {
  if (configDb) {
    return configDb;
  }

  const dbPath = resolveConfigDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  configDb = new DatabaseSync(dbPath);
  ensureConfigSchema(configDb);

  return configDb;
}

function getEnvValue(key: string) {
  const raw = process.env[key];

  if (typeof raw !== "string") {
    return null;
  }

  if (raw === "") {
    return null;
  }

  return raw;
}

export function isEditableConfigKey(key: string) {
  return EDITABLE_KEY_SET.has(key);
}

export function getStoredConfigValue(key: string) {
  const db = getConfigDb();
  const row = db
    .prepare(
      `
        SELECT value
        FROM app_config
        WHERE key = ?
        LIMIT 1
      `,
    )
    .get(key) as { value: string } | undefined;

  return row?.value ?? null;
}

export function getConfigValue(key: string) {
  const envValue = getEnvValue(key);

  if (envValue !== null) {
    return envValue;
  }

  if (!SQLITE_FALLBACK_KEY_SET.has(key)) {
    return null;
  }

  return getStoredConfigValue(key);
}

export function getConfigSource(key: string): ConfigSource {
  const envValue = getEnvValue(key);

  if (envValue !== null) {
    return "env";
  }

  if (!SQLITE_FALLBACK_KEY_SET.has(key)) {
    return "unset";
  }

  const stored = getStoredConfigValue(key);

  if (stored !== null) {
    return "sqlite";
  }

  return "unset";
}

export function listEditableConfigFields(): ConfigFieldWithValue[] {
  return CONFIG_FIELDS.map((item) => ({
    ...item,
    value: getConfigValue(item.key) || "",
    source: getConfigSource(item.key),
  }));
}

export function saveEditableConfigValues(values: Record<string, string>) {
  const db = getConfigDb();
  const keys = Object.keys(values).filter((key) => isEditableConfigKey(key));

  db.exec("BEGIN");

  try {
    const upsert = db.prepare(
      `
        INSERT INTO app_config (key, value, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
      `,
    );
    const remove = db.prepare("DELETE FROM app_config WHERE key = ?");

    for (const key of keys) {
      const rawValue = values[key] ?? "";
      const normalized = String(rawValue);

      if (normalized === "") {
        remove.run(key);
      } else {
        upsert.run(key, normalized);
      }
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
