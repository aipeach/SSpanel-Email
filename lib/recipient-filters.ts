import { z } from "zod";
import { queryRows } from "@/lib/db";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const optionalDateSchema = z
  .string()
  .trim()
  .regex(datePattern, "日期格式必须是 YYYY-MM-DD")
  .optional()
  .or(z.literal(""))
  .transform((value) => (value ? value : undefined));

export const recipientFilterSchema = z
  .object({
    userIds: z.array(z.number().int().min(1)).max(1000).optional(),
    regRecentDays: z.number().int().min(1).max(3650).optional(),
    regDateFrom: optionalDateSchema,
    regDateTo: optionalDateSchema,
    lastDayTMin: z.number().int().min(0).optional(),
    lastDayTMax: z.number().int().min(0).optional(),
    classes: z.array(z.number().int().min(0)).max(100).optional(),
    classExpireMode: z
      .enum(["all", "expired", "not_expired", "range", "more_than_days", "less_than_days"])
      .default("all"),
    classExpireDays: z.number().int().min(1).max(3650).optional(),
    classExpireFrom: optionalDateSchema,
    classExpireTo: optionalDateSchema,
    nodeGroups: z.array(z.number().int().min(0)).max(100).optional(),
    includeAdmin: z.boolean().default(false),
    enable: z.enum(["enabled", "disabled", "all"]).default("enabled"),
  })
  .superRefine((value, ctx) => {
    if (
      typeof value.lastDayTMin === "number" &&
      typeof value.lastDayTMax === "number" &&
      value.lastDayTMin > value.lastDayTMax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "lastDayTMin 不能大于 lastDayTMax",
        path: ["lastDayTMin"],
      });
    }

    if (value.regDateFrom && value.regDateTo && value.regDateFrom > value.regDateTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "regDateFrom 不能晚于 regDateTo",
        path: ["regDateFrom"],
      });
    }

    if (
      value.classExpireMode === "range" &&
      value.classExpireFrom &&
      value.classExpireTo &&
      value.classExpireFrom > value.classExpireTo
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "classExpireFrom 不能晚于 classExpireTo",
        path: ["classExpireFrom"],
      });
    }

    if (
      (value.classExpireMode === "more_than_days" || value.classExpireMode === "less_than_days") &&
      typeof value.classExpireDays !== "number"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "classExpireDays 必填且需为正整数",
        path: ["classExpireDays"],
      });
    }
  });

export type RecipientFilters = z.infer<typeof recipientFilterSchema>;

export type RecipientRow = {
  id: number;
  email: string;
  user_name: string;
};

export type UserOverviewRow = {
  id: number;
  user_name: string;
  email: string;
  reg_date: string;
  last_day_t: number;
  class: number;
  class_expire: string;
  node_group: number;
  is_admin: number;
  enable: number;
};

export type UserOverviewTableFilters = {
  userId?: number;
  userNameLike?: string;
  emailLike?: string;
  classValue?: number;
  nodeGroupValue?: number;
  enable: "enabled" | "disabled" | "all";
  isAdmin: "all" | "yes" | "no";
};

export type UserOverviewSortField =
  | "id"
  | "user_name"
  | "email"
  | "reg_date"
  | "last_day_t"
  | "class"
  | "class_expire"
  | "node_group"
  | "is_admin"
  | "enable";

export type UserOverviewSortOrder = "asc" | "desc";

function toStartOfDay(date: string) {
  return `${date} 00:00:00`;
}

function toEndOfDay(date: string) {
  return `${date} 23:59:59`;
}

function splitNumericCsv(input: string | undefined, minValue = 0) {
  if (!input) {
    return undefined;
  }

  const items = input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number(item))
    .filter((value) => Number.isInteger(value) && value >= minValue);

  return items.length > 0 ? items : undefined;
}

