import { AppShell } from "@/components/layout/app-shell";
import { SettingsClient } from "./settings-client";

export default function SettingsPage() {
  return (
    <AppShell
      title="编辑配置"
      description="运行时读取优先级：.env > SQLite 配置。这里保存的是 SQLite 回退配置。"
    >
      <SettingsClient />
    </AppShell>
  );
}

