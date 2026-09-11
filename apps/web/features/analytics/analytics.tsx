"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis,
} from "recharts";
import { useI18n, useT } from "@/lib/i18n";
import { useItem } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import { MetricCard, PageHeader, Section } from "@/components/shared/page";
import { Avatar, EmptyState, Progress, StatusBadge } from "@/components/ui/misc";
import { LoadingPanel } from "@/components/shared/entity";
import { chartAxis, chartTooltip } from "@/features/finance/finance";
import { chartPalette, cn, formatCurrency, formatDate, formatNumber, humanize } from "@/lib/utils";

export function CompanyAnalytics() {
  const t = useT();
  const { locale } = useI18n();
  const { data, isLoading } = useItem<any>("/analytics/company");
  if (isLoading || !data) return <LoadingPanel />;

  const metrics = data.metrics;
  const toSeries = (record: Record<string, number>) =>
    Object.entries(record ?? {}).map(([name, value]) => ({ name: humanize(name), value }));

  return (
    <div>
      <PageHeader title={t("analytics.title")} subtitle={t("nav.analytics.company")} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label={t("dashboard.health")} value={`${metrics.health}/100`} tone={metrics.health >= 70 ? "positive" : "warning"} />
        <MetricCard label={t("dashboard.activeProjects")} value={metrics.active_projects} hint={`${metrics.projects_at_risk} at risk`} />
        <MetricCard label="Task completion" value={`${metrics.task_completion_rate}%`} tone="accent" />
        <MetricCard label={t("dashboard.headcount")} value={metrics.headcount} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t("analytics.throughput")} contentClassName="p-3">
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.throughput}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" {...chartAxis} />
                <YAxis {...chartAxis} width={34} />
                <ReTooltip {...chartTooltip} />
                <Line
                  type="monotone"
                  dataKey="completed"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "var(--accent)" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Tasks by status" contentClassName="p-3">
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={toSeries(data.tasks_by_status)}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" {...chartAxis} />
                <YAxis {...chartAxis} width={34} />
                <ReTooltip {...chartTooltip} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={30}>
                  {toSeries(data.tasks_by_status).map((entry, index) => (
                    <Cell key={entry.name} fill={chartPalette()[index % 8]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Idea pipeline" contentClassName="p-3">
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={toSeries(data.ideas_by_status)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" {...chartAxis} />
                <YAxis type="category" dataKey="name" {...chartAxis} width={90} />
                <ReTooltip {...chartTooltip} />
                <Bar dataKey="value" fill="var(--accent-solid)" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Experiments" contentClassName="p-3">
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={toSeries(data.experiments_by_status)}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={45}
                  outerRadius={80}
                  paddingAngle={2}
                  stroke="none"
                >
                  {toSeries(data.experiments_by_status).map((entry, index) => (
                    <Cell key={entry.name} fill={chartPalette()[index % 8]} />
                  ))}
                </Pie>
                <ReTooltip {...chartTooltip} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-1">
            {toSeries(data.experiments_by_status).map((entry, index) => (
              <li key={entry.name} className="flex items-center gap-2 text-[12px]">
                <span className="h-2 w-2 rounded-full" style={{ background: chartPalette()[index % 8] }} />
                <span className="flex-1 truncate text-muted">{entry.name}</span>
                <span>{entry.value}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}

export function ProjectAnalytics() {
  const t = useT();
  const { locale } = useI18n();
  const { company } = useSession();
  const { data, isLoading } = useItem<any>("/analytics/projects");
  if (isLoading || !data) return <LoadingPanel />;

  return (
    <div>
      <PageHeader title={t("analytics.title")} subtitle={t("nav.analytics.projects")} />
      <div className="panel overflow-hidden">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-faint">
              <th className="px-3 py-2 text-start">{t("common.project")}</th>
              <th className="px-3 py-2 text-start">{t("common.status")}</th>
              <th className="px-3 py-2 text-start">{t("projects.health")}</th>
              <th className="px-3 py-2 text-start">{t("common.progress")}</th>
              <th className="px-3 py-2 text-end">{t("nav.tasks")}</th>
              <th className="px-3 py-2 text-end">{t("common.overdue")}</th>
              <th className="px-3 py-2 text-end">{t("common.budget")}</th>
            </tr>
          </thead>
          <tbody>
            {data.projects.map((project: any) => (
              <tr key={project.id} className="border-b border-border/60 last:border-0 hover:bg-surface-2">
                <td className="px-3 py-2.5">
                  <Link href={`/projects/${project.id}`} className="font-medium hover:text-accent">
                    {project.name}
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={project.status} />
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={project.health} />
                </td>
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2">
                    <Progress value={project.progress} className="w-24" tone={project.color} />
                    <span className="text-[11px] text-muted">{project.progress}%</span>
                  </span>
                </td>
                <td className="px-3 py-2.5 text-end text-muted">
                  {project.done_tasks}/{project.total_tasks}
                </td>
                <td className={cn("px-3 py-2.5 text-end", project.overdue_tasks ? "text-danger" : "text-muted")}>
                  {project.overdue_tasks}
                </td>
                <td className="px-3 py-2.5 text-end">
                  <span className={cn(project.spent > project.budget && project.budget ? "text-danger" : "")}>
                    {formatCurrency(project.spent, company.currency, locale, true)}
                  </span>
                  <span className="text-faint">
                    {project.budget ? ` / ${formatCurrency(project.budget, company.currency, locale, true)}` : ""}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PeopleAnalytics() {
  const t = useT();
  const { data, isLoading } = useItem<any>("/analytics/people");
  if (isLoading || !data) return <LoadingPanel />;

  return (
    <div>
      <PageHeader title={t("analytics.title")} subtitle={t("nav.analytics.people")} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t("dashboard.workload")} contentClassName="p-3">
          <ul className="space-y-2.5">
            {data.workload.map((person: any) => (
              <li key={person.id} className="flex items-center gap-2.5">
                <Avatar name={person.name} color={person.color} size={24} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between text-[12px]">
                    <Link href={`/employees/${person.id}`} className="truncate hover:text-accent">
                      {person.name}
                    </Link>
                    <span className="text-muted">{person.open_tasks}</span>
                  </div>
                  <Progress
                    value={person.load}
                    className="mt-1"
                    tone={person.load > 80 ? "var(--warning)" : "var(--accent)"}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t("analytics.completions")} contentClassName="p-3">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.completions} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" {...chartAxis} />
                <YAxis type="category" dataKey="name" {...chartAxis} width={120} />
                <ReTooltip {...chartTooltip} />
                <Bar dataKey="completed" fill="var(--positive)" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title={t("analytics.byDepartment")} className="lg:col-span-2" contentClassName="p-3">
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.by_department}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" {...chartAxis} />
                <YAxis {...chartAxis} width={34} />
                <ReTooltip {...chartTooltip} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={36}>
                  {data.by_department.map((entry: any) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>
    </div>
  );
}

export function FinanceAnalytics() {
  const t = useT();
  const { locale } = useI18n();
  const { company } = useSession();
  const { data, isLoading } = useItem<any>("/analytics/finance", { months: 12 });
  if (isLoading || !data) return <LoadingPanel />;
  const summary = data.summary;

  return (
    <div>
      <PageHeader title={t("analytics.title")} subtitle={t("nav.analytics.finance")} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label={t("finance.income")} value={formatCurrency(summary.income, company.currency, locale, true)} tone="positive" />
        <MetricCard label={t("finance.expenses")} value={formatCurrency(summary.expenses, company.currency, locale, true)} />
        <MetricCard
          label={t("finance.net")}
          value={formatCurrency(summary.net, company.currency, locale, true)}
          tone={summary.net >= 0 ? "positive" : "danger"}
        />
        <MetricCard label={t("finance.outstanding")} value={formatCurrency(summary.outstanding, company.currency, locale, true)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t("finance.cashflow")} className="lg:col-span-2" contentClassName="p-3">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.by_month}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" {...chartAxis} />
                <YAxis {...chartAxis} width={54} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                <ReTooltip
                  {...chartTooltip}
                  formatter={(value: any, name: any) => [
                    formatCurrency(Number(value), company.currency, locale),
                    humanize(String(name)),
                  ]}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={24}
                  iconType="square"
                  iconSize={9}
                  formatter={(value: any) => (
                    <span className="text-[11px] text-muted">{humanize(String(value))}</span>
                  )}
                />
                <Bar dataKey="income" fill="var(--positive)" radius={[3, 3, 0, 0]} barSize={14} />
                <Bar dataKey="expenses" fill="var(--accent-solid)" radius={[3, 3, 0, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title={t("crm.pipeline")} contentClassName="p-3">
          <ul className="space-y-2">
            {data.pipeline.map((stage: any, index: number) => (
              <li key={stage.stage}>
                <div className="mb-1 flex items-center justify-between text-[12px]">
                  <span className="text-muted">{humanize(stage.stage)}</span>
                  <span>
                    {formatCurrency(stage.value, company.currency, locale, true)} · {stage.count}
                  </span>
                </div>
                <Progress
                  value={
                    (stage.value /
                      Math.max(...data.pipeline.map((item: any) => item.value || 1))) * 100
                  }
                  tone={chartPalette()[index % 8]}
                />
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t("finance.byCategory")} contentClassName="p-3">
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={summary.by_category}
                  dataKey="amount"
                  nameKey="name"
                  innerRadius={40}
                  outerRadius={78}
                  paddingAngle={2}
                  stroke="none"
                >
                  {summary.by_category.map((entry: any) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <ReTooltip
                  {...chartTooltip}
                  formatter={(value: any) => formatCurrency(Number(value), company.currency, locale)}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>
    </div>
  );
}