export const recipientFilterInputSchema = z.object({
  userIdsCsv: z.string().optional(),
  regRecentDays: z.coerce.number().int().min(1).max(3650).optional(),
  regDateFrom: z.string().optional(),
  regDateTo: z.string().optional(),
  lastDayTMin: z.coerce.number().int().min(0).optional(),
  lastDayTMax: z.coerce.number().int().min(0).optional(),
  classesCsv: z.string().optional(),
  classExpireMode: z
    .enum(["all", "expired", "not_expired", "range", "more_than_days", "less_than_days"])
    .optional(),
  classExpireDays: z.coerce.number().int().min(1).max(3650).optional(),
  classExpireFrom: z.string().optional(),
  classExpireTo: z.string().optional(),
  nodeGroupsCsv: z.string().optional(),
  includeAdmin: z.boolean().optional(),
  enable: z.enum(["enabled", "disabled", "all"]).optional(),
});

const optionalTrimmedTextSchema = z
  .string()
  .trim()
  .max(255)
  .optional()
  .or(z.literal(""))
  .transform((value) => (value ? value : undefined));

export const userOverviewTableFilterInputSchema = z.object({
  userId: z.number().int().min(1).optional(),
  userNameLike: optionalTrimmedTextSchema,
  emailLike: optionalTrimmedTextSchema,
  classValue: z.number().int().min(0).optional(),
  nodeGroupValue: z.number().int().min(0).optional(),
  enable: z.enum(["enabled", "disabled", "all"]).optional(),
  isAdmin: z.enum(["all", "yes", "no"]).optional(),
});

