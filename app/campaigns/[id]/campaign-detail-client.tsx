"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type MailProvider = "sendgrid" | "resend" | "smtp";

type MailProvidersResponse = {
  providers: MailProvider[];
  defaultProvider: MailProvider | null;
  labels: Record<MailProvider, string>;
  error?: string;
};

type CampaignDetail = {
  id: number;
  subject: string;
  html_content: string;
  text_content: string | null;
  filter_json: unknown;
  recipient_count: number;
  status: "draft" | "sending" | "done" | "failed" | "partial" | "stopped";
  send_provider: MailProvider;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  stats: {
    pending: number;
    success: number;
    failed: number;
  };
  sampleRecipients: Array<{
    id: number;
    user_id: number;
    email: string;
    user_name: string;
    send_status: "pending" | "success" | "failed";
    provider_message_id: string | null;
    error_message: string | null;
    sent_at: string | null;
  }>;
};

type CampaignDetailClientProps = {
  campaignId: number;
};

type SendSummary = {
  campaignId: number;
  jobId: number;
  alreadyQueued: boolean;
  queuedCount: number;
  ratePerMinute: number;
  mailProvider: MailProvider;
  usedDefaultRate: boolean;
  usedDefaultProvider: boolean;
};

function statusVariant(status: CampaignDetail["status"]) {
  if (status === "done") return "success" as const;
  if (status === "sending") return "warning" as const;
  if (status === "failed") return "destructive" as const;
  return "secondary" as const;
}

function statusText(status: CampaignDetail["status"]) {
  if (status === "draft") return "草稿";
  if (status === "sending") return "发送中";
  if (status === "done") return "已完成";
  if (status === "failed") return "失败";
  if (status === "partial") return "部分成功";
  return "已停止";
}

