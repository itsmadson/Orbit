"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote, Calendar, FileText, Gavel, Plus, Target, Users,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useI18n, useT } from "@/lib/i18n";
import { useItem, useList } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import type { ProjectSummary, Task } from "@/lib/types";
import { MetricCard, PageHeader, Section } from "@/components/shared/page";
import { ActivityFeed, LoadingPanel, RelatedPanel } from "@/components/shared/entity";
import { Avatar, AvatarGroup, EmptyState, Progress, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/select";
import { TaskBoard } from "@/features/tasks/task-board";
import { TaskTable } from "@/features/tasks/task-list";
import { TaskDialog } from "@/features/tasks/task-form";
import { UserPicker } from "@/components/shared/pickers";
import { cn, formatCurrency, formatDate, formatNumber, humanize, isOverdue } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip } from "recharts";

type ProjectDetail = ProjectSummary & {
  members: { id: string; role: string; user: any }[];
  milestones: { id: string; name: string; due_date?: string; status: string; progress: number }[];
  stats: Record<string, number>;
  description?: string | null;
};

type Overview = {
  project: ProjectDetail;
  tasks_by_status: Record<string, number>;
  recent_tasks: any[];
  documents: any[];
  meetings: any[];
  decisions: any[];
  expenses: { description: string; amount: number; date: string }[];
  spend_by_category: { name: string; color: string; amount: number }[];
};

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const client = useQueryClient();
  const { can, company } = useSession();
  const canWrite = can("projects.write");
  const [createTask, setCreateTask] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: [`/projects/${projectId}/overview`],
    queryFn: () => api.get<Overview>(`/projects/${projectId}/overview`),
  });
  const tasks = useList<Task>("/tasks", { project_id: projectId, page_size: 100 });
  const activity = useItem<any[]>(`/projects/${projectId}/activity`);
  const roadmap = useItem<any>(`/projects/${projectId}/roadmap`);

  if (isLoading || !data) return <LoadingPanel />;
  const project = data.project;
  const stats = project.stats ?? {};

  const patch = async (body: Record<string, unknown>) => {
    try {
      await api.patch(`/projects/${projectId}`, body);
      client.invalidateQueries({ queryKey: [`/projects/${projectId}/overview`] });
      client.invalidateQueries({ queryKey: ["/projects"] });
      toast.success(t("action.save"));
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: t("nav.projects"), href: "/projects" }, { label: project.key }]}
        icon={<span className="text-[22px]">{project.icon}</span>}
        title={project.name}
        subtitle={project.description}
        actions={
          <>
            {canWrite ? (
              <>
                <SimpleSelect
                  value={project.status}
                  onValueChange={(status) => patch({ status })}
                  className="w-32"
                  options={["planning", "active", "on_hold", "completed", "cancelled"].map((value) => ({
                    value,
                    label: humanize(value),
                  }))}
                />
                <SimpleSelect
                  value={project.health}
                  onValueChange={(health) => patch({ health })}
                  className="w-32"
                  options={["on_track", "at_risk", "off_track"].map((value) => ({
                    value,
                    label: humanize(value),
                  }))}
                />
                <Button variant="primary" onClick={() => setCreateTask(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  {t("tasks.new")}
                </Button>
              </>
            ) : (
              <>
                <StatusBadge status={project.status} />
                <StatusBadge status={project.health} />
              </>
            )}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={t("common.progress")}
          value={`${project.progress}%`}
          hint={`${stats.done_tasks ?? 0}/${stats.total_tasks ?? 0} ${t("nav.tasks").toLowerCase()}`}
        >
          <Progress value={project.progress} tone={project.color} />
        </MetricCard>
        <MetricCard
          label={t("common.overdue")}
          value={formatNumber(stats.overdue_tasks ?? 0, locale)}
          tone={stats.overdue_tasks ? "danger" : "positive"}
          hint={`${stats.open_tasks ?? 0} open`}
        />
        {can("finance.read") ? (
          <MetricCard
            label={t("common.budget")}
            value={formatCurrency(stats.spent ?? 0, company.currency, locale, true)}
            hint={
              stats.budget
                ? `${formatCurrency(stats.remaining ?? 0, company.currency, locale, true)} ${t("common.remaining").toLowerCase()}`
                : undefined
            }
            tone={stats.budget && stats.spent > stats.budget ? "danger" : "default"}
            icon={<Banknote className="h-3.5 w-3.5" />}
          >
            {stats.budget ? (
              <Progress
                value={Math.min(100, ((stats.spent ?? 0) / stats.budget) * 100)}
                tone={stats.spent > stats.budget ? "var(--danger)" : "var(--accent)"}
              />
            ) : null}
          </MetricCard>
        ) : (
          <MetricCard
            label={t("common.members")}
            value={formatNumber(stats.members ?? 0, locale)}
            icon={<Users className="h-3.5 w-3.5" />}
          />
        )}
        <MetricCard
          label={t("common.dueDate")}
          value={formatDate(project.end_date, locale)}
          hint={project.start_date ? `from ${formatDate(project.start_date, locale)}` : undefined}
          tone={isOverdue(project.end_date) && project.status !== "completed" ? "danger" : "default"}
          icon={<Calendar className="h-3.5 w-3.5" />}
        />
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">{t("common.overview")}</TabsTrigger>
          <TabsTrigger value="board">{t("projects.board")}</TabsTrigger>
          <TabsTrigger value="list">{t("projects.list")}</TabsTrigger>
          <TabsTrigger value="timeline">{t("projects.timeline")}</TabsTrigger>
          <TabsTrigger value="roadmap">{t("projects.roadmap")}</TabsTrigger>
          <TabsTrigger value="documents" count={data.documents.length}>
            {t("nav.documents")}
          </TabsTrigger>
          <TabsTrigger value="activity">{t("common.activity")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <Section title={t("projects.milestones")} contentClassName="p-0">
                {project.milestones.length ? (
                  <ul>
                    {project.milestones.map((milestone) => (
                      <li
                        key={milestone.id}
                        className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-0"
                      >
                        <Target className="h-3.5 w-3.5 shrink-0 text-faint" />
                        <span className="min-w-0 flex-1 truncate text-[13px]">{milestone.name}</span>
                        <Progress value={milestone.progress} className="w-24" />
                        <span className="w-10 text-end text-[11px] text-muted">
                          {milestone.progress}%
                        </span>
                        <span
                          className={cn(
                            "w-24 text-end text-[11px]",
                            isOverdue(milestone.due_date) && milestone.status !== "completed"
                              ? "text-danger"
                              : "text-muted",
                          )}
                        >
                          {formatDate(milestone.due_date, locale)}
                        </span>
                        <StatusBadge status={milestone.status} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="p-4 text-[13px] text-faint">{t("common.empty")}</p>
                )}
              </Section>

              <div className="grid gap-4 sm:grid-cols-2">
                <Section title={t("meetings.title")} contentClassName="p-0">
                  <ul>
                    {data.meetings.map((meeting) => (
                      <li key={meeting.id} className="border-b border-border/60 last:border-0">
                        <Link
                          href={`/meetings/${meeting.id}`}
                          className="flex items-center gap-2 px-4 py-2 hover:bg-surface-2"
                        >
                          <Calendar className="h-3.5 w-3.5 shrink-0 text-faint" />
                          <span className="min-w-0 flex-1 truncate text-[13px]">{meeting.title}</span>
                          <span className="text-[11px] text-faint">
                            {formatDate(meeting.starts_at, locale)}
                          </span>
                        </Link>
                      </li>
                    ))}
                    {!data.meetings.length ? (
                      <p className="p-4 text-[13px] text-faint">{t("common.empty")}</p>
                    ) : null}
                  </ul>
                </Section>
                <Section title={t("decisions.title")} contentClassName="p-0">
                  <ul>
                    {data.decisions.map((decision) => (
                      <li key={decision.id} className="border-b border-border/60 last:border-0">
                        <Link
                          href={`/decisions/${decision.id}`}
                          className="flex items-center gap-2 px-4 py-2 hover:bg-surface-2"
                        >
                          <Gavel className="h-3.5 w-3.5 shrink-0 text-faint" />
                          <span className="min-w-0 flex-1 truncate text-[13px]">{decision.title}</span>
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

              {can("finance.read") && data.spend_by_category.length ? (
                <Section title={t("finance.byCategory")}>
                  <div className="flex flex-wrap items-center gap-6">
                    <div className="h-40 w-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data.spend_by_category}
                            dataKey="amount"
                            nameKey="name"
                            innerRadius={38}
                            outerRadius={62}
                            paddingAngle={2}
                            stroke="none"
                          >
                            {data.spend_by_category.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <ReTooltip
                            contentStyle={{
                              background: "var(--elevated)",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                            formatter={(value: any) =>
                              formatCurrency(Number(value), company.currency, locale)
                            }
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="flex-1 space-y-1.5">
                      {data.spend_by_category.map((entry) => (
                        <li key={entry.name} className="flex items-center gap-2 text-[13px]">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: entry.color }}
                          />
                          <span className="flex-1 truncate text-muted">{entry.name}</span>
                          <span>{formatCurrency(entry.amount, company.currency, locale, true)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Section>
              ) : null}
            </div>

            <aside className="space-y-4">
              <Section
                title={t("common.members")}
                action={<span className="text-[11px] text-faint">{project.members.length}</span>}
                contentClassName="p-3"
              >
                <ul className="space-y-2">
                  {project.members.map((member) => (
                    <li key={member.id} className="flex items-center gap-2">
                      <Avatar
                        name={member.user?.full_name}
                        color={member.user?.avatar_color}
                        size={24}
                      />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/employees/${member.user?.id}`}
                          className="block truncate text-[13px] hover:text-accent"
                        >
                          {member.user?.full_name}
                        </Link>
                        <p className="truncate text-[11px] text-faint">{member.user?.title}</p>
                      </div>
                      <span className="text-[10px] uppercase tracking-wide text-faint">
                        {member.role}
                      </span>
                    </li>
                  ))}
                </ul>
                {canWrite ? (
                  <div className="mt-3">
                    <UserPicker
                      value={null}
                      placeholder={`+ ${t("action.add")}`}
                      onChange={async (userId) => {
                        if (!userId) return;
                        await api.post(`/projects/${projectId}/members`, {
                          user_id: userId,
                          role: "member",
                        });
                        client.invalidateQueries({ queryKey: [`/projects/${projectId}/overview`] });
                      }}
                    />
                  </div>
                ) : null}
              </Section>

              <Section title={t("nav.documents")} contentClassName="p-2">
                {data.documents.length ? (
                  <ul>
                    {data.documents.map((doc) => (
                      <li key={doc.id}>
                        <Link
                          href={`/documents/${doc.id}`}
                          className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-2"
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0 text-faint" />
                          <span className="min-w-0 flex-1 truncate text-[13px]">{doc.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-2 py-1 text-[13px] text-faint">{t("common.empty")}</p>
                )}
              </Section>

              <Section title={t("common.related")} contentClassName="p-2">
                <RelatedPanel entityType="project" entityId={projectId} />
              </Section>
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="board">
          <TaskBoard projectId={projectId} />
        </TabsContent>

        <TabsContent value="list">
          <TaskTable
            data={tasks.data}
            loading={tasks.isLoading}
            hideProject
            projectId={projectId}
          />
        </TabsContent>

        <TabsContent value="timeline">
          <Timeline project={project} tasks={tasks.data?.items ?? []} />
        </TabsContent>

        <TabsContent value="roadmap">
          <Roadmap data={roadmap.data} />
        </TabsContent>

        <TabsContent value="documents">
          <Section contentClassName="p-0">
            <ul>
              {data.documents.map((doc) => (
                <li key={doc.id} className="border-b border-border/60 last:border-0">
                  <Link
                    href={`/documents/${doc.id}`}
                    className="flex items-center gap-2 px-4 py-2.5 hover:bg-surface-2"
                  >
                    <FileText className="h-3.5 w-3.5 text-faint" />
                    <span className="flex-1 truncate text-[13px]">{doc.title}</span>
                    <span className="text-[11px] text-faint">{humanize(doc.doc_type)}</span>
                  </Link>
                </li>
              ))}
              {!data.documents.length ? (
                <div className="p-4">
                  <EmptyState icon={FileText} title={t("common.empty")} />
                </div>
              ) : null}
            </ul>
          </Section>
        </TabsContent>

        <TabsContent value="activity">
          <Section>
            <ActivityFeed items={activity.data ?? []} />
          </Section>
        </TabsContent>
      </Tabs>

      <TaskDialog
        open={createTask}
        onOpenChange={setCreateTask}
        defaults={{ project_id: projectId }}
      />
    </div>
  );
}

/** Compact Gantt: milestones and dated tasks laid out on the project's own span. */
function Timeline({ project, tasks }: { project: ProjectDetail; tasks: Task[] }) {
  const t = useT();
  const { locale } = useI18n();
  const dated = tasks.filter((task) => task.due_date);
  const dates = [
    project.start_date,
    project.end_date,
    ...project.milestones.map((milestone) => milestone.due_date),
    ...dated.map((task) => task.due_date),
  ].filter(Boolean) as string[];

  if (!dates.length) return <EmptyState icon={Calendar} title={t("common.empty")} />;

  const times = dates.map((date) => new Date(date).getTime());
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(max - min, 86400000);
  const position = (date: string) => ((new Date(date).getTime() - min) / span) * 100;
  const today = Date.now();
  const todayPosition = ((today - min) / span) * 100;

  return (
    <Section contentClassName="p-4">
      <div className="relative">
        {todayPosition >= 0 && todayPosition <= 100 ? (
          <div
            className="absolute top-0 z-10 h-full w-px bg-accent/60"
            style={{ insetInlineStart: `${todayPosition}%` }}
          >
            <span className="absolute -top-4 -translate-x-1/2 rounded bg-accent-solid px-1 text-[9px] text-accent-fg">
              {t("common.today")}
            </span>
          </div>
        ) : null}
        <div className="space-y-1.5 pt-4">
          {project.milestones.map((milestone) => (
            <TimelineRow
              key={milestone.id}
              label={milestone.name}
              at={milestone.due_date ? position(milestone.due_date) : 0}
              tone="var(--accent)"
              caption={formatDate(milestone.due_date, locale)}
              strong
            />
          ))}
          {dated.slice(0, 24).map((task) => (
            <TimelineRow
              key={task.id}
              label={`${task.key} ${task.title}`}
              at={position(task.due_date!)}
              tone={
                task.status === "done"
                  ? "var(--positive)"
                  : isOverdue(task.due_date)
                    ? "var(--danger)"
                    : "var(--info)"
              }
              caption={formatDate(task.due_date, locale)}
              href={`/tasks/${task.id}`}
            />
          ))}
        </div>
      </div>
    </Section>
  );
}

function TimelineRow({
  label,
  at,
  tone,
  caption,
  strong,
  href,
}: {
  label: string;
  at: number;
  tone: string;
  caption: string;
  strong?: boolean;
  href?: string;
}) {
  const content = (
    <div className="group relative flex h-6 items-center">
      <span
        className={cn(
          "absolute truncate text-[11px] transition-colors",
          strong ? "font-medium text-text" : "text-muted group-hover:text-text",
        )}
        style={{
          insetInlineStart: `min(${at}%, 78%)`,
          maxWidth: "40%",
          paddingInlineStart: 12,
        }}
      >
        {label} <span className="text-faint">· {caption}</span>
      </span>
      <span
        className="absolute h-2 w-2 rounded-full ring-2 ring-surface"
        style={{ insetInlineStart: `min(${at}%, 78%)`, background: tone }}
      />
      <span className="absolute inset-x-0 h-px bg-border" />
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function Roadmap({ data }: { data?: any }) {
  const t = useT();
  const { locale } = useI18n();
  if (!data) return <LoadingPanel />;
  if (!data.epics?.length) return <EmptyState icon={Target} title={t("common.empty")} />;

  return (
    <div className="space-y-3">
      {data.epics.map((epic: any) => (
        <Section
          key={epic.id}
          title={
            <span className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-faint">{epic.key}</span>
              {epic.title}
              <StatusBadge status={epic.status} />
            </span>
          }
          action={
            <span className="flex items-center gap-2 text-[11px] text-muted">
              {epic.progress}%
              <Progress value={epic.progress} className="w-20" />
            </span>
          }
          contentClassName="p-0"
        >
          <ul>
            {epic.children.map((child: any) => (
              <li key={child.id} className="border-b border-border/60 last:border-0">
                <Link
                  href={`/tasks/${child.id}`}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2"
                >
                  <span className="font-mono text-[11px] text-faint">{child.key}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">{child.title}</span>
                  {child.assignee ? (
                    <Avatar
                      name={child.assignee.full_name}
                      color={child.assignee.avatar_color}
                      size={18}
                    />
                  ) : null}
                  <span className="text-[11px] text-muted">{formatDate(child.due_date, locale)}</span>
                  <StatusBadge status={child.status} />
                </Link>
              </li>
            ))}
            {!epic.children.length ? (
              <p className="p-4 text-[13px] text-faint">{t("common.empty")}</p>
            ) : null}
          </ul>
        </Section>
      ))}
    </div>
  );
}
