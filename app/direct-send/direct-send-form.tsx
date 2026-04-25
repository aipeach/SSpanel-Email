"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ContentFormat = "html" | "markdown";
type MailProvider = "sendgrid" | "resend" | "smtp";

type MailProvidersResponse = {
  providers: MailProvider[];
  defaultProvider: MailProvider | null;
  labels: Record<MailProvider, string>;
  error?: string;
};

function parseEmailsInput(raw: string) {
  const emailSet = new Set<string>();
  const emails: string[] = [];
  const chunks = raw
    .split(/[\n,;，；\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  for (const email of chunks) {
    const dedupeKey = email.toLowerCase();

    if (!emailSet.has(dedupeKey)) {
      emailSet.add(dedupeKey);
      emails.push(email);
    }
  }

  return emails;
}

export function DirectSendForm() {
  const [toEmailsText, setToEmailsText] = useState("");
  const [userName, setUserName] = useState("");
  const [subject, setSubject] = useState("");
  const [mailProvider, setMailProvider] = useState<MailProvider>("sendgrid");
  const [availableProviders, setAvailableProviders] = useState<MailProvider[]>([]);
  const [providerLabels, setProviderLabels] = useState<Record<MailProvider, string>>({
    sendgrid: "SendGrid",
    resend: "Resend",
    smtp: "SMTP",
  });
  const [contentFormat, setContentFormat] = useState<ContentFormat>("html");
  const [htmlContent, setHtmlContent] = useState("");
  const [markdownContent, setMarkdownContent] = useState("");
  const [textContent, setTextContent] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadMailProviders() {
      try {
        const response = await fetch("/api/mail-providers", { method: "GET" });
        const payload = (await response.json()) as MailProvidersResponse;

        if (!response.ok) {
          if (alive) {
            setError(payload.error || "加载发件渠道失败");
          }
          return;
        }

        if (!alive) {
          return;
        }

        const providers = payload.providers || [];
        setProviderLabels(payload.labels || { sendgrid: "SendGrid", resend: "Resend", smtp: "SMTP" });
        setAvailableProviders(providers);

        if (providers.length === 0) {
          setError("未配置可用发件渠道，请先在 .env 配置 SendGrid、Resend 或 SMTP 参数");
          return;
        }

        setError("");

        const preferredProvider =
          (payload.defaultProvider && providers.includes(payload.defaultProvider) && payload.defaultProvider) ||
          providers[0];

        setMailProvider(preferredProvider);
      } catch {
        if (alive) {
          setError("加载发件渠道失败，请稍后重试");
        }
      }
    }

    void loadMailProviders();

    return () => {
      alive = false;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/direct-send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          toEmails: parseEmailsInput(toEmailsText),
          userName,
          subject,
          mailProvider,
          contentFormat,
          htmlContent: contentFormat === "html" ? htmlContent : undefined,
          markdownContent: contentFormat === "markdown" ? markdownContent : undefined,
          textContent,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        total?: number;
        successCount?: number;
        failedCount?: number;
        messageId?: string | null;
        results?: Array<{
          toEmail: string;
          status: "success" | "failed";
          messageId: string | null;
          errorMessage: string | null;
        }>;
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error || "发送失败");
        return;
      }

      const total = payload.total || 0;
      const successCount = payload.successCount || 0;
      const failedCount = payload.failedCount || 0;
      const summary = `总计 ${total}，成功 ${successCount}，失败 ${failedCount}（渠道 ${providerLabels[mailProvider] || mailProvider}）`;

      if (failedCount > 0) {
        const failedEmails = (payload.results || [])
          .filter((item) => item.status === "failed")
          .map((item) => item.toEmail);
        const preview = failedEmails.slice(0, 5).join("、");
        const suffix = failedEmails.length > 5 ? " 等" : "";
        setError(`部分发送失败：${summary}${preview ? `；失败邮箱：${preview}${suffix}` : ""}`);
      } else {
        if (payload.messageId && total === 1) {
          setNotice(`发送成功：${summary}，Message ID: ${payload.messageId}`);
        } else {
          setNotice(`发送成功：${summary}`);
        }
      }
    } catch {
      setError("发送失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  const hasContent = contentFormat === "html" ? htmlContent.trim().length > 0 : markdownContent.trim().length > 0;
  const recipientCount = parseEmailsInput(toEmailsText).length;
  const hasProvider = availableProviders.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>直接发送邮件</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="toEmails">收件邮箱（支持多个）</Label>
            <Textarea
              id="toEmails"
              rows={4}
              value={toEmailsText}
              onChange={(event) => setToEmailsText(event.target.value)}
              placeholder={"支持换行或逗号分隔，例如：\nuser1@example.com\nuser2@example.com"}
              required
            />
            <p className="text-xs text-slate-500">已识别收件人：{recipientCount}</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="userName">收件用户名（可选，批量时会统一使用）</Label>
            <Input
              id="userName"
              value={userName}
              onChange={(event) => setUserName(event.target.value)}
              placeholder="不填默认取邮箱前缀"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="subject">邮件主题</Label>
            <Input id="subject" value={subject} onChange={(event) => setSubject(event.target.value)} required />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="mailProvider">发件渠道</Label>
            <Select
              id="mailProvider"
              value={mailProvider}
              onChange={(event) => setMailProvider(event.target.value as MailProvider)}
              disabled={!hasProvider}
            >
              {availableProviders.map((provider) => (
                <option key={provider} value={provider}>
                  {providerLabels[provider] || provider}
                </option>
              ))}
            </Select>
            {!hasProvider ? <p className="text-xs text-rose-600">未检测到可用发件渠道，请检查 .env 配置</p> : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contentFormat">内容格式</Label>
            <Select
              id="contentFormat"
              value={contentFormat}
              onChange={(event) => setContentFormat(event.target.value as ContentFormat)}
            >
              <option value="html">HTML</option>
              <option value="markdown">Markdown</option>
            </Select>
          </div>

          {contentFormat === "html" ? (
            <div className="grid gap-2">
              <Label htmlFor="htmlContent">HTML 内容</Label>
              <Textarea
                id="htmlContent"
                rows={10}
                value={htmlContent}
                onChange={(event) => setHtmlContent(event.target.value)}
                placeholder="例如：<h1>你好 {{user_name}}</h1>"
                required
              />
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="markdownContent">Markdown 内容</Label>
              <Textarea
                id="markdownContent"
                rows={10}
                value={markdownContent}
                onChange={(event) => setMarkdownContent(event.target.value)}
                placeholder="# 你好 {{user_name}}"
                required
              />
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="textContent">纯文本内容（可选，不填自动生成）</Label>
            <Textarea id="textContent" rows={5} value={textContent} onChange={(event) => setTextContent(event.target.value)} />
          </div>

          {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
          {notice ? <p className="rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700">{notice}</p> : null}

          <Button
            type="submit"
            disabled={submitting || recipientCount === 0 || !subject || !hasContent || !hasProvider}
            className="w-fit"
          >
            {submitting ? "发送中..." : "立即发送"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
