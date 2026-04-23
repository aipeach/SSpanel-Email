"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/dashboard",
    label: "用户概览",
    match: (pathname: string) => pathname === "/dashboard",
  },
  {
    href: "/campaigns",
    label: "任务列表",
    match: (pathname: string) => pathname === "/campaigns" || /^\/campaigns\/\d+$/.test(pathname),
  },
  {
    href: "/campaigns/new",
    label: "创建任务",
    match: (pathname: string) => pathname === "/campaigns/new",
  },
  {
    href: "/direct-send",
    label: "直接发送",
    match: (pathname: string) => pathname === "/direct-send",
  },
  {
    href: "/logs",
    label: "发送日志",
    match: (pathname: string) => pathname === "/logs",
  },
  {
    href: "/connection-status",
    label: "连接状态",
    match: (pathname: string) => pathname === "/connection-status",
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  async function onLogout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <aside className="flex h-full min-h-screen w-full flex-col gap-6 border-r border-slate-200 bg-white/90 px-4 py-6 backdrop-blur md:w-64 md:px-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-600">SSPanel 邮件系统</p>
        <p className="mt-2 text-sm text-slate-600">发件任务与用户筛选控制台</p>
      </div>

      <nav className="grid gap-2">
        {navItems.map((item) => {
          const active = item.match(pathname);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-medium no-underline transition",
                active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto">
        <Button type="button" variant="secondary" className="w-full" onClick={onLogout}>
          退出登录
        </Button>
      </div>
    </aside>
  );
}
