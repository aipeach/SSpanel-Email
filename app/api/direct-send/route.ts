import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildEmailContent } from "@/lib/email-content";
import { normalizeMailProvider, sendOneEmail } from "@/lib/mail-provider";
import { recordDirectSendLog } from "@/lib/log-repo";

const payloadSchema = z.object({
  toEmail: z.string().trim().email("收件邮箱格式不正确").max(255, "收件邮箱过长").optional(),
  toEmails: z
    .array(z.string().trim().email("收件邮箱格式不正确").max(255, "收件邮箱过长"))
    .min(1, "收件邮箱不能为空")
    .max(500, "单次最多发送 500 个邮箱")
    .optional(),
  userName: z.string().trim().max(128, "用户名过长").optional(),
  subject: z.string().trim().min(1, "主题不能为空").max(255, "主题过长"),
  mailProvider: z.enum(["sendgrid", "resend"]).optional(),
  contentFormat: z.enum(["html", "markdown"]).default("html"),
  htmlContent: z.string().optional(),
  markdownContent: z.string().optional(),
  textContent: z.string().optional(),
}).superRefine((value, ctx) => {
  const hasSingle = Boolean(value.toEmail?.trim());
  const hasBatch = Array.isArray(value.toEmails) && value.toEmails.length > 0;

  if (!hasSingle && !hasBatch) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["toEmails"],
      message: "请至少提供一个收件邮箱",
    });
  }
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
  try {
    const payload = payloadSchema.parse(await request.json());
    const content = buildEmailContent({
      contentFormat: payload.contentFormat,
      htmlContent: payload.htmlContent,
      markdownContent: payload.markdownContent,
      textContent: payload.textContent,
    });
    const mailProvider = normalizeMailProvider(payload.mailProvider);
    const recipientSet = new Set<string>();
    const recipients: string[] = [];

    if (payload.toEmail) {
      const email = payload.toEmail.trim();
      const dedupeKey = email.toLowerCase();

      if (email && !recipientSet.has(dedupeKey)) {
        recipientSet.add(dedupeKey);
        recipients.push(email);
      }
    }

    for (const email of payload.toEmails || []) {
      const trimmed = email.trim();
      const dedupeKey = trimmed.toLowerCase();

      if (trimmed && !recipientSet.has(dedupeKey)) {
        recipientSet.add(dedupeKey);
        recipients.push(trimmed);
      }
    }

    const results: Array<{
      toEmail: string;
      userName: string;
      status: "success" | "failed";
      messageId: string | null;
      errorMessage: string | null;
    }> = [];

    for (const toEmail of recipients) {
      const userName = deriveUserName(toEmail, payload.userName);

      try {
        const messageId = await sendOneEmail({
          mailProvider,
          toEmail,
          userName,
          subject: payload.subject,
          htmlContent: content.htmlContent,
          textContent: content.textContent,
        });

        await recordDirectSendLog({
          toEmail,
          userName,
          subject: payload.subject,
          mailProvider,
          contentFormat: payload.contentFormat,
          status: "success",
          providerMessageId: messageId,
        });

        results.push({
          toEmail,
          userName,
          status: "success",
          messageId,
          errorMessage: null,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "发送失败";

        try {
          await recordDirectSendLog({
            toEmail,
            userName,
            subject: payload.subject,
            mailProvider,
            contentFormat: payload.contentFormat,
            status: "failed",
            errorMessage,
          });
        } catch {
          // 日志写入失败不影响主流程返回。
        }

        results.push({
          toEmail,
          userName,
          status: "failed",
          messageId: null,
          errorMessage,
        });
      }
    }

    const total = results.length;
    const successCount = results.filter((item) => item.status === "success").length;
    const failedCount = total - successCount;
    const firstMessageId = results.find((item) => item.status === "success")?.messageId || null;

    return NextResponse.json(
      {
        ok: failedCount === 0,
        total,
        successCount,
        failedCount,
        messageId: firstMessageId,
        results,
      },
      { status: failedCount === 0 ? 200 : 207 },
    );
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

    const message = error instanceof Error ? error.message : "发送失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
