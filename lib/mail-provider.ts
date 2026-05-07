import { sendViaResend } from "@/lib/resend";
import { sendViaSendGrid } from "@/lib/sendgrid";
import { sendViaSmtp } from "@/lib/smtp";
import { getConfigValue } from "@/lib/runtime-config";

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
  const apiKey = getConfigValue("SENDGRID_API_KEY")?.trim();
  const fromEmail = getConfigValue("SENDGRID_FROM_EMAIL")?.trim();
  return Boolean(apiKey && fromEmail);
}

function hasResendConfig() {
  const apiKey = getConfigValue("RESEND_API_KEY")?.trim();
  const fromEmail = getConfigValue("RESEND_FROM_EMAIL")?.trim() || getConfigValue("SENDGRID_FROM_EMAIL")?.trim();
  return Boolean(apiKey && fromEmail);
}

function hasSmtpConfig() {
  const host = getConfigValue("SMTP_HOST")?.trim();
  const port = getConfigValue("SMTP_PORT")?.trim();
  const user = getConfigValue("SMTP_USER")?.trim();
  const pass = getConfigValue("SMTP_PASS")?.trim();
  const fromEmail = getConfigValue("SMTP_FROM_EMAIL")?.trim();
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

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getConfiguredFooter() {
  const name = getConfigValue("MAIL_FOOTER_NAME")?.trim() || "";
  const link = getConfigValue("MAIL_FOOTER_LINK")?.trim() || "";

  if (!name || !link) {
    return null;
  }

  try {
    const url = new URL(link);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return {
      name,
      link: url.toString(),
    };
  } catch {
    return null;
  }
}

function appendFooter(htmlContent: string, textContent: string) {
  const footer = getConfiguredFooter();

  if (!footer) {
    return { htmlContent, textContent };
  }

  const safeName = escapeHtml(footer.name);
  const safeHref = escapeHtml(footer.link);
  const footerHtml = `<p style="margin-top:24px;font-size:14px;line-height:1.6;color:#64748b;">—— <a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="color:#3b82f6;text-decoration:underline;">${safeName}</a></p>`;
  const footerText = `\n\n—— ${footer.name}\n${footer.link}`;

  return {
    htmlContent: `${htmlContent}${footerHtml}`,
    textContent: `${textContent}${footerText}`,
  };
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

  const fromEnv = getConfigValue("DEFAULT_MAIL_PROVIDER")?.trim();

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
  const withFooter = appendFooter(personalizedHtml, personalizedText);

  if (!isMailProviderAvailable(input.mailProvider)) {
    throw new MailProviderConfigError(`${mailProviderLabel(input.mailProvider)} 渠道未配置`, 400);
  }

  if (input.mailProvider === "resend") {
    return sendViaResend({
      toEmail: input.toEmail,
      subject: personalizedSubject,
      htmlContent: withFooter.htmlContent,
      textContent: withFooter.textContent,
    });
  }

  if (input.mailProvider === "smtp") {
    return sendViaSmtp({
      toEmail: input.toEmail,
      subject: personalizedSubject,
      htmlContent: withFooter.htmlContent,
      textContent: withFooter.textContent,
    });
  }

  return sendViaSendGrid({
    toEmail: input.toEmail,
    subject: personalizedSubject,
    htmlContent: withFooter.htmlContent,
    textContent: withFooter.textContent,
  });
}
