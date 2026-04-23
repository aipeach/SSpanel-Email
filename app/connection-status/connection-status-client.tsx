"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ServiceStatus = {
  status: "ok" | "error";
  latencyMs: number;
  message: string;
  details: Record<string, unknown>;
};

type ConnectionStatusResponse = {
  ok: boolean;
  checkedAt: string;
  process: {
    nodeVersion: string;
    envTZ: string | null;
    resolvedTimeZone: string | null;
    now: string;
  };
  mysql: ServiceStatus;
  sqlite: ServiceStatus;
};

function statusVariant(status: "ok" | "error") {
  return status === "ok" ? ("success" as const) : ("destructive" as const);
}

function statusText(status: "ok" | "error") {
  return status === "ok" ? "正常" : "异常";
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatDetailValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function ServiceCard({ title, data }: { title: string; data: ServiceStatus }) {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>{title}</span>
          <Badge variant={statusVariant(data.status)}>{statusText(data.status)}</Badge>
        </CardTitle>
        <p className="text-sm text-slate-600">延迟：{data.latencyMs} ms</p>
        <p className="text-sm text-slate-600">说明：{data.message || "-"}</p>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-2 text-sm">
          {Object.entries(data.details).map(([key, value]) => (
            <div key={key} className="grid grid-cols-[160px_1fr] gap-2">
              <dt className="text-slate-500">{key}</dt>
              <dd className="break-all text-slate-900">{formatDetailValue(value)}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

export function ConnectionStatusClient() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<ConnectionStatusResponse | null>(null);

  async function loadStatus(silent = false) {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const response = await fetch("/api/connection-status", { method: "GET", cache: "no-store" });
      const result = (await response.json()) as ConnectionStatusResponse & { error?: string };

      if (!response.ok) {
        setError(result.error || "获取连接状态失败");
        return;
      }

      setPayload(result);
    } catch {
      setError("获取连接状态失败，请稍后重试");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadStatus();

    const timer = setInterval(() => {
      void loadStatus(true);
    }, 10000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  if (loading && !payload) {
    return <p className="text-sm text-slate-500">加载中...</p>;
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
        <div className="space-y-1 text-sm">
          <p className="text-slate-700">
            总体状态：
            <Badge className="ml-2" variant={payload?.ok ? "success" : "destructive"}>
              {payload?.ok ? "正常" : "异常"}
            </Badge>
          </p>
          <p className="text-slate-600">最近检查：{payload ? formatDateTime(payload.checkedAt) : "-"}</p>
          <p className="text-slate-600">服务端时区：{payload?.process.resolvedTimeZone || "-"}</p>
          <p className="text-slate-600">环境变量 TZ：{payload?.process.envTZ || "-"}</p>
          <p className="text-slate-600">服务端当前时间：{payload ? formatDateTime(payload.process.now) : "-"}</p>
        </div>

        <Button
          type="button"
          variant="secondary"
          disabled={refreshing}
          onClick={() => {
            void loadStatus(true);
          }}
        >
          {refreshing ? "刷新中..." : "手动刷新"}
        </Button>
      </div>

      {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}

      {payload ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <ServiceCard title="MySQL 连接状态" data={payload.mysql} />
          <ServiceCard title="SQLite 队列状态" data={payload.sqlite} />
        </div>
      ) : null}
    </div>
  );
}

