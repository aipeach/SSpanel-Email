let initialized = false;
let apiKey = "";
let fromEmail = "";
let fromName = "";

function initializeResend() {
  if (initialized) {
    return;
  }

  apiKey = process.env.RESEND_API_KEY?.trim() || "";
  fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || process.env.SENDGRID_FROM_EMAIL?.trim() || "";
  fromName = process.env.RESEND_FROM_NAME?.trim() || process.env.SENDGRID_FROM_NAME?.trim() || "SSPanel";

  if (!apiKey) {
    throw new Error("RESEND_API_KEY 未配置");
  }

  if (!fromEmail) {
    throw new Error("RESEND_FROM_EMAIL 未配置");
  }

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
