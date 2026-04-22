"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type PreviewResponse = {
  total: number;
  sample: Array<{
    id: number;
    email: string;
    user_name: string;
  }>;
  error?: string;
};

type CampaignResponse = {
  campaign?: {
    id: number;
    recipientCount: number;
  };
  error?: string;
};

type StoredFilters = {
  userIds?: number[];
  regRecentDays?: number;
  regDateFrom?: string;
  regDateTo?: string;
  lastDayTMin?: number;
  lastDayTMax?: number;
  classes?: number[];
  classExpireMode?: "all" | "expired" | "not_expired" | "range" | "more_than_days" | "less_than_days";
  classExpireDays?: number;
  classExpireFrom?: string;
  classExpireTo?: string;
  nodeGroups?: number[];
  includeAdmin?: boolean;
  enable?: "enabled" | "disabled" | "all";
};

type CampaignDetailPayload = {
  id: number;
  subject: string;
  html_content: string;
  text_content: string | null;
  filter_json: string;
  recipient_count: number;
  status: "draft" | "sending" | "done" | "failed" | "partial" | "stopped";
};

type CampaignDetailResponse = {
  campaign?: CampaignDetailPayload;
  error?: string;
};

type ContentFormat = "html" | "markdown";
type TrafficUnit = "B" | "MB" | "GB";

type CampaignBuilderProps = {
  editCampaignId?: number;
};

function convertTrafficToBytes(value: string, unit: TrafficUnit) {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  const multiplier = unit === "GB" ? 1024 * 1024 * 1024 : unit === "MB" ? 1024 * 1024 : 1;
  return Math.floor(parsed * multiplier);
}

function formatBytesAsUnit(bytes: number | undefined, unit: TrafficUnit) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    return "";
  }

  const divisor = unit === "GB" ? 1024 * 1024 * 1024 : unit === "MB" ? 1024 * 1024 : 1;
  const converted = bytes / divisor;

  if (Number.isInteger(converted)) {
    return String(converted);
  }

  return converted.toFixed(4).replace(/\.?0+$/, "");
}

function buildFiltersPayload(input: {
  userIdsCsv: string;
  regRecentDays: string;
  regDateFrom: string;
  regDateTo: string;
  lastDayTMin: string;
  lastDayTMinUnit: TrafficUnit;
  lastDayTMax: string;
  lastDayTMaxUnit: TrafficUnit;
  classesCsv: string;
  classExpireMode: string;
  classExpireDays: string;
  classExpireFrom: string;
  classExpireTo: string;
  nodeGroupsCsv: string;
  includeAdmin: boolean;
  enable: string;
}) {
  return {
    userIdsCsv: input.userIdsCsv,
    regRecentDays: input.regRecentDays ? Number(input.regRecentDays) : undefined,
    regDateFrom: input.regDateFrom,
    regDateTo: input.regDateTo,
    lastDayTMin: convertTrafficToBytes(input.lastDayTMin, input.lastDayTMinUnit),
    lastDayTMax: convertTrafficToBytes(input.lastDayTMax, input.lastDayTMaxUnit),
    classesCsv: input.classesCsv,
    classExpireMode: input.classExpireMode,
    classExpireDays: input.classExpireDays ? Number(input.classExpireDays) : undefined,
    classExpireFrom: input.classExpireFrom,
    classExpireTo: input.classExpireTo,
    nodeGroupsCsv: input.nodeGroupsCsv,
    includeAdmin: input.includeAdmin,
    enable: input.enable,
  };
}

function toCsv(values: unknown) {
  if (!Array.isArray(values)) {
    return "";
  }

  const normalized = values
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0);

  return normalized.join(",");
}

