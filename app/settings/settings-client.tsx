"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type ConfigFieldType = "text" | "password" | "number" | "select";
type ConfigSource = "env" | "sqlite" | "unset";

type ConfigOption = {
  label: string;
  value: string;
};

type ConfigItem = {
  key: string;
  label: string;
  description: string;
  group: string;
  type: ConfigFieldType;
  placeholder?: string;
  options?: ConfigOption[];
  value: string;
  source: ConfigSource;
};

type SettingsResponse = {
  settings?: ConfigItem[];
  note?: string;
  error?: string;
};

function sourceLabel(source: ConfigSource) {
  if (source === "env") {
    return "env（优先）";
  }

  if (source === "sqlite") {
    return "sqlite";
  }

  return "未设置";
}

function sourceVariant(source: ConfigSource) {
  if (source === "env") {
    return "warning" as const;
  }

  if (source === "sqlite") {
    return "success" as const;
  }

  return "secondary" as const;
}

export function SettingsClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [note, setNote] = useState("");
  const [settings, setSettings] = useState<ConfigItem[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});

  async function loadSettings(silent = false) {
    if (!silent) {
      setLoading(true);
    }

    setError("");

    try {
      const response = await fetch("/api/settings", { method: "GET", cache: "no-store" });
      const payload = (await response.json()) as SettingsResponse;

      if (!response.ok) {
        setError(payload.error || "加载配置失败");
        return;
      }

      const nextSettings = payload.settings || [];
      setSettings(nextSettings);
      setValues(
        Object.fromEntries(nextSettings.map((item) => [item.key, item.value || ""])),
      );
      setNote(payload.note || "");
    } catch {
      setError("加载配置失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  const groupedSettings = useMemo(() => {
    const map = new Map<string, ConfigItem[]>();

    for (const item of settings) {
      if (!map.has(item.group)) {
        map.set(item.group, []);
      }

      map.get(item.group)!.push(item);
    }

    return Array.from(map.entries());
  }, [settings]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values }),
      });

      const payload = (await response.json()) as SettingsResponse;

      if (!response.ok) {
        setError(payload.error || "保存失败");
        return;
      }

      setNotice(payload.note || "保存成功");
      await loadSettings(true);
    } catch {
      setError("保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">加载中...</p>;
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      {note ? (
        <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">{note}</p>
      ) : null}

      {groupedSettings.map(([group, items]) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle>{group}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {items.map((item) => (
              <div key={item.key} className="grid gap-2 rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Label htmlFor={item.key}>{item.label}</Label>
                  <Badge variant={sourceVariant(item.source)}>{sourceLabel(item.source)}</Badge>
                </div>

                <p className="text-xs text-slate-500">{item.description}</p>

                {item.type === "select" ? (
                  <Select
                    id={item.key}
                    value={values[item.key] ?? ""}
                    onChange={(event) =>
                      setValues((prev) => ({
                        ...prev,
                        [item.key]: event.target.value,
                      }))
                    }
                  >
                    <option value="">（清空）</option>
                    {(item.options || []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    id={item.key}
                    type={item.type}
                    placeholder={item.placeholder}
                    value={values[item.key] ?? ""}
                    onChange={(event) =>
                      setValues((prev) => ({
                        ...prev,
                        [item.key]: event.target.value,
                      }))
                    }
                  />
                )}

                {item.source === "env" ? (
                  <p className="text-xs text-amber-600">当前值来自 .env，SQLite 同名配置将被覆盖。</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
      {notice ? <p className="rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700">{notice}</p> : null}

      <Button type="submit" disabled={saving} className="w-fit">
        {saving ? "保存中..." : "保存配置"}
      </Button>
    </form>
  );
}

