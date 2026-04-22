import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { normalizeRecipientFilters, previewRecipients } from "@/lib/recipient-filters";

const payloadSchema = z.object({
  filters: z.unknown().optional(),
  sampleSize: z.number().int().min(1).max(100).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const payload = payloadSchema.parse(await request.json());
    const filters = normalizeRecipientFilters((payload.filters || {}) as Record<string, unknown>);
    const result = await previewRecipients(filters, payload.sampleSize || 20);

    return NextResponse.json({
      ok: true,
      filters,
      ...result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "参数错误" },
        { status: 400 },
      );
    }

    const message = error instanceof Error ? error.message : "预览失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
