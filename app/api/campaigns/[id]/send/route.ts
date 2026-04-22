import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CampaignSendError, sendCampaignById } from "@/lib/campaign-sender";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const payloadSchema = z.object({
  ratePerMinute: z.number().int().min(1).max(100_000).optional(),
});

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const campaignId = Number(id);

  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    return NextResponse.json({ error: "无效任务 ID" }, { status: 400 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const payload = payloadSchema.parse(body);

    const summary = await sendCampaignById(campaignId, payload.ratePerMinute);

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "参数错误" },
        { status: 400 },
      );
    }

    if (error instanceof CampaignSendError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "发送失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
