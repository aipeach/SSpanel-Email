import sgMail from "@sendgrid/mail";
import { getConfigValue } from "@/lib/runtime-config";

let initialized = false;
let currentSignature = "";
let fromEmail = "";
let fromName = "";

function initializeSendGrid() {
  const apiKey = getConfigValue("SENDGRID_API_KEY")?.trim() || "";
  const nextFromEmail = getConfigValue("SENDGRID_FROM_EMAIL")?.trim() || "";
  const nextFromName = getConfigValue("SENDGRID_FROM_NAME")?.trim() || "SSPanel";
  const nextSignature = `${apiKey}|${nextFromEmail}|${nextFromName}`;

  if (!apiKey) {
    throw new Error("SENDGRID_API_KEY 未配置");
  }

  if (!nextFromEmail) {
    throw new Error("SENDGRID_FROM_EMAIL 未配置");
  }

  if (initialized && currentSignature === nextSignature) {
    return;
  }

  fromEmail = nextFromEmail;
  fromName = nextFromName;
  sgMail.setApiKey(apiKey);
  currentSignature = nextSignature;
  initialized = true;
}

export async function sendViaSendGrid(input: {
  toEmail: string;
  subject: string;
  htmlContent: string;
  textContent: string;
}) {
  initializeSendGrid();

  const [response] = await sgMail.send({
    to: input.toEmail,
    from: {
      email: fromEmail,
      name: fromName,
    },
    subject: input.subject,
    html: input.htmlContent,
    text: input.textContent,
  });

  const messageId = response.headers["x-message-id"];
  return typeof messageId === "string" ? messageId : null;
}
