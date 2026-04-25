import { LoginForm } from "./login-form";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const rawNext = resolvedSearchParams?.next;
  const nextPath = Array.isArray(rawNext) ? rawNext[0] : rawNext;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-20">
      <div className="grid w-full items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <section>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">SSPanel Mail Console</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">统一管理用户筛选、邮件内容和异步发送队列</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
            该系统提供用户高级筛选、Markdown/HTML 邮件编辑、SendGrid/Resend/SMTP 多渠道异步队列发送与发送日志回溯。
          </p>
        </section>

        <LoginForm nextPath={nextPath || "/dashboard"} />
      </div>
    </main>
  );
}
