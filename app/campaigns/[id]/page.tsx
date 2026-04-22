import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { CampaignDetailClient } from "./campaign-detail-client";

type CampaignDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function CampaignDetailPage({ params }: CampaignDetailPageProps) {
  const { id } = await params;
  const campaignId = Number(id);

  return (
    <AppShell
      title="任务详情"
      description="查看发送统计、队列处理状态与最近收件记录。"
      actions={
        <Button asChild variant="secondary">
          <Link href="/campaigns">返回任务列表</Link>
        </Button>
      }
    >
      {Number.isInteger(campaignId) && campaignId > 0 ? (
        <CampaignDetailClient campaignId={campaignId} />
      ) : (
        <p className="text-sm font-medium text-rose-600">无效任务 ID</p>
      )}
    </AppShell>
  );
}
