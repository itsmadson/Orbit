"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { OrbitMark } from "@/components/layout/sidebar";

const DEMO_ACCOUNTS = [
  { email: "admin@orbit.dev", role: "Company admin" },
  { email: "manager@orbit.dev", role: "Engineering manager" },
  { email: "dev@orbit.dev", role: "Engineer" },
  { email: "researcher@orbit.dev", role: "R&D" },
  { email: "finance@orbit.dev", role: "Finance" },
  { email: "hr@orbit.dev", role: "HR" },
];

export function LoginForm() {
  const t = useT();
  const router = useRouter();
  const [email, setEmail] = React.useState("admin@orbit.dev");
  const [password, setPassword] = React.useState("orbit1234");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.message ?? t("auth.invalid"));
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glow-warm flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[860px] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl md:grid md:grid-cols-[1.1fr_1fr]">
        <div className="glow-warm hidden flex-col justify-between gap-10 border-e border-border bg-surface-2/60 p-8 md:flex">
          <div className="flex items-center gap-2">
            <OrbitMark size={26} />
            <span className="text-[17px] font-semibold tracking-tight">ORBIT</span>
          </div>
          <div>
            <h2 className="text-[27px] font-semibold leading-[1.15] tracking-[-0.02em]">
              The operating system for
              <br />
              your company.
            </h2>
            <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-muted">
              Projects, tasks, ideas, research, knowledge, approvals, finance, customers and people —
              connected in one operational graph instead of eight disconnected tools.
            </p>
          </div>
          <ul className="space-y-1.5 text-[12px] text-muted">
            {[
              "An idea becomes research, then a project, then tasks",
              "A meeting creates decisions and action items",
              "An expense belongs to a project and a budget",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                {line}
              </li>
            ))}
          </ul>
        </div>

        <div className="p-7 md:p-8">
          <div className="mb-6 flex items-center gap-2 md:hidden">
            <OrbitMark size={24} />
            <span className="text-[16px] font-semibold tracking-tight">ORBIT</span>
          </div>
          <h1 className="text-[20px] font-semibold tracking-tight">{t("auth.welcome")}</h1>
          <p className="mt-1 text-[13px] text-muted">{t("auth.subtitle")}</p>

          <form onSubmit={submit} className="mt-6 space-y-3">
            <Field label={t("auth.email")}>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                required
                className="h-9"
              />
            </Field>
            <Field label={t("auth.password")}>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                className="h-9"
              />
            </Field>
            {error ? (
              <p className="rounded-md border border-danger/30 bg-danger/10 px-2.5 py-2 text-[12px] text-danger">
                {error}
              </p>
            ) : null}
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
              {loading ? t("auth.signingIn") : t("auth.signIn")}
              {!loading ? <ArrowRight className="h-4 w-4 rtl:rotate-180" /> : null}
            </Button>
          </form>

          <div className="mt-6">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">
              {t("auth.demoAccounts")}
            </p>
            <div className="grid grid-cols-2 gap-1">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword("orbit1234");
                  }}
                  className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-start transition-colors hover:border-accent/40 hover:bg-accent-soft"
                >
                  <span className="block truncate text-[12px]">{account.email}</span>
                  <span className="block text-[10px] text-faint">{account.role}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-faint">
              Password for every demo account: <code className="text-muted">orbit1234</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
