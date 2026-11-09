"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useHumanize, useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { MultiUserPicker, UserPicker } from "@/components/shared/pickers";
import { useCreate, useUpdate } from "@/lib/hooks";
import type { ProjectSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUSES = ["planning", "active", "on_hold", "completed", "cancelled"];
const PRIORITIES = ["low", "medium", "high", "urgent"];
const ICONS = ["🚀", "🛰️", "💠", "📱", "📦", "🧭", "🧪", "🏗️", "⚡", "🎯"];
const COLORS = ["#f5501b", "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#64748b"];

/** The fields the dialog edits; a project from the API fits it as-is. */
type EditableProject = ProjectSummary & { description?: string | null };

function initialForm(project?: EditableProject) {
  return {
    name: project?.name ?? "",
    description: project?.description ?? "",
    status: project?.status ?? "planning",
    priority: project?.priority ?? "medium",
    icon: project?.icon ?? "🚀",
    color: project?.color ?? "#f5501b",
    start_date: project?.start_date ?? "",
    end_date: project?.end_date ?? "",
    budget: project?.budget != null ? String(project.budget) : "",
    lead_id: (project?.lead?.id ?? null) as string | null,
    member_ids: [] as string[],
  };
}

/** Creates a project, or edits one when `project` is passed. */
export function ProjectDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: EditableProject;
}) {
  const humanize = useHumanize();
  const t = useT();
  const router = useRouter();
  const client = useQueryClient();
  const editing = Boolean(project);
  const [form, setForm] = React.useState(() => initialForm(project));

  // Reopening the editor starts from the project as it is now, not a stale draft.
  // Keyed on the id so a background refetch does not wipe what is being typed.
  React.useEffect(() => {
    if (open) setForm(initialForm(project));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?.id]);

  const create = useCreate<ProjectSummary>("/projects", {
    invalidate: ["/projects"],
    success: t("projects.created"),
    onDone: (project) => {
      onOpenChange(false);
      client.invalidateQueries({ queryKey: ["dashboard"] });
      router.push(`/projects/${project.id}`);
    },
  });

  const update = useUpdate<ProjectSummary>(() => `/projects/${project?.id}`, {
    invalidate: ["/projects", `/projects/${project?.id}/overview`, "dashboard"],
    success: t("projects.saved"),
    onDone: () => onOpenChange(false),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const body = {
      ...form,
      budget: form.budget ? Number(form.budget) : null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    };
    if (editing) {
      // Members are managed on the project page itself.
      const { member_ids: _members, ...changes } = body;
      update.mutate({ body: changes } as any);
    } else {
      create.mutate(body as any);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader
          title={editing ? t("projects.edit") : t("projects.new")}
          description={editing ? project?.key : t("app.tagline")}
        />
        <form onSubmit={submit} className="space-y-3">
          <div className="flex gap-2">
            <div className="w-[72px]">
              <Field label={t("projects.icon")}>
                <SimpleSelect
                  value={form.icon}
                  onValueChange={(icon) => setForm({ ...form, icon })}
                  options={(ICONS.includes(form.icon) ? ICONS : [form.icon, ...ICONS]).map((icon) => ({
                    value: icon,
                    label: icon,
                  }))}
                />
              </Field>
            </div>
            <div className="flex-1">
              <Field label={t("common.name")}>
                <Input
                  required
                  autoFocus
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder={t("projects.namePlaceholder")}
                />
              </Field>
            </div>
          </div>
          <Field label={t("common.description")}>
            <Textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder={t("projects.descriptionPlaceholder")}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("common.status")}>
              <SimpleSelect
                value={form.status}
                onValueChange={(status) => setForm({ ...form, status })}
                options={STATUSES.map((value) => ({ value, label: humanize(value) }))}
              />
            </Field>
            <Field label={t("common.priority")}>
              <SimpleSelect
                value={form.priority}
                onValueChange={(priority) => setForm({ ...form, priority })}
                options={PRIORITIES.map((value) => ({ value, label: humanize(value) }))}
              />
            </Field>
            <Field label={t("projects.lead")}>
              <UserPicker value={form.lead_id} onChange={(lead_id) => setForm({ ...form, lead_id })} />
            </Field>
            <Field label={t("common.budget")}>
              <Input
                type="number"
                value={form.budget}
                onChange={(event) => setForm({ ...form, budget: event.target.value })}
                placeholder="50000"
              />
            </Field>
            <Field label={t("common.startDate")}>
              <Input
                type="date"
                value={form.start_date}
                onChange={(event) => setForm({ ...form, start_date: event.target.value })}
              />
            </Field>
            <Field label={t("common.endDate")}>
              <Input
                type="date"
                value={form.end_date}
                onChange={(event) => setForm({ ...form, end_date: event.target.value })}
              />
            </Field>
          </div>
          <Field label={t("projects.color")}>
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={color}
                  onClick={() => setForm({ ...form, color })}
                  className={cn(
                    "h-6 w-6 rounded-full ring-offset-2 ring-offset-surface transition",
                    form.color === color ? "ring-2 ring-text" : "hover:scale-110",
                  )}
                  style={{ background: color }}
                />
              ))}
            </div>
          </Field>
          {editing ? null : (
            <Field label={t("common.members")}>
              <MultiUserPicker
                value={form.member_ids}
                onChange={(member_ids) => setForm({ ...form, member_ids })}
              />
            </Field>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("action.cancel")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={create.isPending || update.isPending}
            >
              {editing ? t("action.save") : t("action.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
