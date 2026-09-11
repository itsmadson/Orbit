"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Plus, Target } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useI18n, useT } from "@/lib/i18n";
import { useCreate, useCreateParam, useItem } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import type { Goal } from "@/lib/types";
import { PageHeader, Section } from "@/components/shared/page";
import { LoadingPanel } from "@/components/shared/entity";
import { Avatar, Badge, EmptyState, Progress, StatusBadge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { UserPicker, useProjects } from "@/components/shared/pickers";
import { cn, formatDate, humanize } from "@/lib/utils";

const LEVELS = ["company", "department", "team", "individual"];

export function GoalsView() {
  const t = useT();
  const { can } = useSession();
  const [createOpen, setCreateOpen] = useCreateParam();
  const tree = useItem<(Goal & { children: Goal[] })[]>("/goals/tree");

  return (
    <div>
      <PageHeader
        title={t("goals.title")}
        subtitle="Objectives and key results, cascaded from company to individual"
        actions={
          can("goals.write") ? (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("goals.new")}
            </Button>
          ) : null
        }
      />

      {tree.isLoading ? (
        <LoadingPanel />
      ) : !tree.data?.length ? (
        <EmptyState icon={Target} title={t("common.empty")} />
      ) : (
        <div className="space-y-3">
          {tree.data.map((goal) => (
            <GoalNode key={goal.id} goal={goal} />
          ))}
        </div>
      )}

      <GoalDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function GoalNode({ goal, depth = 0 }: { goal: Goal & { children?: Goal[] }; depth?: number }) {
  const t = useT();
  const { locale } = useI18n();
  const client = useQueryClient();
  const { can } = useSession();
  const [open, setOpen] = React.useState(depth < 1);

  const updateKr = async (krId: string, value: number) => {
    try {
      await api.patch(`/goals/${goal.id}/key-results/${krId}`, { current_value: value });
      client.invalidateQueries({ queryKey: ["/goals/tree"] });
      client.invalidateQueries({ queryKey: ["/goals"] });
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div style={{ marginInlineStart: depth * 20 }}>
      <div className="panel overflow-hidden">
        <div className="flex items-start gap-3 p-4">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="mt-0.5 rounded p-0.5 text-faint transition-colors hover:text-text"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90 rtl:rotate-90")} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{humanize(goal.level)}</Badge>
              <p className="text-[14px] font-medium">{goal.objective}</p>
              <StatusBadge status={goal.status} />
            </div>
            {goal.description ? (
              <p className="mt-1 text-[12px] text-muted">{goal.description}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted">
              {goal.owner ? (
                <span className="flex items-center gap-1.5">
                  <Avatar name={goal.owner.full_name} color={goal.owner.avatar_color} size={16} />
                  {goal.owner.full_name}
                </span>
              ) : null}
              <span>{goal.period}</span>
              {goal.due_date ? <span>{formatDate(goal.due_date, locale)}</span> : null}
              {goal.project_id ? (
                <Link href={`/projects/${goal.project_id}`} className="text-accent hover:underline">
                  {goal.project_name}
                </Link>
              ) : null}
            </div>
          </div>
          <div className="w-28 shrink-0 text-end">
            <span className="text-[17px] font-semibold">{goal.progress}%</span>
            <Progress
              value={goal.progress}
              className="mt-1"
              tone={
                goal.progress >= 70
                  ? "var(--positive)"
                  : goal.progress >= 40
                    ? "var(--accent)"
                    : "var(--warning)"
              }
            />
          </div>
        </div>

        {open && goal.key_results?.length ? (
          <ul className="border-t border-border">
            {goal.key_results.map((kr) => (
              <li
                key={kr.id}
                className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-0"
              >
                <Target className="h-3.5 w-3.5 shrink-0 text-faint" />
                <span className="min-w-0 flex-1 truncate text-[13px]">{kr.title}</span>
                {can("goals.write") ? (
                  <Input
                    type="number"
                    defaultValue={kr.current_value}
                    onBlur={(event) => {
                      const value = Number(event.target.value);
                      if (value !== kr.current_value) updateKr(kr.id, value);
                    }}
                    className="h-7 w-24"
                  />
                ) : (
                  <span className="text-[12px]">{kr.current_value}</span>
                )}
                <span className="w-20 text-[11px] text-faint">
                  / {kr.target_value} {kr.unit ?? ""}
                </span>
                <Progress value={kr.progress} className="w-24" />
                <span className="w-10 text-end text-[11px] text-muted">{kr.progress}%</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {open && goal.children?.length ? (
        <div className="mt-2 space-y-2">
          {goal.children.map((child) => (
            <GoalNode key={child.id} goal={child as any} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GoalDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const projects = useProjects();
  const goals = useItem<Goal[]>("/goals", { root_only: false });
  const departments = useItem<any[]>("/departments");
  const [form, setForm] = React.useState({
    objective: "",
    description: "",
    level: "department",
    parent_id: "",
    owner_id: null as string | null,
    department_id: "",
    project_id: "",
    period: `Q${Math.floor(new Date().getMonth() / 3) + 1} ${new Date().getFullYear()}`,
    due_date: "",
  });
  const [keyResults, setKeyResults] = React.useState([
    { title: "", start_value: 0, current_value: 0, target_value: 100, unit: "" },
  ]);

  const create = useCreate<Goal>("/goals", {
    invalidate: ["/goals", "/goals/tree", "dashboard"],
    success: "Goal created",
    onDone: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader title={t("goals.new")} />
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({
              ...form,
              parent_id: form.parent_id || null,
              department_id: form.department_id || null,
              project_id: form.project_id || null,
              due_date: form.due_date || null,
              key_results: keyResults.filter((kr) => kr.title.trim()),
            } as any);
          }}
        >
          <Field label={t("goals.objective")}>
            <Input
              required
              autoFocus
              value={form.objective}
              onChange={(event) => setForm({ ...form, objective: event.target.value })}
            />
          </Field>
          <Field label={t("common.description")}>
            <Textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("goals.level")}>
              <SimpleSelect
                value={form.level}
                onValueChange={(level) => setForm({ ...form, level })}
                options={LEVELS.map((value) => ({ value, label: humanize(value) }))}
              />
            </Field>
            <Field label="Parent goal">
              <SimpleSelect
                value={form.parent_id}
                onValueChange={(parent_id) => setForm({ ...form, parent_id })}
                placeholder={t("common.none")}
                options={(goals.data ?? []).map((goal) => ({
                  value: goal.id,
                  label: goal.objective,
                }))}
              />
            </Field>
            <Field label={t("common.owner")}>
              <UserPicker value={form.owner_id} onChange={(owner_id) => setForm({ ...form, owner_id })} />
            </Field>
            <Field label={t("common.department")}>
              <SimpleSelect
                value={form.department_id}
                onValueChange={(department_id) => setForm({ ...form, department_id })}
                placeholder={t("common.none")}
                options={(departments.data ?? []).map((item) => ({ value: item.id, label: item.name }))}
              />
            </Field>
            <Field label={t("common.project")}>
              <SimpleSelect
                value={form.project_id}
                onValueChange={(project_id) => setForm({ ...form, project_id })}
                placeholder={t("common.none")}
                options={(projects.data?.items ?? []).map((project) => ({
                  value: project.id,
                  label: project.name,
                }))}
              />
            </Field>
            <Field label={t("goals.period")}>
              <Input
                value={form.period}
                onChange={(event) => setForm({ ...form, period: event.target.value })}
              />
            </Field>
          </div>

          <Field label={t("goals.keyResults")}>
            <div className="space-y-2">
              {keyResults.map((kr, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    className="flex-1"
                    placeholder="Key result"
                    value={kr.title}
                    onChange={(event) => {
                      const next = [...keyResults];
                      next[index] = { ...kr, title: event.target.value };
                      setKeyResults(next);
                    }}
                  />
                  <Input
                    className="w-20"
                    type="number"
                    placeholder="now"
                    value={kr.current_value}
                    onChange={(event) => {
                      const next = [...keyResults];
                      next[index] = { ...kr, current_value: Number(event.target.value) };
                      setKeyResults(next);
                    }}
                  />
                  <Input
                    className="w-20"
                    type="number"
                    placeholder="target"
                    value={kr.target_value}
                    onChange={(event) => {
                      const next = [...keyResults];
                      next[index] = { ...kr, target_value: Number(event.target.value) };
                      setKeyResults(next);
                    }}
                  />
                  <Input
                    className="w-20"
                    placeholder="unit"
                    value={kr.unit}
                    onChange={(event) => {
                      const next = [...keyResults];
                      next[index] = { ...kr, unit: event.target.value };
                      setKeyResults(next);
                    }}
                  />
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  setKeyResults([
                    ...keyResults,
                    { title: "", start_value: 0, current_value: 0, target_value: 100, unit: "" },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" />
                {t("action.add")}
              </Button>
            </div>
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
