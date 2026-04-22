"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type CampaignItem = {
  id: number;
  subject: string;
  recipient_count: number;
  status: "draft" | "sending" | "done" | "failed" | "partial" | "stopped";
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

function statusBadgeVariant(status: CampaignItem["status"]) {
  if (status === "done") return "success" as const;
  if (status === "sending") return "warning" as const;
  if (status === "failed") return "destructive" as const;
  return "secondary" as const;
}

function statusText(status: CampaignItem["status"]) {
  if (status === "draft") return "草稿";
  if (status === "sending") return "发送中";
  if (status === "done") return "已完成";
  if (status === "failed") return "失败";
  if (status === "partial") return "部分成功";
  return "已停止";
}

export function CampaignListClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/campaigns", {
          method: "GET",
        });

        const payload = (await response.json()) as {
          campaigns?: CampaignItem[];
          error?: string;
        };

        if (!response.ok) {
          setError(payload.error || "加载失败");
          return;
        }

        setCampaigns(payload.campaigns || []);
      } catch {
        setError("加载失败，请稍后重试");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  if (loading) {
    return <p className="text-sm text-slate-500">加载中...</p>;
  }

  if (error) {
    return <p className="text-sm font-medium text-rose-600">{error}</p>;
  }

  if (!campaigns.length) {
    return (
      <div className="grid gap-3">
        <p className="text-sm text-slate-500">暂无任务，先去创建一个。</p>
        <Button asChild className="w-fit">
          <Link href="/campaigns/new">创建邮件任务</Link>
        </Button>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>主题</TableHead>
          <TableHead>人数</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>创建时间</TableHead>
          <TableHead>详情</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {campaigns.map((campaign) => (
          <TableRow key={campaign.id}>
            <TableCell>{campaign.id}</TableCell>
            <TableCell className="max-w-sm truncate">{campaign.subject}</TableCell>
            <TableCell>{campaign.recipient_count}</TableCell>
            <TableCell>
              <Badge variant={statusBadgeVariant(campaign.status)}>{statusText(campaign.status)}</Badge>
            </TableCell>
            <TableCell>{new Date(campaign.created_at).toLocaleString()}</TableCell>
            <TableCell>
              <Button asChild size="sm" variant="secondary">
                <Link href={`/campaigns/${campaign.id}`}>查看</Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