function parseStoredFilters(filterJson: string) {
  try {
    const parsed = JSON.parse(filterJson) as StoredFilters;

    return {
      userIdsCsv: toCsv(parsed.userIds),
      regRecentDays: typeof parsed.regRecentDays === "number" ? String(parsed.regRecentDays) : "",
      regDateFrom: typeof parsed.regDateFrom === "string" ? parsed.regDateFrom : "",
      regDateTo: typeof parsed.regDateTo === "string" ? parsed.regDateTo : "",
      lastDayTMin: formatBytesAsUnit(parsed.lastDayTMin, "MB"),
      lastDayTMinUnit: "MB" as TrafficUnit,
      lastDayTMax: formatBytesAsUnit(parsed.lastDayTMax, "MB"),
      lastDayTMaxUnit: "MB" as TrafficUnit,
      classesCsv: toCsv(parsed.classes),
      classExpireMode:
        parsed.classExpireMode === "expired" ||
        parsed.classExpireMode === "not_expired" ||
        parsed.classExpireMode === "range" ||
        parsed.classExpireMode === "more_than_days" ||
        parsed.classExpireMode === "less_than_days"
          ? parsed.classExpireMode
          : "all",
      classExpireDays: typeof parsed.classExpireDays === "number" ? String(parsed.classExpireDays) : "",
      classExpireFrom: typeof parsed.classExpireFrom === "string" ? parsed.classExpireFrom : "",
      classExpireTo: typeof parsed.classExpireTo === "string" ? parsed.classExpireTo : "",
      nodeGroupsCsv: toCsv(parsed.nodeGroups),
      includeAdmin: Boolean(parsed.includeAdmin),
      enable: parsed.enable === "disabled" || parsed.enable === "all" ? parsed.enable : "enabled",
    };
  } catch {
    return {
      userIdsCsv: "",
      regRecentDays: "",
      regDateFrom: "",
      regDateTo: "",
      lastDayTMin: "",
      lastDayTMinUnit: "MB" as TrafficUnit,
      lastDayTMax: "",
      lastDayTMaxUnit: "MB" as TrafficUnit,
      classesCsv: "",
      classExpireMode: "all",
      classExpireDays: "",
      classExpireFrom: "",
      classExpireTo: "",
      nodeGroupsCsv: "",
      includeAdmin: false,
      enable: "enabled",
    };
  }
}

