import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createCampaign, listCampaigns } from "@/lib/campaign-repo";
import { buildEmailContent } from "@/lib/email-content";
import { listRecipients, normalizeRecipientFilters } from "@/lib/recipient-filters";

const createCampaignSchema = z.object({
  subject: z.string().trim().min(1, "主题不能为空").max(255, "主题过长"),
  contentFormat: z.enum(["html", "markdown"]).optional(),
  htmlContent: z.string().optional(),
  markdownContent: z.string().optional(),
  textContent: z.string().optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  try {
    const campaigns = await listCampaigns(100);
    return NextResponse.json({ ok: true, campaigns });
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取任务列表失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = createCampaignSchema.parse(await request.json());
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

    const campaign = await createCampaign({
      subject: payload.subject,
      htmlContent: content.htmlContent,
      textContent: content.textContent,
      filters,
      recipients,
    });

    return NextResponse.json({ ok: true, campaign });
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

    const message = error instanceof Error ? error.message : "创建任务失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
