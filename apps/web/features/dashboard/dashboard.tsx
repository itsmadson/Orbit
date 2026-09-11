"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowUpRight, Banknote, Calendar, CheckCircle2, Clock, FlaskConical,
  Gavel, Lightbulb, Receipt, Sparkles, TrendingDown, TrendingUp, Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { useI18n, useT } from "@/lib/i18n";
import { useSession } from "@/components/providers";
import { MetricCard, PageHeader, Section } from "@/components/shared/page";
import { ActivityFeed } from "@/components/shared/entity";
import { Avatar, DeltaPill, Progress, Skeleton, StatusBadge } from "@/components/ui/misc";
import { cn, formatCurrency, formatDate, formatNumber, humanize, isOverdue, relativeTime } from "@/lib/utils";

type Dashboard = {
  greeting: string;
  metrics: Record<string, any>;
  insights: { level: string; icon: string; title: string; body?: string; url?: string }[];
  deadlines: { type: string; id: string; title: string; date: string; overdue: boolean; url: string }[];
  workload: { id: string; name: string; title?: string; color: string; open_tasks: number; load: number }[];
  decisions: { id: string; title: string; status: string; created_at: string }[];
  meetings: { id: string; title: string; starts_at: string; location?: string }[];
  my_tasks: { id: string; key: string; title: string; status: string; priority: string; type: string; due_date?: string }[];
  activity: any[];
};

const INSIGHT_ICONS: Record<string, any> = {
  "alert-triangle": AlertTriangle,
  banknote: Banknote,
  lightbulb: Lightbulb,
  "flask-conical": FlaskConical,
  users: Users,
  clock: Clock,
  receipt: Receipt,
};

const INSIGHT_TONES: Record<string, string> = {
  warning: "border-warning/25 bg-warning/[0.06] text-warning",
  success: "border-positive/25 bg-positive/[0.06] text-positive",
  idea: "border-accent/20 bg-[color-mix(in_oklab,var(--accent)_7%,transparent)] text-accent",
  info: "border-info/25 bg-info/[0.06] text-info",
};

