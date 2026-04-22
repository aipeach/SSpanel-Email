"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ContentFormat = "html" | "markdown";
type MailProvider = "sendgrid" | "resend";

export function DirectSendForm() {
  const [toEmail, setToEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [subject, setSubject] = useState("");
  const [mailProvider, setMailProvider] = useState<MailProvider>("sendgrid");
  const [contentFormat, setContentFormat] = useState<ContentFormat>("html");
  const [htmlContent, setHtmlContent] = useState("");
  const [markdownContent, setMarkdownContent] = useState("");
  const [textContent, setTextContent] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
          toEmail,
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
        messageId?: string | null;
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error || "发送失败");
        return;
      }

      if (payload.messageId) {
        setNotice(`发送成功（渠道 ${mailProvider}），Message ID: ${payload.messageId}`);
      } else {
        setNotice(`发送成功（渠道 ${mailProvider}）`);
      }
    } catch {
      setError("发送失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  const hasContent = contentFormat === "html" ? htmlContent.trim().length > 0 : markdownContent.trim().length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>直接发送邮件</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="toEmail">收件邮箱</Label>
            <Input
              id="toEmail"
              type="email"
              value={toEmail}
              onChange={(event) => setToEmail(event.target.value)}
              placeholder="user@example.com"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="userName">收件用户名（可选）</Label>
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
            >
              <option value="sendgrid">SendGrid</option>
              <option value="resend">Resend</option>
            </Select>
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

          <Button type="submit" disabled={submitting || !toEmail || !subject || !hasContent} className="w-fit">
            {submitting ? "发送中..." : "立即发送"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
