import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listSystemLogs } from "@/lib/log-repo";

const payloadSchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  source: z.enum(["all", "campaign", "direct"]).optional(),
  status: z.enum(["all", "success", "failed"]).optional(),
  emailLike: z.string().max(255).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const payload = payloadSchema.parse(await request.json());
    const result = await listSystemLogs({
      limit: payload.limit || 100,
      source: payload.source || "all",
      status: payload.status || "all",
      emailLike: payload.emailLike,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "参数错误" },
        { status: 400 },
      );
    }

    const message = error instanceof Error ? error.message : "获取日志失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
