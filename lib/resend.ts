import { getConfigValue } from "@/lib/runtime-config";

let initialized = false;
let currentSignature = "";
let apiKey = "";
let fromEmail = "";
let fromName = "";

function initializeResend() {
  const nextApiKey = getConfigValue("RESEND_API_KEY")?.trim() || "";
  const nextFromEmail =
    getConfigValue("RESEND_FROM_EMAIL")?.trim() || getConfigValue("SENDGRID_FROM_EMAIL")?.trim() || "";
  const nextFromName =
    getConfigValue("RESEND_FROM_NAME")?.trim() || getConfigValue("SENDGRID_FROM_NAME")?.trim() || "SSPanel";
  const nextSignature = `${nextApiKey}|${nextFromEmail}|${nextFromName}`;

  if (!nextApiKey) {
    throw new Error("RESEND_API_KEY 未配置");
  }

  if (!nextFromEmail) {
    throw new Error("RESEND_FROM_EMAIL 未配置");
  }

  if (initialized && currentSignature === nextSignature) {
    return;
  }

  apiKey = nextApiKey;
  fromEmail = nextFromEmail;
  fromName = nextFromName;
  currentSignature = nextSignature;
  initialized = true;
}

export async function sendViaResend(input: {
  toEmail: string;
  subject: string;
  htmlContent: string;
  textContent: string;
}) {
  initializeResend();

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
      to: [input.toEmail],
      subject: input.subject,
      html: input.htmlContent,
      text: input.textContent,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    name?: string;
    error?: {
      message?: string;
      name?: string;
    };
  };

  if (!response.ok) {
    const errorMessage =
      payload.error?.message || payload.message || `Resend 发送失败（HTTP ${response.status}）`;
    throw new Error(errorMessage);
  }

  return payload.id || null;
}
