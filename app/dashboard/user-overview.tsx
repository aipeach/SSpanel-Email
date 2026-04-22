"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type OverviewRow = {
  id: number;
  user_name: string;
  email: string;
  reg_date: string;
  last_day_t: number;
  class: number;
  class_expire: string;
  node_group: number;
  is_admin: number;
  enable: number;
};

type OverviewResponse = {
  total: number;
  page: number;
  pageSize: number;
  sortField: SortField;
  sortOrder: SortOrder;
  rows: OverviewRow[];
  error?: string;
};

type TrafficUnit = "B" | "MB" | "GB";

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

type SortField =
  | "id"
  | "user_name"
  | "email"
  | "reg_date"
  | "last_day_t"
  | "class"
  | "class_expire"
  | "node_group"
  | "is_admin"
  | "enable";

type SortOrder = "asc" | "desc";

function formatDateTime(value: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export function UserOverview() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<OverviewRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortField, setSortField] = useState<SortField>("id");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

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

  const [tableUserId, setTableUserId] = useState("");
  const [tableUserNameLike, setTableUserNameLike] = useState("");
  const [tableEmailLike, setTableEmailLike] = useState("");
  const [tableClassValue, setTableClassValue] = useState("");
  const [tableNodeGroupValue, setTableNodeGroupValue] = useState("");
  const [tableEnable, setTableEnable] = useState("all");
  const [tableIsAdmin, setTableIsAdmin] = useState("all");

  function buildAdvancedFilters() {
    return {
      userIdsCsv,
      regRecentDays: regRecentDays ? Number(regRecentDays) : undefined,
      regDateFrom,
      regDateTo,
      lastDayTMin: convertTrafficToBytes(lastDayTMin, lastDayTMinUnit),
      lastDayTMax: convertTrafficToBytes(lastDayTMax, lastDayTMaxUnit),
      classesCsv,
      classExpireMode,
      classExpireDays: classExpireDays ? Number(classExpireDays) : undefined,
      classExpireFrom,
      classExpireTo,
      nodeGroupsCsv,
      includeAdmin,
      enable,
    };
  }

  function buildTableFilters() {
    return {
      userId: tableUserId ? Number(tableUserId) : undefined,
      userNameLike: tableUserNameLike.trim() || undefined,
      emailLike: tableEmailLike.trim() || undefined,
      classValue: tableClassValue ? Number(tableClassValue) : undefined,
      nodeGroupValue: tableNodeGroupValue ? Number(tableNodeGroupValue) : undefined,
      enable: tableEnable,
      isAdmin: tableIsAdmin,
    };
  }

  async function queryUsers(options?: {
    targetPage?: number;
    targetPageSize?: number;
    targetSortField?: SortField;
    targetSortOrder?: SortOrder;
    tableFiltersOverride?: ReturnType<typeof buildTableFilters>;
  }) {
    const targetPage = options?.targetPage || page;
    const targetPageSize = options?.targetPageSize || pageSize;
    const targetSortField = options?.targetSortField || sortField;
    const targetSortOrder = options?.targetSortOrder || sortOrder;
    const tableFilters = options?.tableFiltersOverride || buildTableFilters();

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/users/overview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          page: targetPage,
          pageSize: targetPageSize,
          sortField: targetSortField,
          sortOrder: targetSortOrder,
          filters: buildAdvancedFilters(),
          tableFilters,
        }),
      });

      const payload = (await response.json()) as OverviewResponse;

      if (!response.ok) {
        setError(payload.error || "查询失败");
        return;
      }

      setTotal(payload.total);
      setRows(payload.rows || []);
      setPage(payload.page || targetPage);
      setPageSize(payload.pageSize || targetPageSize);
      setSortField(payload.sortField || targetSortField);
      setSortOrder(payload.sortOrder || targetSortOrder);
    } catch {
      setError("查询失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void queryUsers({ targetPage: 1, targetPageSize: 20 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmitAdvancedFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await queryUsers({ targetPage: 1 });
  }

  async function onSubmitTableFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await queryUsers({ targetPage: 1 });
  }

  async function onResetTableFilters() {
    const emptyTableFilters = {
      userId: undefined,
      userNameLike: undefined,
      emailLike: undefined,
      classValue: undefined,
      nodeGroupValue: undefined,
      enable: "all",
      isAdmin: "all",
    };

    setTableUserId("");
    setTableUserNameLike("");
    setTableEmailLike("");
    setTableClassValue("");
    setTableNodeGroupValue("");
    setTableEnable("all");
    setTableIsAdmin("all");

    await queryUsers({
      targetPage: 1,
      tableFiltersOverride: emptyTableFilters,
    });
  }

  function getDefaultOrderForField(field: SortField): SortOrder {
    if (field === "id" || field === "reg_date" || field === "class_expire") {
      return "desc";
    }

    return "asc";
  }

  async function onToggleSort(field: SortField) {
    const nextOrder = field === sortField ? (sortOrder === "asc" ? "desc" : "asc") : getDefaultOrderForField(field);

    await queryUsers({
      targetPage: 1,
      targetSortField: field,
      targetSortOrder: nextOrder,
    });
  }

  function renderSortableHeader(label: string, field: SortField) {
    const indicator = sortField === field ? (sortOrder === "asc" ? "↑" : "↓") : "↕";

    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 text-left text-xs font-medium uppercase tracking-wide text-slate-600 hover:text-slate-900"
        onClick={() => {
          void onToggleSort(field);
        }}
      >
        <span>{label}</span>
        <span>{indicator}</span>
      </button>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const currentEnd = Math.min(total, page * pageSize);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>高级用户筛选</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={onSubmitAdvancedFilters}>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="userIdsCsv">用户ID（逗号分隔）</Label>
                <Input id="userIdsCsv" value={userIdsCsv} onChange={(event) => setUserIdsCsv(event.target.value)} placeholder="例如 1,2,100" />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="enable">账号状态 enable</Label>
                <Select id="enable" value={enable} onChange={(event) => setEnable(event.target.value)}>
                  <option value="enabled">仅启用（enable=1）</option>
                  <option value="disabled">仅禁用（enable=0）</option>
                  <option value="all">全部</option>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="regDateFrom">注册时间 reg_date 从</Label>
                <Input id="regDateFrom" type="date" value={regDateFrom} onChange={(event) => setRegDateFrom(event.target.value)} />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="regDateTo">注册时间 reg_date 到</Label>
                <Input id="regDateTo" type="date" value={regDateTo} onChange={(event) => setRegDateTo(event.target.value)} />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="regRecentDays">注册时间近 N 天（手动输入）</Label>
                <Input
                  id="regRecentDays"
                  type="number"
                  min={1}
                  value={regRecentDays}
                  onChange={(event) => setRegRecentDays(event.target.value)}
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
                    onChange={(event) => setLastDayTMin(event.target.value)}
                    placeholder="例如 500"
                  />
                  <Select value={lastDayTMinUnit} onChange={(event) => setLastDayTMinUnit(event.target.value as TrafficUnit)}>
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
                    onChange={(event) => setLastDayTMax(event.target.value)}
                    placeholder="例如 2000"
                  />
                  <Select value={lastDayTMaxUnit} onChange={(event) => setLastDayTMaxUnit(event.target.value as TrafficUnit)}>
                    <option value="B">B</option>
                    <option value="MB">MB</option>
                    <option value="GB">GB</option>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="classesCsv">用户等级 class（等级编号）</Label>
                <Input id="classesCsv" value={classesCsv} onChange={(event) => setClassesCsv(event.target.value)} placeholder="例如 0,1,2" />
                <p className="text-xs text-slate-500">说明：class 是等级编号，具体等级含义以你的 SSPanel 站点配置为准。</p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="classExpireMode">等级到期 class_expire 筛选</Label>
                <Select id="classExpireMode" value={classExpireMode} onChange={(event) => setClassExpireMode(event.target.value)}>
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
                    <Label htmlFor="classExpireFrom">等级到期 class_expire 从</Label>
                    <Input id="classExpireFrom" type="date" value={classExpireFrom} onChange={(event) => setClassExpireFrom(event.target.value)} />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="classExpireTo">等级到期 class_expire 到</Label>
                    <Input id="classExpireTo" type="date" value={classExpireTo} onChange={(event) => setClassExpireTo(event.target.value)} />
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
                    onChange={(event) => setClassExpireDays(event.target.value)}
                    placeholder={classExpireMode === "more_than_days" ? "例如 30" : "例如 3"}
                  />
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="nodeGroupsCsv">节点分组 node_group（分组编号）</Label>
                <Input id="nodeGroupsCsv" value={nodeGroupsCsv} onChange={(event) => setNodeGroupsCsv(event.target.value)} placeholder="例如 0,1" />
                <p className="text-xs text-slate-500">说明：node_group 是分组编号，具体含义以你的 SSPanel 节点分组配置为准。</p>
              </div>

              <label htmlFor="includeAdmin" className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  id="includeAdmin"
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-sky-600"
                  checked={includeAdmin}
                  onChange={(event) => setIncludeAdmin(event.target.checked)}
                />
                包含管理员账号（is_admin=1）
              </label>
            </div>

            {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}

            <Button type="submit" disabled={loading} className="w-fit">
              {loading ? "查询中..." : "查询用户"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>用户结果高级表格</CardTitle>
          <p className="text-sm text-slate-500">
            当前展示 {currentStart}-{currentEnd} / {total}
          </p>
          <p className="text-xs text-slate-500">点击表头可切换升序/降序</p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form className="grid gap-3 xl:grid-cols-4" onSubmit={onSubmitTableFilters}>
            <Input
              value={tableUserId}
              onChange={(event) => setTableUserId(event.target.value)}
              type="number"
              min={1}
              placeholder="表格筛选：用户ID"
            />
            <Input value={tableUserNameLike} onChange={(event) => setTableUserNameLike(event.target.value)} placeholder="表格筛选：用户名包含" />
            <Input value={tableEmailLike} onChange={(event) => setTableEmailLike(event.target.value)} placeholder="表格筛选：邮箱包含" />
            <Input
              value={tableClassValue}
              onChange={(event) => setTableClassValue(event.target.value)}
              type="number"
              min={0}
              placeholder="表格筛选：class"
            />
            <Input
              value={tableNodeGroupValue}
              onChange={(event) => setTableNodeGroupValue(event.target.value)}
              type="number"
              min={0}
              placeholder="表格筛选：node_group"
            />
            <Select value={tableEnable} onChange={(event) => setTableEnable(event.target.value)}>
              <option value="all">表格筛选：enable 全部</option>
              <option value="enabled">表格筛选：仅启用</option>
              <option value="disabled">表格筛选：仅禁用</option>
            </Select>
            <Select value={tableIsAdmin} onChange={(event) => setTableIsAdmin(event.target.value)}>
              <option value="all">表格筛选：管理员全部</option>
              <option value="yes">表格筛选：仅管理员</option>
              <option value="no">表格筛选：仅普通用户</option>
            </Select>

            <div className="flex flex-wrap gap-2 xl:col-span-4">
              <Button type="submit" disabled={loading}>
                {loading ? "筛选中..." : "应用表格筛选"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={loading}
                onClick={() => {
                  void onResetTableFilters();
                }}
              >
                重置表格筛选
              </Button>
            </div>
          </form>

          {rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{renderSortableHeader("ID", "id")}</TableHead>
                  <TableHead>{renderSortableHeader("用户名", "user_name")}</TableHead>
                  <TableHead>{renderSortableHeader("Email", "email")}</TableHead>
                  <TableHead>{renderSortableHeader("注册时间 reg_date", "reg_date")}</TableHead>
                  <TableHead>{renderSortableHeader("历史日流量 last_day_t", "last_day_t")}</TableHead>
                  <TableHead>{renderSortableHeader("等级 class", "class")}</TableHead>
                  <TableHead>{renderSortableHeader("等级到期 class_expire", "class_expire")}</TableHead>
                  <TableHead>{renderSortableHeader("节点分组 node_group", "node_group")}</TableHead>
                  <TableHead>{renderSortableHeader("管理员 is_admin", "is_admin")}</TableHead>
                  <TableHead>{renderSortableHeader("账号启用 enable", "enable")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.id}</TableCell>
                    <TableCell>{item.user_name}</TableCell>
                    <TableCell>{item.email}</TableCell>
                    <TableCell>{formatDateTime(item.reg_date)}</TableCell>
                    <TableCell>{item.last_day_t}</TableCell>
                    <TableCell>{item.class}</TableCell>
                    <TableCell>{formatDateTime(item.class_expire)}</TableCell>
                    <TableCell>{item.node_group}</TableCell>
                    <TableCell>{item.is_admin === 1 ? "是" : "否"}</TableCell>
                    <TableCell>{item.enable === 1 ? "启用" : "禁用"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-slate-500">暂无匹配用户</p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span>每页</span>
              <Select
                value={String(pageSize)}
                onChange={(event) => {
                  const nextPageSize = Number(event.target.value);
                  void queryUsers({ targetPage: 1, targetPageSize: nextPageSize });
                }}
              >
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={loading || page <= 1}
                onClick={() => {
                  void queryUsers({ targetPage: page - 1 });
                }}
              >
                上一页
              </Button>
              <span className="text-sm text-slate-600">
                第 {page} / {totalPages} 页
              </span>
              <Button
                type="button"
                variant="secondary"
                disabled={loading || page >= totalPages}
                onClick={() => {
                  void queryUsers({ targetPage: page + 1 });
                }}
              >
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