function formatFilterJson(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return "{}";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function CampaignDetailClient({ campaignId }: CampaignDetailClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [providerError, setProviderError] = useState("");
  const [notice, setNotice] = useState("");
  const [ratePerMinuteInput, setRatePerMinuteInput] = useState("");
  const [mailProvider, setMailProvider] = useState<MailProvider>("sendgrid");
  const [availableProviders, setAvailableProviders] = useState<MailProvider[]>([]);
  const [providerLabels, setProviderLabels] = useState<Record<MailProvider, string>>({
    sendgrid: "SendGrid",
    resend: "Resend",
    smtp: "SMTP",
  });
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);

  const loadCampaign = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const response = await fetch(`/api/campaigns/${campaignId}`);
      const payload = (await response.json()) as {
        campaign?: CampaignDetail;
        error?: string;
      };

      if (!response.ok) {
        if (!silent) {
          setError(payload.error || "加载失败");
        }
        return;
      }

      setCampaign(payload.campaign || null);
    } catch {
      if (!silent) {
        setError("加载失败，请稍后重试");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [campaignId]);

  useEffect(() => {
    void loadCampaign();
  }, [loadCampaign]);

  useEffect(() => {
    if (!campaign || campaign.status !== "sending") {
      return;
    }

    const timer = setInterval(() => {
      void loadCampaign(true);
    }, 5000);

    return () => {
      clearInterval(timer);
    };
  }, [campaign, loadCampaign]);

  useEffect(() => {
    let alive = true;

    async function loadMailProviders() {
      try {
        const response = await fetch("/api/mail-providers", { method: "GET" });
        const payload = (await response.json()) as MailProvidersResponse;

        if (!response.ok) {
          if (alive) {
            setProviderError(payload.error || "加载发件渠道失败");
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
          setProviderError("未检测到可用发件渠道，请先在 .env 配置 SendGrid、Resend 或 SMTP 参数");
          return;
        }

        setProviderError("");
      } catch {
        if (alive) {
          setProviderError("加载发件渠道失败，请稍后重试");
        }
      }
    }

    void loadMailProviders();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!campaign) {
      return;
    }

    if (availableProviders.includes(campaign.send_provider)) {
      setMailProvider(campaign.send_provider);
      return;
    }

    if (availableProviders.length > 0) {
      setMailProvider(availableProviders[0]);
    }
  }, [campaign, availableProviders]);

  async function onSendNow() {
    setSending(true);
    setError("");
    setNotice("");

    const rawRate = ratePerMinuteInput.trim();
    let ratePerMinute: number | undefined;

    if (rawRate) {
      const parsed = Number(rawRate);

      if (!Number.isInteger(parsed) || parsed <= 0) {
        setError("发送速率必须是大于 0 的整数");
        setSending(false);
        return;
      }

      ratePerMinute = parsed;
    }

    if (!availableProviders.includes(mailProvider)) {
      setError("当前发件渠道不可用，请检查 .env 配置");
      setSending(false);
      return;
    }

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ratePerMinute,
          mailProvider,
        }),
      });

      const payload = (await response.json()) as {
        summary?: SendSummary;
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error || "发送失败");
        return;
      }

      const summary = payload.summary;

      if (summary) {
        const queueAction = summary.alreadyQueued ? "已有任务在队列中，已触发继续处理" : "已加入异步队列";
        const rateLabel = summary.usedDefaultRate ? `默认速率 ${summary.ratePerMinute}` : `本次速率 ${summary.ratePerMinute}`;
        const providerLabel = summary.usedDefaultProvider
          ? `默认渠道 ${providerLabels[summary.mailProvider] || summary.mailProvider}`
          : `本次渠道 ${providerLabels[summary.mailProvider] || summary.mailProvider}`;
        setNotice(`${queueAction}（Job #${summary.jobId}，待处理 ${summary.queuedCount}，${rateLabel} 封/分钟，${providerLabel}）`);
      }

      await loadCampaign(true);
    } catch {
      setError("发送失败，请稍后重试");
    } finally {
      setSending(false);
    }
  }

  async function onStopNow() {
    setStopping(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/stop`, {
        method: "POST",
      });

      const payload = (await response.json()) as {
        summary?: {
          jobId: number;
          pending: number;
        };
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error || "停止失败");
        return;
      }

      if (payload.summary) {
        setNotice(`已请求停止任务（Job #${payload.summary.jobId}，剩余待处理 ${payload.summary.pending}）`);
      } else {
        setNotice("已请求停止任务");
      }

      await loadCampaign(true);
    } catch {
      setError("停止失败，请稍后重试");
    } finally {
      setStopping(false);
    }
  }

  async function onDeleteDraft() {
    const confirmed = window.confirm("确认删除该草稿任务吗？删除后不可恢复。");

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: "DELETE",
      });

      const payload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error || "删除失败");
        return;
      }

      router.push("/campaigns");
      router.refresh();
    } catch {
      setError("删除失败，请稍后重试");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">加载中...</p>;
  }

  if (error) {
    return <p className="text-sm font-medium text-rose-600">{error}</p>;
  }

  if (!campaign) {
    return <p className="text-sm text-slate-500">任务不存在</p>;
  }

  const canSendNow =
    campaign.status === "draft" ||
    campaign.status === "failed" ||
    campaign.status === "partial" ||
    campaign.status === "stopped";
  const canStopNow = campaign.status === "sending";
  const canEditDraft = campaign.status === "draft";
  const hasProvider = availableProviders.length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>任务信息</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-sm text-slate-700">主题：{campaign.subject}</p>
          <p className="text-sm text-slate-700">
            状态：<Badge variant={statusVariant(campaign.status)}>{statusText(campaign.status)}</Badge>
          </p>
          <p className="text-sm text-slate-700">收件人数：{campaign.recipient_count}</p>
          <p className="text-sm text-slate-700">创建时间：{new Date(campaign.created_at).toLocaleString()}</p>
          <p className="text-sm text-slate-700">开始时间：{campaign.started_at ? new Date(campaign.started_at).toLocaleString() : "-"}</p>
          <p className="text-sm text-slate-700">完成时间：{campaign.finished_at ? new Date(campaign.finished_at).toLocaleString() : "-"}</p>
          <p className="text-sm text-slate-700">失败信息：{campaign.error_message || "-"}</p>
          <p className="text-sm text-slate-700">发送模式：异步队列（SQLite）</p>
          <p className="text-sm text-slate-700">
            当前发件渠道：{providerLabels[campaign.send_provider] || campaign.send_provider}
          </p>

          {canSendNow ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="ratePerMinute">发送速率（封/分钟，可选）</Label>
                <Input
                  id="ratePerMinute"
                  type="number"
                  min={1}
                  value={ratePerMinuteInput}
                  onChange={(event) => setRatePerMinuteInput(event.target.value)}
                  placeholder="留空使用默认速率"
                />
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
                {providerError ? <p className="text-xs text-rose-600">{providerError}</p> : null}
              </div>

              <Button
                type="button"
                disabled={sending || !hasProvider}
                onClick={() => {
                  void onSendNow();
                }}
              >
                {sending ? "入队中..." : "开始发送"}
              </Button>
            </>
          ) : null}

          {canStopNow ? (
            <Button
              type="button"
              variant="destructive"
              disabled={stopping}
              onClick={() => {
                void onStopNow();
              }}
            >
              {stopping ? "停止中..." : "停止任务"}
            </Button>
          ) : null}

          {canEditDraft ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild type="button" variant="secondary">
                <Link href={`/campaigns/new?editId=${campaign.id}`}>编辑任务</Link>
              </Button>

              <Button
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={() => {
                  void onDeleteDraft();
                }}
              >
                {deleting ? "删除中..." : "删除任务"}
              </Button>
            </div>
          ) : null}

          {notice ? <p className="rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700">{notice}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>发送统计</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-slate-100 p-4">
            <p className="text-xs uppercase tracking-[0.1em] text-slate-500">Pending</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{campaign.stats.pending}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-4">
            <p className="text-xs uppercase tracking-[0.1em] text-emerald-600">Success</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-700">{campaign.stats.success}</p>
          </div>
          <div className="rounded-xl bg-rose-50 p-4">
            <p className="text-xs uppercase tracking-[0.1em] text-rose-600">Failed</p>
            <p className="mt-2 text-2xl font-semibold text-rose-700">{campaign.stats.failed}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>筛选快照</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs leading-6 text-slate-100">
            {formatFilterJson(campaign.filter_json)}
          </pre>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>收件记录（最近 50 条）</CardTitle>
        </CardHeader>
        <CardContent>
          {campaign.sampleRecipients.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>用户名</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>发送时间</TableHead>
                  <TableHead>错误</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaign.sampleRecipients.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.id}</TableCell>
                    <TableCell>{item.user_name}</TableCell>
                    <TableCell>{item.email}</TableCell>
                    <TableCell>{item.send_status}</TableCell>
                    <TableCell>{item.sent_at ? new Date(item.sent_at).toLocaleString() : "-"}</TableCell>
                    <TableCell>{item.error_message || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-slate-500">暂无收件记录</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
