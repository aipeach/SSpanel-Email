import { AppShell } from "@/components/layout/app-shell";
import { SettingsClient } from "./settings-client";

export default function SettingsPage() {
  return (
    <AppShell
      title="编辑配置"
      description="仅支持编辑发件策略、SendGrid、Resend、SMTP。读取优先级：.env > SQLite 回退配置。"
    >
      <SettingsClient />
    </AppShell>
  );
}
