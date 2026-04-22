import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  normalizeRecipientFilters,
  normalizeUserOverviewSort,
  normalizeUserOverviewTableFilters,
  queryUserOverview,
} from "@/lib/recipient-filters";

const payloadSchema = z.object({
  filters: z.unknown().optional(),
  tableFilters: z.unknown().optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().optional(),
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

export async function POST(request: NextRequest) {
  try {
    const payload = payloadSchema.parse(await request.json());
    const filters = normalizeRecipientFilters((payload.filters || {}) as Record<string, unknown>);
    const tableFilters = normalizeUserOverviewTableFilters(
      (payload.tableFilters || {}) as Record<string, unknown>,
    );
    const sort = normalizeUserOverviewSort({
      sortField: payload.sortField,
      sortOrder: payload.sortOrder,
    });
    const result = await queryUserOverview({
      filters,
      tableFilters,
      page: payload.page || 1,
      pageSize: payload.pageSize || 20,
      sortField: sort.sortField,
      sortOrder: sort.sortOrder,
    });

    return NextResponse.json({
      ok: true,
      filters,
      tableFilters,
      sort,
      ...result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "参数错误" },
        { status: 400 },
      );
    }

    const message = error instanceof Error ? error.message : "查询用户失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
