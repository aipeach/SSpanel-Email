import { AppSidebar } from "@/components/layout/app-sidebar";

type AppShellProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export function AppShell({ title, description, actions, children }: AppShellProps) {
  return (
    <div className="min-h-screen md:flex">
      <AppSidebar />

      <main className="w-full p-6 md:p-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
            {description ? <p className="mt-2 text-slate-600">{description}</p> : null}
          </div>

          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>

        {children}
      </main>
    </div>
  );
}
