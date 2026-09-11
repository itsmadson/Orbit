"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { MultiUserPicker, UserPicker } from "@/components/shared/pickers";
import { useCreate } from "@/lib/hooks";
import type { ProjectSummary } from "@/lib/types";

const STATUSES = ["planning", "active", "on_hold", "completed", "cancelled"];
const PRIORITIES = ["low", "medium", "high", "urgent"];
const ICONS = ["🚀", "🛰️", "💠", "📱", "📦", "🧭", "🧪", "🏗️", "⚡", "🎯"];

export function ProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const router = useRouter();
  const client = useQueryClient();
  const [form, setForm] = React.useState({
    name: "",
    description: "",
    status: "planning",
    priority: "medium",
    icon: "🚀",
    color: "#f5501b",
    start_date: "",
    end_date: "",
    budget: "",
    lead_id: null as string | null,
    member_ids: [] as string[],
  });

  const create = useCreate<ProjectSummary>("/projects", {
    invalidate: ["/projects"],
    success: "Project created",
    onDone: (project) => {
      onOpenChange(false);
      client.invalidateQueries({ queryKey: ["dashboard"] });
      router.push(`/projects/${project.id}`);
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    create.mutate({
      ...form,
      budget: form.budget ? Number(form.budget) : null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    } as any);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader title={t("projects.new")} description={t("app.tagline")} />
        <form onSubmit={submit} className="space-y-3">
          <div className="flex gap-2">
            <div className="w-[72px]">
              <Field label="Icon">
                <SimpleSelect
                  value={form.icon}
                  onValueChange={(icon) => setForm({ ...form, icon })}
                  options={ICONS.map((icon) => ({ value: icon, label: icon }))}
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
                  placeholder="Project Atlas"
                />
              </Field>
            </div>
          </div>
          <Field label={t("common.description")}>
            <Textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="What is this project for?"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("common.status")}>
              <SimpleSelect
                value={form.status}
                onValueChange={(status) => setForm({ ...form, status })}
                options={STATUSES.map((value) => ({ value, label: value.replace("_", " ") }))}
              />
            </Field>
            <Field label={t("common.priority")}>
              <SimpleSelect
                value={form.priority}
                onValueChange={(priority) => setForm({ ...form, priority })}
                options={PRIORITIES.map((value) => ({ value, label: value }))}
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
            <Field label="Start date">
              <Input
                type="date"
                value={form.start_date}
                onChange={(event) => setForm({ ...form, start_date: event.target.value })}
              />
            </Field>
            <Field label="End date">
              <Input
                type="date"
                value={form.end_date}
                onChange={(event) => setForm({ ...form, end_date: event.target.value })}
              />
            </Field>
          </div>
          <Field label={t("common.members")}>
            <MultiUserPicker
              value={form.member_ids}
              onChange={(member_ids) => setForm({ ...form, member_ids })}
            />
          </Field>
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
