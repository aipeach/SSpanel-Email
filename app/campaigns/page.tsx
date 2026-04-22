import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CampaignListClient } from "./campaign-list-client";

export default function CampaignListPage() {
  return (
    <AppShell
      title="邮件任务列表"
      description="查看任务状态、收件规模与发送进度。"
      actions={
        <Button asChild>
          <Link href="/campaigns/new">创建新任务</Link>
        </Button>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>任务记录</CardTitle>
        </CardHeader>
        <CardContent>
          <CampaignListClient />
        </CardContent>
      </Card>
    </AppShell>
  );
}
