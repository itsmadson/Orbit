"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Target, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useHumanize, useI18n, useT } from "@/lib/i18n";
import { Section } from "@/components/shared/page";
import { Progress, StatusBadge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { cn, formatDate, isOverdue } from "@/lib/utils";

export type Milestone = {
  id: string;
  name: string;
  description?: string | null;
  due_date?: string | null;
  status: string;
  progress: number;
};

const STATUSES = ["planned", "in_progress", "completed", "cancelled"];

/** A project's milestones, editable in place by anyone who can write to it. */
export function ProjectMilestones({
  projectId,
  milestones,
  canWrite,
}: {
  projectId: string;
  milestones: Milestone[];
  canWrite: boolean;
}) {
  const t = useT();
  const { locale } = useI18n();
  const client = useQueryClient();
  const confirm = useConfirm();
  // `null` is closed, `"new"` creates, a milestone edits that one.
  const [editing, setEditing] = React.useState<Milestone | "new" | null>(null);

  const refresh = () => {
    client.invalidateQueries({ queryKey: [`/projects/${projectId}/overview`] });
    client.invalidateQueries({ queryKey: [`/projects/${projectId}/roadmap`] });
  };

  async function remove(milestone: Milestone) {
    const ok = await confirm({
      title: `${t("action.delete")} ${milestone.name}`,
      body: t("common.deleteConfirm").replace("{title}", milestone.name),
      confirmLabel: t("action.delete"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/projects/${projectId}/milestones/${milestone.id}`);
      toast.success(t("common.deleted"));
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? t("common.requestFailed"));
    }
  }

  return (
    <Section
      title={t("projects.milestones")}
      action={
        canWrite ? (
          <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
            <Plus className="h-3.5 w-3.5" />
            {t("action.add")}
          </Button>
        ) : null
      }
      contentClassName="p-0"
    >
      {milestones.length ? (
        <ul>
          {milestones.map((milestone) => (
            <li
              key={milestone.id}
              className={cn(
                "group flex items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-0",
                canWrite && "cursor-pointer hover:bg-surface-2",
              )}
              onClick={canWrite ? () => setEditing(milestone) : undefined}
            >
              <Target className="h-3.5 w-3.5 shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate text-[13px]">{milestone.name}</span>
              <Progress value={milestone.progress} className="w-24" />
              <span className="w-10 text-end text-[11px] text-muted">{milestone.progress}%</span>
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
              {canWrite ? (
                <button
                  type="button"
                  aria-label={t("action.delete")}
                  title={t("action.delete")}
                  onClick={(event) => {
                    event.stopPropagation();
                    remove(milestone);
                  }}
                  className="rounded p-1 text-faint opacity-0 transition hover:text-danger focus:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-4 text-[13px] text-faint">{t("common.empty")}</p>
      )}

      <MilestoneDialog
        projectId={projectId}
        milestone={editing === "new" ? undefined : editing ?? undefined}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={refresh}
      />
    </Section>
  );
}

function MilestoneDialog({
  projectId,
  milestone,
  open,
  onOpenChange,
  onSaved,
}: {
  projectId: string;
  milestone?: Milestone;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useT();
  const humanize = useHumanize();
  const [busy, setBusy] = React.useState(false);
  const blank = { name: "", description: "", due_date: "", status: "planned", progress: "0" };
  const [form, setForm] = React.useState(blank);

  React.useEffect(() => {
    if (!open) return;
    setForm(
      milestone
        ? {
            name: milestone.name,
            description: milestone.description ?? "",
            due_date: milestone.due_date ?? "",
            status: milestone.status,
            progress: String(milestone.progress ?? 0),
          }
        : blank,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, milestone?.id]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    const body = {
      ...form,
      description: form.description || null,
      due_date: form.due_date || null,
      progress: Math.max(0, Math.min(100, Number(form.progress) || 0)),
    };
    try {
      if (milestone) {
        await api.patch(`/projects/${projectId}/milestones/${milestone.id}`, body);
      } else {
        await api.post(`/projects/${projectId}/milestones`, body);
      }
      toast.success(t("action.save"));
      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.message ?? t("common.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title={milestone ? t("projects.editMilestone") : t("projects.newMilestone")} />
        <form onSubmit={submit} className="space-y-3">
          <Field label={t("common.name")}>
            <Input
              required
              autoFocus
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label={t("common.description")}>
            <Textarea
              rows={2}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("common.dueDate")}>
              <Input
                type="date"
                value={form.due_date}
                onChange={(event) => setForm({ ...form, due_date: event.target.value })}
              />
            </Field>
            <Field label={t("common.status")}>
              <SimpleSelect
                value={form.status}
                onValueChange={(status) =>
                  setForm({ ...form, status, progress: status === "completed" ? "100" : form.progress })
                }
                options={STATUSES.map((value) => ({ value, label: humanize(value) }))}
              />
            </Field>
            <Field label={t("common.progress")} hint="0–100">
              <Input
                type="number"
                min={0}
                max={100}
                value={form.progress}
                onChange={(event) => setForm({ ...form, progress: event.target.value })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("action.cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              {milestone ? t("action.save") : t("action.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
