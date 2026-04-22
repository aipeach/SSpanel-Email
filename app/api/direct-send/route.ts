import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildEmailContent } from "@/lib/email-content";
import { normalizeMailProvider, sendOneEmail } from "@/lib/mail-provider";
import { recordDirectSendLog } from "@/lib/log-repo";

const payloadSchema = z.object({
  toEmail: z.string().trim().email("收件邮箱格式不正确").max(255, "收件邮箱过长"),
  userName: z.string().trim().max(128, "用户名过长").optional(),
  subject: z.string().trim().min(1, "主题不能为空").max(255, "主题过长"),
  mailProvider: z.enum(["sendgrid", "resend"]).optional(),
  contentFormat: z.enum(["html", "markdown"]).default("html"),
  htmlContent: z.string().optional(),
  markdownContent: z.string().optional(),
  textContent: z.string().optional(),
});

function deriveUserName(toEmail: string, rawUserName: string | undefined) {
  const userName = rawUserName?.trim();

  if (userName) {
    return userName;
  }

  const atIndex = toEmail.indexOf("@");

  if (atIndex > 0) {
    return toEmail.slice(0, atIndex);
  }

  return toEmail;
}

export async function POST(request: NextRequest) {
  let parsedPayload: z.infer<typeof payloadSchema> | null = null;

  try {
    const payload = payloadSchema.parse(await request.json());
    parsedPayload = payload;
    const content = buildEmailContent({
      contentFormat: payload.contentFormat,
      htmlContent: payload.htmlContent,
      markdownContent: payload.markdownContent,
      textContent: payload.textContent,
    });
    const userName = deriveUserName(payload.toEmail, payload.userName);
    const mailProvider = normalizeMailProvider(payload.mailProvider);

    const messageId = await sendOneEmail({
      mailProvider,
      toEmail: payload.toEmail,
      userName,
      subject: payload.subject,
      htmlContent: content.htmlContent,
      textContent: content.textContent,
    });

    await recordDirectSendLog({
      toEmail: payload.toEmail,
      userName,
      subject: payload.subject,
      mailProvider,
      contentFormat: payload.contentFormat,
      status: "success",
      providerMessageId: messageId,
    });

    return NextResponse.json({
      ok: true,
      messageId,
    });
  } catch (error) {
    if (parsedPayload) {
      try {
        await recordDirectSendLog({
          toEmail: parsedPayload.toEmail,
          userName: deriveUserName(parsedPayload.toEmail, parsedPayload.userName),
          subject: parsedPayload.subject,
          mailProvider: normalizeMailProvider(parsedPayload.mailProvider),
          contentFormat: parsedPayload.contentFormat,
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "发送失败",
        });
      } catch {
        // 日志写入失败不影响主流程返回。
      }
    }

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

    const message = error instanceof Error ? error.message : "发送失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
