import nodemailer from "nodemailer";

let initialized = false;
let transporter: nodemailer.Transporter | null = null;
let fromEmail = "";
let fromName = "";

function parseSecureValue(value: string | undefined) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function initializeSmtp() {
  if (initialized) {
    return;
  }

  const host = process.env.SMTP_HOST?.trim() || "";
  const portRaw = process.env.SMTP_PORT?.trim() || "";
  const user = process.env.SMTP_USER?.trim() || "";
  const pass = process.env.SMTP_PASS?.trim() || "";
  const secure = parseSecureValue(process.env.SMTP_SECURE);

  fromEmail = process.env.SMTP_FROM_EMAIL?.trim() || "";
  fromName = process.env.SMTP_FROM_NAME?.trim() || "SSPanel";

  if (!host) {
    throw new Error("SMTP_HOST 未配置");
  }

  if (!portRaw) {
    throw new Error("SMTP_PORT 未配置");
  }

  const port = Number(portRaw);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("SMTP_PORT 配置无效");
  }

  if (!user) {
    throw new Error("SMTP_USER 未配置");
  }

  if (!pass) {
    throw new Error("SMTP_PASS 未配置");
  }

  if (!fromEmail) {
    throw new Error("SMTP_FROM_EMAIL 未配置");
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  initialized = true;
}

export async function sendViaSmtp(input: {
  toEmail: string;
  subject: string;
  htmlContent: string;
  textContent: string;
}) {
  initializeSmtp();

  if (!transporter) {
    throw new Error("SMTP transporter 初始化失败");
  }

  const info = await transporter.sendMail({
    to: input.toEmail,
    from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    subject: input.subject,
    html: input.htmlContent,
    text: input.textContent,
  });

  return info.messageId || null;
}

