import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteDraftCampaign,
  getCampaignDetail,
  updateDraftCampaign,
} from "@/lib/campaign-repo";
import { buildEmailContent } from "@/lib/email-content";
import { listRecipients, normalizeRecipientFilters } from "@/lib/recipient-filters";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const updateCampaignSchema = z.object({
  subject: z.string().trim().min(1, "主题不能为空").max(255, "主题过长"),
  contentFormat: z.enum(["html", "markdown"]).optional(),
  htmlContent: z.string().optional(),
  markdownContent: z.string().optional(),
  textContent: z.string().optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
});

async function parseCampaignId(context: RouteContext) {
  const { id } = await context.params;
  const campaignId = Number(id);

  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    return null;
  }

  return campaignId;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const campaignId = await parseCampaignId(context);

  if (!campaignId) {
    return NextResponse.json({ error: "无效任务 ID" }, { status: 400 });
  }

  try {
    const campaign = await getCampaignDetail(campaignId);

    if (!campaign) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, campaign });
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取任务详情失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const campaignId = await parseCampaignId(context);

  if (!campaignId) {
    return NextResponse.json({ error: "无效任务 ID" }, { status: 400 });
  }

  try {
    const payload = updateCampaignSchema.parse(await request.json());
    const filters = normalizeRecipientFilters(payload.filters || {});
    const recipients = await listRecipients(filters);
    const content = buildEmailContent({
      contentFormat: payload.contentFormat || "html",
      htmlContent: payload.htmlContent,
      markdownContent: payload.markdownContent,
      textContent: payload.textContent,
    });

    if (recipients.length === 0) {
      return NextResponse.json({ error: "筛选结果为空，没有可发送用户" }, { status: 400 });
    }

    const result = await updateDraftCampaign({
      campaignId,
      subject: payload.subject,
      htmlContent: content.htmlContent,
      textContent: content.textContent,
      filters,
      recipients,
    });

    if (result === "not_found") {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    if (result === "invalid_status") {
      return NextResponse.json({ error: "仅草稿任务可编辑" }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      campaign: {
        id: campaignId,
        recipientCount: recipients.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "参数错误" },
        { status: 400 },
      );
    }

    if (
      error instanceof Error &&
      (error.message === "HTML 内容不能为空" || error.message === "Markdown 内容不能为空")
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "更新任务失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const campaignId = await parseCampaignId(context);

  if (!campaignId) {
    return NextResponse.json({ error: "无效任务 ID" }, { status: 400 });
  }

  try {
    const result = await deleteDraftCampaign(campaignId);

    if (result === "not_found") {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    if (result === "invalid_status") {
      return NextResponse.json({ error: "仅草稿任务可删除" }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除任务失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
