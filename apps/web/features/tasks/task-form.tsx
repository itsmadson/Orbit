"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { TagInput, UserPicker, useProjects } from "@/components/shared/pickers";
import { useCreate } from "@/lib/hooks";
import type { Task } from "@/lib/types";

export const TASK_TYPES = ["task", "bug", "feature", "story", "epic", "subtask"];
export const TASK_STATUSES = ["backlog", "todo", "in_progress", "in_review", "done"];
export const PRIORITIES = ["low", "medium", "high", "urgent"];

export function TaskDialog({
  open,
  onOpenChange,
  defaults,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: Partial<Task> & { project_id?: string | null; status?: string };
  onCreated?: (task: Task) => void;
}) {
  const t = useT();
  const client = useQueryClient();
  const projects = useProjects();
  const [form, setForm] = React.useState({
    title: "",
    description: "",
    project_id: defaults?.project_id ?? "",
    type: defaults?.type ?? "task",
    status: defaults?.status ?? "todo",
    priority: defaults?.priority ?? "medium",
    assignee_id: null as string | null,
    due_date: "",
    estimate: "",
    labels: [] as string[],
  });

  React.useEffect(() => {
    if (open) {
      setForm((current) => ({
        ...current,
        project_id: defaults?.project_id ?? current.project_id,
        status: defaults?.status ?? current.status,
      }));
    }
  }, [open, defaults?.project_id, defaults?.status]);

  const create = useCreate<Task>("/tasks", {
    invalidate: ["/tasks", "/tasks/board", "/projects", "dashboard"],
    success: "Task created",
    onDone: (task) => {
      onOpenChange(false);
      setForm({ ...form, title: "", description: "", labels: [] });
      client.invalidateQueries({ queryKey: ["dashboard"] });
      onCreated?.(task);
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    create.mutate({
      ...form,
      project_id: form.project_id || null,
      due_date: form.due_date || null,
      estimate: form.estimate ? Number(form.estimate) : null,
    } as any);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader title={t("tasks.new")} />
        <form onSubmit={submit} className="space-y-3">
          <Field label={t("common.title")}>
            <Input
              required
              autoFocus
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="What needs to be done?"
            />
          </Field>
          <Field label={t("common.description")}>
            <Textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("common.project")}>
              <SimpleSelect
                value={form.project_id}
                onValueChange={(project_id) => setForm({ ...form, project_id })}
                placeholder={t("common.none")}
                options={(projects.data?.items ?? []).map((project) => ({
                  value: project.id,
                  label: `${project.icon} ${project.name}`,
                }))}
              />
            </Field>
            <Field label={t("common.type")}>
              <SimpleSelect
                value={form.type}
                onValueChange={(type) => setForm({ ...form, type })}
                options={TASK_TYPES.map((value) => ({ value, label: value }))}
              />
            </Field>
            <Field label={t("common.status")}>
              <SimpleSelect
                value={form.status}
                onValueChange={(status) => setForm({ ...form, status })}
                options={TASK_STATUSES.map((value) => ({ value, label: value.replace("_", " ") }))}
              />
            </Field>
            <Field label={t("common.priority")}>
              <SimpleSelect
                value={form.priority}
                onValueChange={(priority) => setForm({ ...form, priority })}
                options={PRIORITIES.map((value) => ({ value, label: value }))}
              />
            </Field>
            <Field label={t("common.assignee")}>
              <UserPicker
                value={form.assignee_id}
                onChange={(assignee_id) => setForm({ ...form, assignee_id })}
              />
            </Field>
            <Field label={t("common.dueDate")}>
              <Input
                type="date"
                value={form.due_date}
                onChange={(event) => setForm({ ...form, due_date: event.target.value })}
              />
            </Field>
            <Field label={t("tasks.estimate")}>
              <Input
                type="number"
                step="0.5"
                value={form.estimate}
                onChange={(event) => setForm({ ...form, estimate: event.target.value })}
                placeholder="8"
              />
            </Field>
            <Field label={t("tasks.labels")}>
              <TagInput value={form.labels} onChange={(labels) => setForm({ ...form, labels })} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("action.cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              {t("action.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
