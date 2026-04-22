import { marked } from "marked";

export type EmailContentFormat = "html" | "markdown";

function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function markdownToHtml(markdown: string) {
  const result = marked.parse(markdown, {
    async: false,
    breaks: true,
    gfm: true,
  });

  return typeof result === "string" ? result : String(result);
}

export function buildEmailContent(input: {
  contentFormat: EmailContentFormat;
  htmlContent?: string;
  markdownContent?: string;
  textContent?: string;
}) {
  const normalizedTextContent = input.textContent?.trim();

  if (input.contentFormat === "html") {
    const html = input.htmlContent?.trim();

    if (!html) {
      throw new Error("HTML 内容不能为空");
    }

    return {
      htmlContent: html,
      textContent: normalizedTextContent || htmlToText(html),
    };
  }

  const markdown = input.markdownContent?.trim();

  if (!markdown) {
    throw new Error("Markdown 内容不能为空");
  }

  const html = markdownToHtml(markdown);

  return {
    htmlContent: html,
    textContent: normalizedTextContent || htmlToText(html),
  };
}
