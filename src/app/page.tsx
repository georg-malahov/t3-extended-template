import { SiteHeader } from "@/components/layout/site-header";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="flex min-h-[calc(100vh-73px)] items-center justify-center bg-background px-6 py-16">
        <div className="w-full max-w-3xl rounded-3xl border bg-card p-10 shadow-sm">
          <span className="inline-flex rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
            Greenfield SaaS Template
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance">
            Next.js 16 starter for multi-tenant SaaS products.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            This template layers shadcn/ui, Better Auth, ZenStack, PostgreSQL,
            TanStack Query, Vitest, Playwright, Docker, Coolify, and Doppler
            into a single type-safe codebase.
          </p>
        </div>
      </main>
    </>
  );
}
