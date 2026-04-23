import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectionStatusClient } from "./connection-status-client";

export default function ConnectionStatusPage() {
  return (
    <AppShell title="连接状态" description="查看 MySQL 与 SQLite 队列数据库的实时连接状态。">
      <Card>
        <CardHeader>
          <CardTitle>数据库连接状态</CardTitle>
        </CardHeader>
        <CardContent>
          <ConnectionStatusClient />
        </CardContent>
      </Card>
    </AppShell>
  );
}

