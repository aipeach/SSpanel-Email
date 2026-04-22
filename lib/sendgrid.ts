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

export async function sendOneEmail(input: {
  toEmail: string;
  userName: string;
  subject: string;
  htmlContent: string;
  textContent?: string | null;
}) {
  initializeSendGrid();

  const personalizedSubject = replaceUserNameTemplate(input.subject, input.userName);
  const personalizedHtml = replaceUserNameTemplate(input.htmlContent, input.userName);
  const personalizedText = input.textContent
    ? replaceUserNameTemplate(input.textContent, input.userName)
    : htmlToText(personalizedHtml);

  const [response] = await sgMail.send({
    to: input.toEmail,
    from: {
      email: fromEmail,
      name: fromName,
    },
    subject: personalizedSubject,
    html: personalizedHtml,
    text: personalizedText,
  });

  const messageId = response.headers["x-message-id"];
  return typeof messageId === "string" ? messageId : null;
}
