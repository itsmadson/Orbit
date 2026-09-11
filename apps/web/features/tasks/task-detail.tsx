"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Link2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n, useT } from "@/lib/i18n";
import { useItem, useRemove } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import type { Task } from "@/lib/types";
import { PageHeader, Section } from "@/components/shared/page";
import { Attachments, Comments, DetailRow, LoadingPanel, RelatedPanel } from "@/components/shared/entity";
import { ActivityFeed } from "@/components/shared/entity";
import { Avatar, Badge, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { SimpleSelect } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { UserPicker } from "@/components/shared/pickers";
import { RichEditor, ReadOnlyHtml } from "@/components/shared/editor";
import { PRIORITIES, TASK_STATUSES, TASK_TYPES } from "@/features/tasks/task-form";
import { TYPE_COLORS, TYPE_ICONS } from "@/features/tasks/task-card";
import { cn, formatDate, isOverdue } from "@/lib/utils";
import { toast } from "sonner";

export function TaskDetail({ taskId }: { taskId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const router = useRouter();
  const client = useQueryClient();
  const { can } = useSession();
  const canWrite = can("tasks.write");
  const [editingDescription, setEditingDescription] = React.useState(false);
  const [draft, setDraft] = React.useState("");

  const { data: task, isLoading } = useItem<Task>(`/tasks/${taskId}`);
  const activity = useItem<any[]>(`/audit`, { entity_type: "task", entity_id: taskId, page_size: 30 });

  const patch = async (body: Partial<Task>) => {
    try {
      await api.patch(`/tasks/${taskId}`, body);
      client.invalidateQueries({ queryKey: [`/tasks/${taskId}`] });
      client.invalidateQueries({ queryKey: ["/tasks"] });
      client.invalidateQueries({ queryKey: ["/tasks/board"] });
      client.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const confirm = useConfirm();
  const remove = useRemove((id) => `/tasks/${id}`, {
    invalidate: ["/tasks", "/tasks/board"],
    success: "Task deleted",
    onDone: () => router.push("/tasks"),
  });

  if (isLoading || !task) return <LoadingPanel />;
  const Icon = TYPE_ICONS[task.type] ?? CheckSquare;

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { label: t("nav.tasks"), href: "/tasks" },
          ...(task.project ? [{ label: task.project.name, href: `/projects/${task.project.id}` }] : []),
          { label: task.key },
        ]}
        icon={<Icon className={cn("h-5 w-5", TYPE_COLORS[task.type])} />}
        title={task.title}
        subtitle={
          <span className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-faint">{task.key}</span>
            {task.reporter ? (
              <span className="text-[12px]">
                {t("tasks.reporter")}: {task.reporter.full_name}
              </span>
            ) : null}
          </span>
        }
        actions={
          canWrite ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                const ok = await confirm({
                  title: `${t("action.delete")} ${task.key}`,
                  body: t("tasks.deleteConfirm").replace("{title}", task.title),
                  confirmLabel: t("action.delete"),
                  destructive: true,
                });
                if (ok) remove.mutate(task.id);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Section
            title={t("common.description")}
            action={
              canWrite ? (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setDraft(task.description ?? "");
                    setEditingDescription(!editingDescription);
                  }}
                >
                  {editingDescription ? t("action.cancel") : t("action.edit")}
                </Button>
              ) : null
            }
          >
            {editingDescription ? (
              <div className="space-y-2">
                <RichEditor content={draft} onChange={setDraft} minHeight="160px" />
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={async () => {
                      await patch({ description: draft });
                      setEditingDescription(false);
                    }}
                  >
                    {t("action.save")}
                  </Button>
                </div>
              </div>
            ) : task.description ? (
              <ReadOnlyHtml html={task.description} />
            ) : (
              <p className="text-[13px] text-faint">{t("common.empty")}</p>
            )}
          </Section>

          {task.subtasks?.length || task.blocked_by?.length || task.blocks?.length ? (
            <Section title={`${t("tasks.subtasks")} & ${t("tasks.dependencies")}`} contentClassName="p-0">
              <ul>
                {task.blocked_by?.map((item) => (
                  <LinkedTask key={item.id} task={item} label={t("tasks.blockedBy")} tone="danger" />
                ))}
                {task.blocks?.map((item) => (
                  <LinkedTask key={item.id} task={item} label={t("tasks.blocks")} tone="warning" />
                ))}
                {task.subtasks?.map((item) => (
                  <LinkedTask key={item.id} task={item} label={t("tasks.subtasks")} />
                ))}
              </ul>
            </Section>
          ) : null}

          <Tabs defaultValue="comments">
            <TabsList className="mb-3">
              <TabsTrigger value="comments" count={task.comment_count}>
                {t("common.comments")}
              </TabsTrigger>
              <TabsTrigger value="attachments">{t("common.attachments")}</TabsTrigger>
              <TabsTrigger value="activity">{t("common.activity")}</TabsTrigger>
            </TabsList>
            <TabsContent value="comments">
              <Comments entityType="task" entityId={task.id} />
            </TabsContent>
            <TabsContent value="attachments">
              <Attachments entityType="task" entityId={task.id} />
            </TabsContent>
            <TabsContent value="activity">
              <ActivityFeed items={(activity.data as any)?.items ?? []} />
            </TabsContent>
          </Tabs>
        </div>

        <aside className="space-y-4">
          <Section title={t("common.details")} contentClassName="p-3">
            <div className="divide-y divide-border/60">
              <DetailRow label={t("common.status")}>
                {canWrite ? (
                  <SimpleSelect
                    value={task.status}
                    onValueChange={(status) => patch({ status } as any)}
                    className="h-7 w-36"
                    options={TASK_STATUSES.map((value) => ({ value, label: value.replace("_", " ") }))}
                  />
                ) : (
                  <StatusBadge status={task.status} />
                )}
              </DetailRow>
              <DetailRow label={t("common.priority")}>
                {canWrite ? (
                  <SimpleSelect
                    value={task.priority}
                    onValueChange={(priority) => patch({ priority } as any)}
                    className="h-7 w-36"
                    options={PRIORITIES.map((value) => ({ value, label: value }))}
                  />
                ) : (
                  <span>{task.priority}</span>
                )}
              </DetailRow>
              <DetailRow label={t("common.type")}>
                {canWrite ? (
                  <SimpleSelect
                    value={task.type}
                    onValueChange={(type) => patch({ type } as any)}
                    className="h-7 w-36"
                    options={TASK_TYPES.map((value) => ({ value, label: value }))}
                  />
                ) : (
                  <span>{task.type}</span>
                )}
              </DetailRow>
              <DetailRow label={t("common.assignee")}>
                {canWrite ? (
                  <div className="w-40">
                    <UserPicker
                      value={task.assignee?.id ?? null}
                      onChange={(assignee_id) => patch({ assignee_id } as any)}
                    />
                  </div>
                ) : task.assignee ? (
                  <span className="flex items-center gap-1.5">
                    <Avatar name={task.assignee.full_name} color={task.assignee.avatar_color} size={18} />
                    {task.assignee.full_name}
                  </span>
                ) : (
                  <span className="text-faint">{t("common.unassigned")}</span>
                )}
              </DetailRow>
              <DetailRow label={t("common.dueDate")}>
                {canWrite ? (
                  <Input
                    type="date"
                    className="h-7 w-36"
                    value={task.due_date ?? ""}
                    onChange={(event) => patch({ due_date: event.target.value || null } as any)}
                  />
                ) : (
                  <span className={cn(isOverdue(task.due_date) && "text-danger")}>
                    {formatDate(task.due_date, locale)}
                  </span>
                )}
              </DetailRow>
              <DetailRow label={t("tasks.estimate")}>
                <span>{task.estimate ? `${task.estimate}h` : "—"}</span>
              </DetailRow>
              <DetailRow label={t("common.project")}>
                {task.project ? (
                  <Link href={`/projects/${task.project.id}`} className="hover:text-accent">
                    {task.project.icon} {task.project.name}
                  </Link>
                ) : (
                  <span className="text-faint">—</span>
                )}
              </DetailRow>
              <DetailRow label={t("tasks.labels")}>
                {task.labels?.length ? (
                  <span className="flex flex-wrap justify-end gap-1">
                    {task.labels.map((label) => (
                      <Badge key={label}>{label}</Badge>
                    ))}
                  </span>
                ) : (
                  <span className="text-faint">—</span>
                )}
              </DetailRow>
              <DetailRow label={t("common.created")}>
                <span className="text-[12px] text-muted">{formatDate(task.created_at, locale)}</span>
              </DetailRow>
            </div>
          </Section>

          <Section
            title={
              <span className="flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" />
                {t("common.related")}
              </span>
            }
            contentClassName="p-2"
          >
            <RelatedPanel entityType="task" entityId={task.id} />
          </Section>
        </aside>
      </div>
    </div>
  );
}

function LinkedTask({
  task,
  label,
  tone,
}: {
  task: Task;
  label: string;
  tone?: "danger" | "warning";
}) {
  return (
    <li className="border-b border-border/60 last:border-0">
      <Link
        href={`/tasks/${task.id}`}
        className="flex items-center gap-2 px-4 py-2 transition-colors hover:bg-surface-2"
      >
        <span
          className={cn(
            "shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
            tone === "danger"
              ? "border-danger/30 bg-danger/10 text-danger"
              : tone === "warning"
                ? "border-warning/30 bg-warning/10 text-warning"
                : "border-border bg-surface-2 text-muted",
          )}
        >
          {label}
        </span>
        <span className="font-mono text-[11px] text-faint">{task.key}</span>
        <span className="min-w-0 flex-1 truncate text-[13px]">{task.title}</span>
        <StatusBadge status={task.status} />
      </Link>
    </li>
  );
}