export function DashboardView() {
  const t = useT();
  const { locale } = useI18n();
  const { user, company, can } = useSession();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<Dashboard>("/dashboard"),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const m = data.metrics;
  const currency = company.currency ?? "USD";
  const revenueDelta =
    m.previous_month_revenue > 0
      ? ((m.monthly_revenue - m.previous_month_revenue) / m.previous_month_revenue) * 100
      : null;
  const expenseDelta =
    m.previous_month_expenses > 0
      ? ((m.monthly_expenses - m.previous_month_expenses) / m.previous_month_expenses) * 100
      : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span>
            {t(`dashboard.greeting.${data.greeting}`)},{" "}
            <span className="text-muted">{user.full_name.split(" ")[0]}</span>
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{company.name}</span>
            <span className="text-faint">·</span>
            <Link href="/tasks?mine=1" className="transition-colors hover:text-accent">
              {formatNumber(m.my_open_tasks, locale)} open{" "}
              {m.my_open_tasks === 1 ? "task" : "tasks"}
            </Link>
            {m.my_pending_approvals ? (
              <>
                <span className="text-faint">·</span>
                <Link href="/approvals" className="text-accent hover:underline">
                  {formatNumber(m.my_pending_approvals, locale)} {t("nav.approvals").toLowerCase()}{" "}
                  waiting
                </Link>
              </>
            ) : null}
          </span>
        }
      />

      {/* Company health strip */}
      <div className="panel-glow overflow-hidden">
        <div className="flex flex-col gap-5 p-4 sm:flex-row sm:flex-wrap sm:items-start sm:gap-6">
          <div className="min-w-40">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.07em] text-muted">
              {t("dashboard.health")}
            </p>
            <div className="mt-1 flex items-end gap-2">
              <span
                className={cn(
                  "text-[38px] font-semibold leading-none tracking-[-0.03em] tnum",
                  m.health >= 75 ? "text-positive" : m.health >= 50 ? "text-warning" : "text-danger",
                )}
              >
                {formatNumber(m.health, locale)}
              </span>
              <span className="mb-1 text-[12px] text-faint">/ 100</span>
            </div>
            <Progress
              value={m.health}
              className="mt-2 w-40"
              tone={m.health >= 75 ? "var(--positive)" : m.health >= 50 ? "var(--warning)" : "var(--danger)"}
            />
          </div>
          <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Stat label={t("dashboard.activeProjects")} value={formatNumber(m.active_projects, locale)}
              hint={m.projects_at_risk ? `${m.projects_at_risk} at risk` : "all healthy"}
              tone={m.projects_at_risk ? "warning" : "positive"} />
            <Stat label={t("dashboard.overdueTasks")} value={formatNumber(m.overdue_tasks, locale)}
              hint={`${m.task_completion_rate}% of all tasks done`} />
            <Stat label={t("dashboard.newIdeas")} value={formatNumber(m.new_ideas, locale)} hint="last 30 days" />
            <Stat label={t("dashboard.runningExperiments")} value={formatNumber(m.running_experiments, locale)}
              hint={`${m.active_research} active studies`} />
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label={t("dashboard.pendingApprovals")} value={formatNumber(m.pending_approvals, locale)}
          hint={m.my_pending_approvals ? `${m.my_pending_approvals} waiting on you` : undefined}
          icon={<Gavel className="h-3.5 w-3.5" />} href="/approvals"
          tone={m.my_pending_approvals ? "warning" : "default"} />
        {can("finance.read") ? (
          <>
            <MetricCard label={t("dashboard.monthlyRevenue")}
              value={formatCurrency(m.monthly_revenue, currency, locale, true)}
              hint={revenueDelta !== null ? <Delta value={revenueDelta} /> : undefined}
              icon={<TrendingUp className="h-3.5 w-3.5" />} href="/finance" tone="positive" />
            <MetricCard label={t("dashboard.monthlyExpenses")}
              value={formatCurrency(m.monthly_expenses, currency, locale, true)}
              hint={expenseDelta !== null ? <Delta value={expenseDelta} invert /> : undefined}
              icon={<TrendingDown className="h-3.5 w-3.5" />} href="/finance" />
            <MetricCard label={t("dashboard.pipeline")}
              value={formatCurrency(m.pipeline_value, currency, locale, true)}
              hint={`${formatCurrency(m.outstanding_invoices, currency, locale, true)} outstanding`}
              icon={<Receipt className="h-3.5 w-3.5" />} href="/crm" />
          </>
        ) : (
          <>
            <MetricCard label={t("dashboard.myTasks")} value={formatNumber(m.my_open_tasks, locale)}
              icon={<CheckCircle2 className="h-3.5 w-3.5" />} href="/tasks?mine=1" />
            <MetricCard label={t("dashboard.headcount")} value={formatNumber(m.headcount, locale)}
              hint={`${m.on_leave_today} on leave today`} icon={<Users className="h-3.5 w-3.5" />}
              href="/employees" />
            <MetricCard label={t("goals.title")} value={`${m.company_goal_progress}%`}
              icon={<Sparkles className="h-3.5 w-3.5" />} href="/goals" />
          </>
        )}
      </div>

      {/* AI insights */}
      <Section
        title={
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            {t("dashboard.aiInsights")}
          </span>
        }
        action={
          <Link href="/ai" className="text-[12px] text-muted transition-colors hover:text-accent">
            {t("nav.ai")} <ArrowUpRight className="inline h-3 w-3" />
          </Link>
        }
        contentClassName="grid gap-2 p-3 sm:grid-cols-2"
      >
        {data.insights.map((insight, index) => {
          const Icon = INSIGHT_ICONS[insight.icon] ?? Sparkles;
          const body = (
            <div
              className={cn(
                "flex h-full items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-transform",
                INSIGHT_TONES[insight.level] ?? "border-border bg-surface-2 text-muted",
                insight.url && "hover:-translate-y-px",
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-[13px] font-medium leading-snug text-text">{insight.title}</p>
                {insight.body ? (
                  <p className="mt-0.5 text-[12px] leading-snug text-muted">{insight.body}</p>
                ) : null}
              </div>
            </div>
          );
          return insight.url ? (
            <Link key={index} href={insight.url}>
              {body}
            </Link>
          ) : (
            <div key={index}>{body}</div>
          );
        })}
        {!data.insights.length ? (
          <p className="p-2 text-[13px] text-faint">{t("common.empty")}</p>
        ) : null}
      </Section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section
            title={t("dashboard.myTasks")}
            action={
              <Link href="/tasks?mine=1" className="text-[12px] text-muted hover:text-accent">
                {t("action.viewAll")}
              </Link>
            }
            contentClassName="p-0"
          >
            {data.my_tasks.length ? (
              <ul>
                {data.my_tasks.map((task) => (
                  <li key={task.id} className="border-b border-border/60 last:border-0">
                    <Link
                      href={`/tasks/${task.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2"
                    >
                      <span className="font-mono text-[11px] text-faint">{task.key}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px]">{task.title}</span>
                      {task.due_date ? (
                        <span
                          className={cn(
                            "text-[11px]",
                            isOverdue(task.due_date) ? "text-danger" : "text-faint",
                          )}
                        >
                          {formatDate(task.due_date, locale)}
                        </span>
                      ) : null}
                      <StatusBadge status={task.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-4 text-[13px] text-faint">{t("common.empty")}</p>
            )}
          </Section>

          <Section title={t("dashboard.upcomingDeadlines")} contentClassName="p-0">
            {data.deadlines.length ? (
              <ul>
                {data.deadlines.slice(0, 7).map((deadline) => (
                  <li key={`${deadline.type}-${deadline.id}`} className="border-b border-border/60 last:border-0">
                    <Link
                      href={deadline.url}
                      className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-2"
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          deadline.overdue ? "bg-danger" : "bg-accent",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px]">{deadline.title}</span>
                      <span className="shrink-0 text-[11px] uppercase tracking-wide text-faint">
                        {deadline.type}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-[11px]",
                          deadline.overdue ? "text-danger" : "text-muted",
                        )}
                      >
                        {formatDate(deadline.date, locale)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-4 text-[13px] text-faint">{t("common.empty")}</p>
            )}
          </Section>

          <Section title={t("dashboard.recentActivity")}>
            <ActivityFeed items={data.activity} compact />
          </Section>
        </div>

        <div className="space-y-4">
          <Section title={t("dashboard.upcomingMeetings")} contentClassName="p-0">
            {data.meetings.length ? (
              <ul>
                {data.meetings.map((meeting) => (
                  <li key={meeting.id} className="border-b border-border/60 last:border-0">
                    <Link
                      href={`/meetings/${meeting.id}`}
                      className="flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-surface-2"
                    >
                      <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
                      <div className="min-w-0">
                        <p className="truncate text-[13px]">{meeting.title}</p>
                        <p className="text-[11px] text-faint">
                          {formatDate(meeting.starts_at, locale, true)}
                          {meeting.location ? ` · ${meeting.location}` : ""}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-4 text-[13px] text-faint">{t("common.empty")}</p>
            )}
          </Section>

          <Section title={t("dashboard.workload")}>
            <ul className="space-y-2.5">
              {data.workload.slice(0, 6).map((person) => (
                <li key={person.id}>
                  <Link href={`/employees/${person.id}`} className="flex items-center gap-2.5">
                    <Avatar name={person.name} color={person.color} size={24} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[13px]">{person.name}</span>
                        <span className="shrink-0 text-[11px] text-muted">
                          {formatNumber(person.open_tasks, locale)}
                        </span>
                      </div>
                      <Progress
                        value={person.load}
                        className="mt-1"
                        tone={person.load > 80 ? "var(--warning)" : "var(--accent)"}
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            title={t("dashboard.recentDecisions")}
            action={
              <Link href="/decisions" className="text-[12px] text-muted hover:text-accent">
                {t("action.viewAll")}
              </Link>
            }
            contentClassName="p-0"
          >
            <ul>
              {data.decisions.map((decision) => (
                <li key={decision.id} className="border-b border-border/60 last:border-0">
                  <Link
                    href={`/decisions/${decision.id}`}
                    className="flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-surface-2"
                  >
                    <Gavel className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px]">{decision.title}</p>
                      <p className="text-[11px] text-faint">{relativeTime(decision.created_at, locale)}</p>
                    </div>
                    <StatusBadge status={decision.status} />
                  </Link>
                </li>
              ))}
              {!data.decisions.length ? (
                <p className="p-4 text-[13px] text-faint">{t("common.empty")}</p>
              ) : null}
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "positive" | "warning" | "danger";
}) {
  return (
    <div>
      <p className="text-[10.5px] font-medium uppercase tracking-[0.07em] text-muted">{label}</p>
      <p className="mt-0.5 text-[20px] font-semibold leading-tight tracking-[-0.02em] tnum">{value}</p>
      {hint ? (
        <p
          className={cn(
            "text-[11px]",
            tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "positive" ? "text-positive" : "text-faint",
          )}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Delta({ value, invert }: { value: number; invert?: boolean }) {
  return (
    <>
      <DeltaPill value={value} invert={invert} />
      <span className="text-faint">vs last month</span>
    </>
  );
}