export const userOverviewSortInputSchema = z.object({
  sortField: z
    .enum([
      "id",
      "user_name",
      "email",
      "reg_date",
      "last_day_t",
      "class",
      "class_expire",
      "node_group",
      "is_admin",
      "enable",
    ])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export function normalizeRecipientFilters(input: z.input<typeof recipientFilterInputSchema>) {
  const parsedInput = recipientFilterInputSchema.parse(input);

  return recipientFilterSchema.parse({
    userIds: splitNumericCsv(parsedInput.userIdsCsv, 1),
    regRecentDays: parsedInput.regRecentDays,
    regDateFrom: parsedInput.regDateFrom,
    regDateTo: parsedInput.regDateTo,
    lastDayTMin: parsedInput.lastDayTMin,
    lastDayTMax: parsedInput.lastDayTMax,
    classes: splitNumericCsv(parsedInput.classesCsv),
    classExpireMode: parsedInput.classExpireMode || "all",
    classExpireDays: parsedInput.classExpireDays,
    classExpireFrom: parsedInput.classExpireFrom,
    classExpireTo: parsedInput.classExpireTo,
    nodeGroups: splitNumericCsv(parsedInput.nodeGroupsCsv),
    includeAdmin: parsedInput.includeAdmin ?? false,
    enable: parsedInput.enable || "enabled",
  });
}

export function normalizeUserOverviewTableFilters(input?: z.input<typeof userOverviewTableFilterInputSchema>) {
  const parsed = userOverviewTableFilterInputSchema.parse(input || {});

  return {
    userId: parsed.userId,
    userNameLike: parsed.userNameLike,
    emailLike: parsed.emailLike,
    classValue: parsed.classValue,
    nodeGroupValue: parsed.nodeGroupValue,
    enable: parsed.enable || "all",
    isAdmin: parsed.isAdmin || "all",
  } satisfies UserOverviewTableFilters;
}

export function normalizeUserOverviewSort(input?: z.input<typeof userOverviewSortInputSchema>) {
  const parsed = userOverviewSortInputSchema.parse(input || {});

  return {
    sortField: parsed.sortField || "id",
    sortOrder: parsed.sortOrder || "desc",
  } satisfies {
    sortField: UserOverviewSortField;
    sortOrder: UserOverviewSortOrder;
  };
}

function buildWhereClause(filters: RecipientFilters, options?: { requireValidEmail?: boolean }) {
  const requireValidEmail = options?.requireValidEmail ?? true;
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (requireValidEmail) {
    clauses.push("email IS NOT NULL", "email <> ''", "email LIKE '%@%'");
  }

  if (filters.userIds?.length) {
    clauses.push(`id IN (${filters.userIds.map(() => "?").join(",")})`);
    params.push(...filters.userIds);
  }

  if (!filters.includeAdmin) {
    clauses.push("is_admin = 0");
  }

  if (filters.enable === "enabled") {
    clauses.push("enable = 1");
  } else if (filters.enable === "disabled") {
    clauses.push("enable = 0");
  }

  if (filters.regDateFrom) {
    clauses.push("reg_date >= ?");
    params.push(toStartOfDay(filters.regDateFrom));
  }

  if (typeof filters.regRecentDays === "number") {
    clauses.push("reg_date >= DATE_SUB(NOW(), INTERVAL ? DAY)");
    params.push(filters.regRecentDays);
  }

  if (filters.regDateTo) {
    clauses.push("reg_date <= ?");
    params.push(toEndOfDay(filters.regDateTo));
  }

  if (typeof filters.lastDayTMin === "number") {
    clauses.push("last_day_t >= ?");
    params.push(filters.lastDayTMin);
  }

  if (typeof filters.lastDayTMax === "number") {
    clauses.push("last_day_t <= ?");
    params.push(filters.lastDayTMax);
  }

  if (filters.classes?.length) {
    clauses.push(`class IN (${filters.classes.map(() => "?").join(",")})`);
    params.push(...filters.classes);
  }

  if (filters.classExpireMode === "expired") {
    clauses.push("class_expire < NOW()");
  } else if (filters.classExpireMode === "not_expired") {
    clauses.push("class_expire >= NOW()");
  } else if (filters.classExpireMode === "more_than_days") {
    clauses.push("class_expire > DATE_ADD(NOW(), INTERVAL ? DAY)");
    params.push(filters.classExpireDays || 0);
  } else if (filters.classExpireMode === "less_than_days") {
    clauses.push("class_expire >= NOW()");
    clauses.push("class_expire <= DATE_ADD(NOW(), INTERVAL ? DAY)");
    params.push(filters.classExpireDays || 0);
  } else if (filters.classExpireMode === "range") {
    if (filters.classExpireFrom) {
      clauses.push("class_expire >= ?");
      params.push(toStartOfDay(filters.classExpireFrom));
    }

    if (filters.classExpireTo) {
      clauses.push("class_expire <= ?");
      params.push(toEndOfDay(filters.classExpireTo));
    }
  }

  if (filters.nodeGroups?.length) {
    clauses.push(`node_group IN (${filters.nodeGroups.map(() => "?").join(",")})`);
    params.push(...filters.nodeGroups);
  }

  const whereSql = clauses.length > 0 ? clauses.join(" AND ") : "1=1";

  return {
    whereSql,
    params,
  };
}

function buildUserOverviewWhereClause(filters: RecipientFilters, tableFilters: UserOverviewTableFilters) {
  const base = buildWhereClause(filters, { requireValidEmail: true });
  const clauses = [base.whereSql];
  const params = [...base.params] as Array<string | number>;

  if (typeof tableFilters.userId === "number") {
    clauses.push("id = ?");
    params.push(tableFilters.userId);
  }

  if (tableFilters.userNameLike) {
    clauses.push("user_name LIKE ?");
    params.push(`%${tableFilters.userNameLike}%`);
  }

  if (tableFilters.emailLike) {
    clauses.push("email LIKE ?");
    params.push(`%${tableFilters.emailLike}%`);
  }

  if (typeof tableFilters.classValue === "number") {
    clauses.push("class = ?");
    params.push(tableFilters.classValue);
  }

  if (typeof tableFilters.nodeGroupValue === "number") {
    clauses.push("node_group = ?");
    params.push(tableFilters.nodeGroupValue);
  }

  if (tableFilters.enable === "enabled") {
    clauses.push("enable = 1");
  } else if (tableFilters.enable === "disabled") {
    clauses.push("enable = 0");
  }

  if (tableFilters.isAdmin === "yes") {
    clauses.push("is_admin = 1");
  } else if (tableFilters.isAdmin === "no") {
    clauses.push("is_admin = 0");
  }

  return {
    whereSql: clauses.filter(Boolean).join(" AND "),
    params,
  };
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function dedupeRecipients(rows: RecipientRow[]) {
  const map = new Map<string, RecipientRow>();

  for (const row of rows) {
    const normalized = normalizeEmail(row.email);

    if (!emailPattern.test(normalized)) {
      continue;
    }

    if (!map.has(normalized)) {
      map.set(normalized, {
        id: row.id,
        email: normalized,
        user_name: row.user_name,
      });
    }
  }

  return Array.from(map.values());
}

export async function previewRecipients(filters: RecipientFilters, sampleSize = 20) {
  const { whereSql, params } = buildWhereClause(filters, { requireValidEmail: true });

  const rows = await queryRows<RecipientRow>(
    `SELECT id, email, user_name FROM user WHERE ${whereSql} ORDER BY id DESC LIMIT ?`,
    [...params, sampleSize],
  );

  const countRows = await queryRows<{ total: number }>(
    `SELECT COUNT(DISTINCT LOWER(TRIM(email))) AS total FROM user WHERE ${whereSql}`,
    params,
  );

  return {
    total: Number(countRows[0]?.total || 0),
    sample: dedupeRecipients(rows),
  };
}

export async function listRecipients(filters: RecipientFilters) {
  const { whereSql, params } = buildWhereClause(filters, { requireValidEmail: true });

  const rows = await queryRows<RecipientRow>(
    `SELECT id, email, user_name FROM user WHERE ${whereSql} ORDER BY id ASC`,
    params,
  );

  return dedupeRecipients(rows);
}

export async function queryUserOverview(input: {
  filters: RecipientFilters;
  tableFilters: UserOverviewTableFilters;
  page?: number;
  pageSize?: number;
  sortField?: UserOverviewSortField;
  sortOrder?: UserOverviewSortOrder;
}) {
  const safePage = Math.max(Math.floor(input.page || 1), 1);
  const requestedPageSize = Number(input.pageSize || 20);
  const safePageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;
  const offset = (safePage - 1) * safePageSize;
  const safeSortField: UserOverviewSortField = input.sortField || "id";
  const safeSortOrder: UserOverviewSortOrder = input.sortOrder === "asc" ? "asc" : "desc";
  const orderByFieldMap: Record<UserOverviewSortField, string> = {
    id: "id",
    user_name: "user_name",
    email: "email",
    reg_date: "reg_date",
    last_day_t: "last_day_t",
    class: "`class`",
    class_expire: "class_expire",
    node_group: "node_group",
    is_admin: "is_admin",
    enable: "enable",
  };
  const orderBySql = orderByFieldMap[safeSortField];
  const orderDirectionSql = safeSortOrder === "asc" ? "ASC" : "DESC";
  const tieBreakerSql = safeSortField === "id" ? "" : `, id ${orderDirectionSql}`;
  const { whereSql, params } = buildUserOverviewWhereClause(input.filters, input.tableFilters);

  const rows = await queryRows<UserOverviewRow>(
    `
      SELECT
        id,
        user_name,
        email,
        reg_date,
        last_day_t,
        class,
        class_expire,
        node_group,
        is_admin,
        enable
      FROM user
      WHERE ${whereSql}
      ORDER BY ${orderBySql} ${orderDirectionSql}${tieBreakerSql}
      LIMIT ?
      OFFSET ?
    `,
    [...params, safePageSize, offset],
  );

  const countRows = await queryRows<{ total: number }>(
    `SELECT COUNT(*) AS total FROM user WHERE ${whereSql}`,
    params,
  );

  return {
    total: Number(countRows[0]?.total || 0),
    page: safePage,
    pageSize: safePageSize,
    sortField: safeSortField,
    sortOrder: safeSortOrder,
    rows,
  };
}
