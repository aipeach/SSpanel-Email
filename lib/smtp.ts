import nodemailer from "nodemailer";
import { getConfigValue } from "@/lib/runtime-config";

let initialized = false;
let currentSignature = "";
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
  const host = getConfigValue("SMTP_HOST")?.trim() || "";
  const portRaw = getConfigValue("SMTP_PORT")?.trim() || "";
  const user = getConfigValue("SMTP_USER")?.trim() || "";
  const pass = getConfigValue("SMTP_PASS")?.trim() || "";
  const secure = parseSecureValue(getConfigValue("SMTP_SECURE") || undefined);

  const nextFromEmail = getConfigValue("SMTP_FROM_EMAIL")?.trim() || "";
  const nextFromName = getConfigValue("SMTP_FROM_NAME")?.trim() || "SSPanel";

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

  if (!nextFromEmail) {
    throw new Error("SMTP_FROM_EMAIL 未配置");
  }

  const nextSignature = `${host}|${portRaw}|${secure ? "1" : "0"}|${user}|${pass}|${nextFromEmail}|${nextFromName}`;

  if (initialized && currentSignature === nextSignature) {
    return;
  }

  fromEmail = nextFromEmail;
  fromName = nextFromName;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  currentSignature = nextSignature;
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