export function CampaignBuilder({ editCampaignId }: CampaignBuilderProps) {
  const router = useRouter();
  const isEditMode = useMemo(
    () => Number.isInteger(editCampaignId) && Number(editCampaignId) > 0,
    [editCampaignId],
  );

  const [loadingInitial, setLoadingInitial] = useState(Boolean(isEditMode));
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);

  const [subject, setSubject] = useState("");
  const [contentFormat, setContentFormat] = useState<ContentFormat>("html");
  const [htmlContent, setHtmlContent] = useState("");
  const [markdownContent, setMarkdownContent] = useState("");
  const [textContent, setTextContent] = useState("");

  const [userIdsCsv, setUserIdsCsv] = useState("");
  const [regRecentDays, setRegRecentDays] = useState("");
  const [regDateFrom, setRegDateFrom] = useState("");
  const [regDateTo, setRegDateTo] = useState("");
  const [lastDayTMin, setLastDayTMin] = useState("");
  const [lastDayTMinUnit, setLastDayTMinUnit] = useState<TrafficUnit>("MB");
  const [lastDayTMax, setLastDayTMax] = useState("");
  const [lastDayTMaxUnit, setLastDayTMaxUnit] = useState<TrafficUnit>("MB");
  const [classesCsv, setClassesCsv] = useState("");
  const [classExpireMode, setClassExpireMode] = useState("all");
  const [classExpireDays, setClassExpireDays] = useState("");
  const [classExpireFrom, setClassExpireFrom] = useState("");
  const [classExpireTo, setClassExpireTo] = useState("");
  const [nodeGroupsCsv, setNodeGroupsCsv] = useState("");
  const [includeAdmin, setIncludeAdmin] = useState(false);
  const [enable, setEnable] = useState("enabled");

  useEffect(() => {
    if (!isEditMode || !editCampaignId) {
      setLoadingInitial(false);
      return;
    }

    let alive = true;

    async function loadCampaign() {
      setLoadingInitial(true);
      setError("");

      try {
        const response = await fetch(`/api/campaigns/${editCampaignId}`);
        const payload = (await response.json()) as CampaignDetailResponse;

        if (!response.ok) {
          if (alive) {
            setError(payload.error || "加载任务失败");
          }
          return;
        }

        const campaign = payload.campaign;

        if (!campaign) {
          if (alive) {
            setError("任务不存在");
          }
          return;
        }

        if (campaign.status !== "draft") {
          if (alive) {
            setError("仅草稿任务可编辑");
          }
          return;
        }

        const storedFilters = parseStoredFilters(campaign.filter_json);

        if (!alive) {
          return;
        }

        setSubject(campaign.subject);
        setContentFormat("html");
        setHtmlContent(campaign.html_content || "");
        setMarkdownContent("");
        setTextContent(campaign.text_content || "");

        setUserIdsCsv(storedFilters.userIdsCsv);
        setRegRecentDays(storedFilters.regRecentDays);
        setRegDateFrom(storedFilters.regDateFrom);
        setRegDateTo(storedFilters.regDateTo);
        setLastDayTMin(storedFilters.lastDayTMin);
        setLastDayTMinUnit(storedFilters.lastDayTMinUnit);
        setLastDayTMax(storedFilters.lastDayTMax);
        setLastDayTMaxUnit(storedFilters.lastDayTMaxUnit);
        setClassesCsv(storedFilters.classesCsv);
        setClassExpireMode(storedFilters.classExpireMode);
        setClassExpireDays(storedFilters.classExpireDays);
        setClassExpireFrom(storedFilters.classExpireFrom);
        setClassExpireTo(storedFilters.classExpireTo);
        setNodeGroupsCsv(storedFilters.nodeGroupsCsv);
        setIncludeAdmin(storedFilters.includeAdmin);
        setEnable(storedFilters.enable);

        setPreview({
          total: campaign.recipient_count,
          sample: [],
        });
      } catch {
        if (alive) {
          setError("加载任务失败，请稍后重试");
        }
      } finally {
        if (alive) {
          setLoadingInitial(false);
        }
      }
    }

    void loadCampaign();

    return () => {
      alive = false;
    };
  }, [editCampaignId, isEditMode]);

  async function onPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoadingPreview(true);
    setError("");

    const filters = buildFiltersPayload({
      userIdsCsv,
      regRecentDays,
      regDateFrom,
      regDateTo,
      lastDayTMin,
      lastDayTMinUnit,
      lastDayTMax,
      lastDayTMaxUnit,
      classesCsv,
      classExpireMode,
      classExpireDays,
      classExpireFrom,
      classExpireTo,
      nodeGroupsCsv,
      includeAdmin,
      enable,
    });

    try {
      const response = await fetch("/api/recipients/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filters,
          sampleSize: 20,
        }),
      });

      const result = (await response.json()) as PreviewResponse;

      if (!response.ok) {
        setError(result.error || "预览失败");
        return;
      }

      setPreview(result);
    } catch {
      setError("预览失败，请检查网络或后端日志");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function onSaveCampaign() {
    setLoadingCreate(true);
    setError("");

    const filters = buildFiltersPayload({
      userIdsCsv,
      regRecentDays,
      regDateFrom,
      regDateTo,
      lastDayTMin,
      lastDayTMinUnit,
      lastDayTMax,
      lastDayTMaxUnit,
      classesCsv,
      classExpireMode,
      classExpireDays,
      classExpireFrom,
      classExpireTo,
      nodeGroupsCsv,
      includeAdmin,
      enable,
    });

    const endpoint = isEditMode && editCampaignId ? `/api/campaigns/${editCampaignId}` : "/api/campaigns";
    const method = isEditMode ? "PATCH" : "POST";

    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject,
          contentFormat,
          htmlContent: contentFormat === "html" ? htmlContent : undefined,
          markdownContent: contentFormat === "markdown" ? markdownContent : undefined,
          textContent,
          filters,
        }),
      });

      const result = (await response.json()) as CampaignResponse;

      if (!response.ok) {
        setError(result.error || (isEditMode ? "更新任务失败" : "创建任务失败"));
        return;
      }

      const campaignId = result.campaign?.id || editCampaignId;

      if (!campaignId) {
        setError(isEditMode ? "更新任务失败：未返回任务 ID" : "创建任务失败：未返回任务 ID");
        return;
      }

      router.push(`/campaigns/${campaignId}`);
      router.refresh();
    } catch {
      setError(isEditMode ? "更新任务失败，请稍后重试" : "创建任务失败，请稍后重试");
    } finally {
      setLoadingCreate(false);
    }
  }

  const hasMainContent = contentFormat === "html" ? htmlContent.trim().length > 0 : markdownContent.trim().length > 0;

  if (loadingInitial) {
    return <p className="text-sm text-slate-500">加载任务中...</p>;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <Card>
        <CardHeader>
          <CardTitle>{isEditMode ? "编辑任务" : "任务配置"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={onPreview}>
            <div className="grid gap-2">
              <Label htmlFor="subject">邮件主题</Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="contentFormat">内容格式</Label>
              <Select
                id="contentFormat"
                value={contentFormat}
                onChange={(event) => setContentFormat(event.target.value as ContentFormat)}
              >
                <option value="html">HTML</option>
                <option value="markdown">Markdown</option>
              </Select>
            </div>

            {contentFormat === "html" ? (
              <div className="grid gap-2">
                <Label htmlFor="htmlContent">HTML 内容</Label>
                <Textarea
                  id="htmlContent"
                  rows={10}
                  value={htmlContent}
                  onChange={(e) => setHtmlContent(e.target.value)}
                  placeholder="例如：<h1>你好 {{user_name}}</h1>"
                  required
                />
              </div>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor="markdownContent">Markdown 内容</Label>
                <Textarea
                  id="markdownContent"
                  rows={10}
                  value={markdownContent}
                  onChange={(e) => setMarkdownContent(e.target.value)}
                  placeholder="# 你好 {{user_name}}"
                  required
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="textContent">纯文本内容（可选，不填则自动生成）</Label>
              <Textarea id="textContent" rows={6} value={textContent} onChange={(e) => setTextContent(e.target.value)} />
            </div>

            <h3 className="mt-2 text-base font-semibold text-slate-900">收件人筛选</h3>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="userIdsCsv">用户ID（逗号分隔）</Label>
                <Input id="userIdsCsv" value={userIdsCsv} onChange={(e) => setUserIdsCsv(e.target.value)} placeholder="例如 1,2,100" />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="enable">账号状态</Label>
                <Select id="enable" value={enable} onChange={(e) => setEnable(e.target.value)}>
                  <option value="enabled">仅启用</option>
                  <option value="disabled">仅禁用</option>
                  <option value="all">全部</option>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="regDateFrom">注册时间从</Label>
                <Input id="regDateFrom" type="date" value={regDateFrom} onChange={(e) => setRegDateFrom(e.target.value)} />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="regDateTo">注册时间到</Label>
                <Input id="regDateTo" type="date" value={regDateTo} onChange={(e) => setRegDateTo(e.target.value)} />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="regRecentDays">注册时间近 N 天（手动输入）</Label>
                <Input
                  id="regRecentDays"
                  type="number"
                  min={1}
                  value={regRecentDays}
                  onChange={(e) => setRegRecentDays(e.target.value)}
                  placeholder="例如 30"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="lastDayTMin">今天之前已使用的流量最小值</Label>
                <div className="grid grid-cols-[1fr_110px] gap-2">
                  <Input
                    id="lastDayTMin"
                    type="number"
                    min={0}
                    step="any"
                    value={lastDayTMin}
                    onChange={(e) => setLastDayTMin(e.target.value)}
                    placeholder="例如 500"
                  />
                  <Select value={lastDayTMinUnit} onChange={(e) => setLastDayTMinUnit(e.target.value as TrafficUnit)}>
                    <option value="B">B</option>
                    <option value="MB">MB</option>
                    <option value="GB">GB</option>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="lastDayTMax">今天之前已使用的流量最大值</Label>
                <div className="grid grid-cols-[1fr_110px] gap-2">
                  <Input
                    id="lastDayTMax"
                    type="number"
                    min={0}
                    step="any"
                    value={lastDayTMax}
                    onChange={(e) => setLastDayTMax(e.target.value)}
                    placeholder="例如 2000"
                  />
                  <Select value={lastDayTMaxUnit} onChange={(e) => setLastDayTMaxUnit(e.target.value as TrafficUnit)}>
                    <option value="B">B</option>
                    <option value="MB">MB</option>
                    <option value="GB">GB</option>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="classesCsv">用户等级 class（逗号分隔）</Label>
                <Input id="classesCsv" value={classesCsv} onChange={(e) => setClassesCsv(e.target.value)} placeholder="例如 0,1,2" />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="classExpireMode">等级到期筛选</Label>
                <Select id="classExpireMode" value={classExpireMode} onChange={(e) => setClassExpireMode(e.target.value)}>
                  <option value="all">全部</option>
                  <option value="expired">已过期</option>
                  <option value="not_expired">未过期</option>
                  <option value="more_than_days">到期时间超过 N 天</option>
                  <option value="less_than_days">到期时间不足 N 天</option>
                  <option value="range">按时间区间</option>
                </Select>
              </div>

              {classExpireMode === "range" ? (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="classExpireFrom">等级到期从</Label>
                    <Input
                      id="classExpireFrom"
                      type="date"
                      value={classExpireFrom}
                      onChange={(e) => setClassExpireFrom(e.target.value)}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="classExpireTo">等级到期到</Label>
                    <Input id="classExpireTo" type="date" value={classExpireTo} onChange={(e) => setClassExpireTo(e.target.value)} />
                  </div>
                </>
              ) : null}

              {classExpireMode === "more_than_days" || classExpireMode === "less_than_days" ? (
                <div className="grid gap-2">
                  <Label htmlFor="classExpireDays">到期天数 N（手动输入）</Label>
                  <Input
                    id="classExpireDays"
                    type="number"
                    min={1}
                    value={classExpireDays}
                    onChange={(e) => setClassExpireDays(e.target.value)}
                    placeholder={classExpireMode === "more_than_days" ? "例如 30" : "例如 3"}
                  />
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="nodeGroupsCsv">节点分组 node_group（逗号分隔）</Label>
                <Input id="nodeGroupsCsv" value={nodeGroupsCsv} onChange={(e) => setNodeGroupsCsv(e.target.value)} placeholder="例如 0,1" />
              </div>

              <label htmlFor="includeAdmin" className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  id="includeAdmin"
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-sky-600"
                  checked={includeAdmin}
                  onChange={(e) => setIncludeAdmin(e.target.checked)}
                />
                包含管理员账号（默认不包含）
              </label>
            </div>

            {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={loadingPreview}>
                {loadingPreview ? "预览中..." : "预览收件人"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={loadingCreate || !subject || !hasMainContent}
                onClick={() => {
                  void onSaveCampaign();
                }}
              >
                {loadingCreate ? (isEditMode ? "保存中..." : "创建中...") : isEditMode ? "保存修改" : "保存任务"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>预览结果</CardTitle>
          <p className="text-sm text-slate-500">{preview ? `预计发送人数：${preview.total}` : "提交筛选条件后显示"}</p>
        </CardHeader>
        <CardContent>
          {preview?.sample?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>用户名</TableHead>
                  <TableHead>Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.sample.map((item) => (
                  <TableRow key={`${item.id}-${item.email}`}>
                    <TableCell>{item.id}</TableCell>
                    <TableCell>{item.user_name}</TableCell>
                    <TableCell>{item.email}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-slate-500">暂无样本数据</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
