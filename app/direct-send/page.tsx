import { AppShell } from "@/components/layout/app-shell";
import { DirectSendForm } from "./direct-send-form";

export default function DirectSendPage() {
  return (
    <AppShell title="直接发送" description="支持输入一个或多个收件邮箱，并立即发送。">
      <DirectSendForm />
    </AppShell>
  );
}
