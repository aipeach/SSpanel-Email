import { sendViaResend } from "@/lib/resend";
import { sendViaSendGrid } from "@/lib/sendgrid";

export type MailProvider = "sendgrid" | "resend";

const MAIL_PROVIDERS = ["sendgrid", "resend"] as const;

function replaceUserNameTemplate(content: string, userName: string) {
  return content.replace(/{{\s*user_name\s*}}/g, userName);
}

function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeMailProvider(input?: string | null) {
  if (input && MAIL_PROVIDERS.includes(input as MailProvider)) {
    return input as MailProvider;
  }

  const fromEnv = process.env.DEFAULT_MAIL_PROVIDER?.trim();

  if (fromEnv && MAIL_PROVIDERS.includes(fromEnv as MailProvider)) {
    return fromEnv as MailProvider;
  }

  return "sendgrid" satisfies MailProvider;
}

export async function sendOneEmail(input: {
  mailProvider: MailProvider;
  toEmail: string;
  userName: string;
  subject: string;
  htmlContent: string;
  textContent?: string | null;
}) {
  const personalizedSubject = replaceUserNameTemplate(input.subject, input.userName);
  const personalizedHtml = replaceUserNameTemplate(input.htmlContent, input.userName);
  const personalizedText = input.textContent
    ? replaceUserNameTemplate(input.textContent, input.userName)
    : htmlToText(personalizedHtml);

  if (input.mailProvider === "resend") {
    return sendViaResend({
      toEmail: input.toEmail,
      subject: personalizedSubject,
      htmlContent: personalizedHtml,
      textContent: personalizedText,
    });
  }

  return sendViaSendGrid({
    toEmail: input.toEmail,
    subject: personalizedSubject,
    htmlContent: personalizedHtml,
    textContent: personalizedText,
  });
}
