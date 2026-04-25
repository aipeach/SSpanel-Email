import { sendViaResend } from "@/lib/resend";
import { sendViaSendGrid } from "@/lib/sendgrid";
import { sendViaSmtp } from "@/lib/smtp";

export type MailProvider = "sendgrid" | "resend" | "smtp";

const MAIL_PROVIDERS = ["sendgrid", "resend", "smtp"] as const;

export class MailProviderConfigError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "MailProviderConfigError";
    this.status = status;
  }
}

function hasSendGridConfig() {
  const apiKey = process.env.SENDGRID_API_KEY?.trim();
  const fromEmail = process.env.SENDGRID_FROM_EMAIL?.trim();
  return Boolean(apiKey && fromEmail);
}

function hasResendConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || process.env.SENDGRID_FROM_EMAIL?.trim();
  return Boolean(apiKey && fromEmail);
}

function hasSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = process.env.SMTP_PORT?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const fromEmail = process.env.SMTP_FROM_EMAIL?.trim();
  return Boolean(host && port && user && pass && fromEmail);
}

function mailProviderLabel(provider: MailProvider) {
  if (provider === "sendgrid") {
    return "SendGrid";
  }

  if (provider === "resend") {
    return "Resend";
  }

  return "SMTP";
}

export function getAvailableMailProviders(): MailProvider[] {
  return MAIL_PROVIDERS.filter((provider) => {
    if (provider === "sendgrid") {
      return hasSendGridConfig();
    }

    if (provider === "resend") {
      return hasResendConfig();
    }

    return hasSmtpConfig();
  });
}

export function getMailProviderLabels() {
  return {
    sendgrid: "SendGrid",
    resend: "Resend",
    smtp: "SMTP",
  } satisfies Record<MailProvider, string>;
}

export function isMailProviderAvailable(provider: MailProvider) {
  return getAvailableMailProviders().includes(provider);
}

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
  const availableProviders = getAvailableMailProviders();

  if (availableProviders.length === 0) {
    throw new MailProviderConfigError(
      "未配置可用发件渠道，请在 .env 配置 SendGrid、Resend 或 SMTP 参数",
      400,
    );
  }

  if (input && MAIL_PROVIDERS.includes(input as MailProvider)) {
    const provider = input as MailProvider;

    if (!availableProviders.includes(provider)) {
      throw new MailProviderConfigError(`${mailProviderLabel(provider)} 渠道未配置`, 400);
    }

    return provider;
  }

  const fromEnv = process.env.DEFAULT_MAIL_PROVIDER?.trim();

  if (fromEnv && MAIL_PROVIDERS.includes(fromEnv as MailProvider)) {
    const provider = fromEnv as MailProvider;

    if (availableProviders.includes(provider)) {
      return provider;
    }
  }

  return availableProviders[0];
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

  if (!isMailProviderAvailable(input.mailProvider)) {
    throw new MailProviderConfigError(`${mailProviderLabel(input.mailProvider)} 渠道未配置`, 400);
  }

  if (input.mailProvider === "resend") {
    return sendViaResend({
      toEmail: input.toEmail,
      subject: personalizedSubject,
      htmlContent: personalizedHtml,
      textContent: personalizedText,
    });
  }

  if (input.mailProvider === "smtp") {
    return sendViaSmtp({
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
