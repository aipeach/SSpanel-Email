import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { UserOverview } from "./user-overview";

export default function DashboardPage() {
  return (
    <AppShell
      title="用户中心与发件控制台"
      description="查看用户高级筛选结果，创建邮件任务并通过异步队列发送。"
      actions={
        <>
          <Button asChild>
            <Link href="/campaigns/new">创建邮件任务</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/campaigns">任务列表</Link>
          </Button>
        </>
      }
    >
      <UserOverview />
    </AppShell>
  );
}
