import { AppShell } from "@/components/layout/app-shell";
import { DirectSendForm } from "./direct-send-form";

export default function DirectSendPage() {
  return (
    <AppShell title="直接发送" description="输入单个收件邮箱与邮件内容，立即发送。">
      <DirectSendForm />
    </AppShell>
  );
}
