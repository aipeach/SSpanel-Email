import { NextRequest, NextResponse } from "next/server";
import { CampaignSendError, stopCampaignById } from "@/lib/campaign-sender";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const campaignId = Number(id);

  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    return NextResponse.json({ error: "无效任务 ID" }, { status: 400 });
  }

  try {
    const summary = await stopCampaignById(campaignId);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    if (error instanceof CampaignSendError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "停止任务失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
