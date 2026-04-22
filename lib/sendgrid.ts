import sgMail from "@sendgrid/mail";

let initialized = false;
let fromEmail = "";
let fromName = "";

function initializeSendGrid() {
  if (initialized) {
    return;
  }

  const apiKey = process.env.SENDGRID_API_KEY;
  fromEmail = process.env.SENDGRID_FROM_EMAIL || "";
  fromName = process.env.SENDGRID_FROM_NAME || "SSPanel";

  if (!apiKey) {
    throw new Error("SENDGRID_API_KEY 未配置");
  }

  if (!fromEmail) {
    throw new Error("SENDGRID_FROM_EMAIL 未配置");
  }

  sgMail.setApiKey(apiKey);
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
