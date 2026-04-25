"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type SystemLogRow = {
  id: string;
  source: "campaign" | "direct";
  sourceRecordId: number;
  campaignId: number | null;
  mailProvider: "sendgrid" | "resend" | "smtp" | null;
  toEmail: string;
  userName: string;
  subject: string;
  status: "success" | "failed";
  providerMessageId: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type LogsResponse = {
  total: number;
  logs: SystemLogRow[];
  error?: string;
};

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function sourceLabel(source: SystemLogRow["source"]) {
  return source === "campaign" ? "任务发送" : "直接发送";
}

function providerLabel(provider: SystemLogRow["mailProvider"]) {
  if (provider === "resend") {
    return "Resend";
  }

  if (provider === "smtp") {
    return "SMTP";
  }

  if (provider === "sendgrid") {
    return "SendGrid";
  }

  return "-";
}

function statusVariant(status: SystemLogRow["status"]) {
  return status === "success" ? ("success" as const) : ("destructive" as const);
}

function statusLabel(status: SystemLogRow["status"]) {
  return status === "success" ? "成功" : "失败";
}

export function LogsClient() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [logs, setLogs] = useState<SystemLogRow[]>([]);

  const [limit, setLimit] = useState("100");
  const [source, setSource] = useState("all");
  const [status, setStatus] = useState("all");
  const [emailLike, setEmailLike] = useState("");

  async function loadLogs(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          limit: Number(limit),
          source,
          status,
          emailLike,
        }),
      });

      const payload = (await response.json()) as LogsResponse;

      if (!response.ok) {
        setError(payload.error || "获取日志失败");
        return;
      }

      setTotal(payload.total || 0);
      setLogs(payload.logs || []);
    } catch {
      setError("获取日志失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-4">
      <form className="grid gap-3 lg:grid-cols-4" onSubmit={loadLogs}>
        <Select value={limit} onChange={(event) => setLimit(event.target.value)}>
          <option value="50">最近 50 条</option>
          <option value="100">最近 100 条</option>
          <option value="200">最近 200 条</option>
        </Select>

        <Select value={source} onChange={(event) => setSource(event.target.value)}>
          <option value="all">来源：全部</option>
          <option value="campaign">来源：任务发送</option>
          <option value="direct">来源：直接发送</option>
        </Select>

        <Select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">状态：全部</option>
          <option value="success">状态：成功</option>
          <option value="failed">状态：失败</option>
        </Select>

        <Input value={emailLike} onChange={(event) => setEmailLike(event.target.value)} placeholder="邮箱模糊筛选（可选）" />

        <div className="lg:col-span-4">
          <Button type="submit" disabled={loading}>
            {loading ? "加载中..." : "查询日志"}
          </Button>
        </div>
      </form>

      {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}

      <p className="text-sm text-slate-600">当前展示日志数：{total}</p>

      {logs.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>来源</TableHead>
              <TableHead>渠道</TableHead>
              <TableHead>收件邮箱</TableHead>
              <TableHead>用户名</TableHead>
              <TableHead>主题</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>任务</TableHead>
              <TableHead>消息ID</TableHead>
              <TableHead>错误信息</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>{formatDateTime(log.createdAt)}</TableCell>
                <TableCell>{sourceLabel(log.source)}</TableCell>
                <TableCell>{providerLabel(log.mailProvider)}</TableCell>
                <TableCell>{log.toEmail}</TableCell>
                <TableCell>{log.userName}</TableCell>
                <TableCell className="max-w-xs truncate">{log.subject}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(log.status)}>{statusLabel(log.status)}</Badge>
                </TableCell>
                <TableCell>
                  {log.campaignId ? (
                    <Link href={`/campaigns/${log.campaignId}`} className="text-sky-700 hover:underline">
                      #{log.campaignId}
                    </Link>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell className="max-w-xs break-all">{log.providerMessageId || "-"}</TableCell>
                <TableCell className="max-w-xs break-all">{log.errorMessage || "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-sm text-slate-500">暂无日志</p>
      )}
    </div>
  );
}
