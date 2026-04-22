import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogsClient } from "./logs-client";

export default function LogsPage() {
  return (
    <AppShell title="发送日志" description="查看任务发送与直接发送的邮件日志。">
      <Card>
        <CardHeader>
          <CardTitle>日志列表</CardTitle>
        </CardHeader>
        <CardContent>
          <LogsClient />
        </CardContent>
      </Card>
    </AppShell>
  );
}
