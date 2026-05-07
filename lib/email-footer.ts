import { getConfigValue } from "@/lib/runtime-config";

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
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

export function appendMailFooter(htmlContent: string, textContent: string) {
  const footer = getConfiguredFooter();

  if (!footer) {
    return { htmlContent, textContent };
  }

  const safeName = escapeHtml(footer.name);
  const safeHref = escapeHtml(footer.link);
  const footerHtml = `<p style=\"margin-top:24px;font-size:14px;line-height:1.6;color:#64748b;\">—— <a href=\"${safeHref}\" target=\"_blank\" rel=\"noopener noreferrer\" style=\"color:#3b82f6;text-decoration:underline;\">${safeName}</a></p>`;
  const footerText = `\n\n—— ${footer.name}\n${footer.link}`;

  return {
    htmlContent: `${htmlContent}${footerHtml}`,
    textContent: `${textContent}${footerText}`,
  };
}
