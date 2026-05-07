import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildEmailContent } from "@/lib/email-content";
import { appendMailFooter } from "@/lib/email-footer";

const payloadSchema = z.object({
  contentFormat: z.enum(["html", "markdown"]).default("html"),
  htmlContent: z.string().optional(),
  markdownContent: z.string().optional(),
  textContent: z.string().optional(),
  userName: z.string().trim().max(128).optional(),
});

function replaceUserNameTemplate(content: string, userName: string) {
  return content.replace(/{{\s*user_name\s*}}/g, userName);
}

export async function POST(request: NextRequest) {
  try {
    const payload = payloadSchema.parse(await request.json());
    const content = buildEmailContent({
      contentFormat: payload.contentFormat,
      htmlContent: payload.htmlContent,
      markdownContent: payload.markdownContent,
      textContent: payload.textContent,
    });

    const previewUserName = payload.userName || "demo_user";
    const personalizedHtml = replaceUserNameTemplate(content.htmlContent, previewUserName);
    const personalizedText = replaceUserNameTemplate(content.textContent, previewUserName);
    const withFooter = appendMailFooter(personalizedHtml, personalizedText);

    return NextResponse.json({
      ok: true,
      htmlContent: withFooter.htmlContent,
      textContent: withFooter.textContent,
      previewUserName,
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

    const message = error instanceof Error ? error.message : "预览失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
