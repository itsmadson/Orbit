"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Boxes, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useHumanize, useT } from "@/lib/i18n";
import { Section } from "@/components/shared/page";
import { UserPicker } from "@/components/shared/pickers";
import { Avatar, StatusBadge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";

export type ModuleMember = { id: string; role: string; user: any };

export type ProjectModule = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  color: string;
  members: ModuleMember[];
};

const STATUSES = ["planned", "active", "on_hold", "completed"];
export const MODULE_ROLES = ["developer", "lead", "tester", "designer", "reviewer"];

/** A project's sub-modules, each with the people (developers by default) who work on it. */
export function ProjectModules({
  projectId,
  modules,
  canWrite,
}: {
  projectId: string;
  modules: ProjectModule[];
  canWrite: boolean;
}) {
  const t = useT();
  const client = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = React.useState<ProjectModule | "new" | null>(null);

  const refresh = () => {
    client.invalidateQueries({ queryKey: [`/projects/${projectId}/overview`] });
  };

  async function remove(module: ProjectModule) {
    const ok = await confirm({
      title: `${t("action.delete")} ${module.name}`,
      body: t("common.deleteConfirm").replace("{title}", module.name),
      confirmLabel: t("action.delete"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/projects/${projectId}/modules/${module.id}`);
      toast.success(t("common.deleted"));
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? t("common.requestFailed"));
    }
  }

  return (
    <Section
      title={t("projects.modules")}
      action={
        canWrite ? (
          <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
            <Plus className="h-3.5 w-3.5" />
            {t("projects.newModule")}
          </Button>
        ) : null
      }
      contentClassName="p-0"
    >
      {modules.length ? (
        <ul>
          {modules.map((module) => (
            <ModuleRow
              key={module.id}
              projectId={projectId}
              module={module}
              canWrite={canWrite}
              onEdit={() => setEditing(module)}
              onDelete={() => remove(module)}
              onChanged={refresh}
            />
          ))}
        </ul>
      ) : (
        <p className="p-4 text-[13px] text-faint">{t("projects.noModules")}</p>
      )}

      <ModuleDialog
        projectId={projectId}
        module={editing === "new" ? undefined : editing ?? undefined}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={refresh}
      />
    </Section>
  );
}

function ModuleRow({
  projectId,
  module,
  canWrite,
  onEdit,
  onDelete,
  onChanged,
}: {
  projectId: string;
  module: ProjectModule;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const [role, setRole] = React.useState("developer");
  const roleOptions = MODULE_ROLES.map((value) => ({
    value,
    label: t(`projects.moduleRole.${value}`),
  }));
  const base = `/projects/${projectId}/modules/${module.id}`;

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      onChanged();
    } catch (error: any) {
      toast.error(error?.message ?? t("common.requestFailed"));
    }
  }

  return (
    <li className="group border-b border-border/60 px-4 py-3 last:border-0">
      <div className="flex items-center gap-3">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: module.color }} />
        <Boxes className="h-3.5 w-3.5 shrink-0 text-faint" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{module.name}</span>
        <span className="text-[11px] text-faint">
          {module.members.length} {t("common.members")}
        </span>
        <StatusBadge status={module.status} />
        {canWrite ? (
          <>
            <button
              type="button"
              aria-label={t("action.edit")}
              title={t("action.edit")}
              onClick={onEdit}
              className="rounded p-1 text-faint opacity-0 transition hover:text-accent focus:opacity-100 group-hover:opacity-100"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label={t("action.delete")}
              title={t("action.delete")}
              onClick={onDelete}
              className="rounded p-1 text-faint opacity-0 transition hover:text-danger focus:opacity-100 group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        ) : null}
      </div>
      {module.description ? (
        <p className="mt-1 ps-9 text-[12px] text-muted">{module.description}</p>
      ) : null}

      <div className="mt-2 space-y-1.5 ps-9">
        {module.members.map((member) => (
          <div key={member.id} className="group/m flex items-center gap-2">
            <Avatar name={member.user?.full_name} color={member.user?.avatar_color} size={20} />
            <Link
              href={`/employees/${member.user?.id}`}
              className="min-w-0 flex-1 truncate text-[12px] hover:text-accent"
            >
              {member.user?.full_name}
            </Link>
            {canWrite ? (
              <SimpleSelect
                value={member.role}
                onValueChange={(next) =>
                  run(() => api.post(`${base}/members`, { user_id: member.user?.id, role: next }))
                }
                options={roleOptions}
                className="h-7 w-32 text-[11px]"
              />
            ) : (
              <span className="text-[10px] uppercase tracking-wide text-faint">
                {t(`projects.moduleRole.${member.role}`)}
              </span>
            )}
            {canWrite ? (
              <button
                type="button"
                aria-label={t("action.remove")}
                title={t("action.remove")}
                onClick={() => run(() => api.delete(`${base}/members/${member.user?.id}`))}
                className="rounded p-0.5 text-faint opacity-0 transition hover:text-danger focus:opacity-100 group-hover/m:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ))}
        {canWrite ? (
          <div className="flex items-center gap-2 pt-1">
            <UserPicker
              value={null}
              placeholder={`+ ${t("projects.addToModule")}`}
              className="flex-1"
              onChange={(userId) => {
                if (!userId) return;
                run(() => api.post(`${base}/members`, { user_id: userId, role }));
              }}
            />
            <SimpleSelect
              value={role}
              onValueChange={setRole}
              options={roleOptions}
              className="h-8 w-32 text-[12px]"
            />
          </div>
        ) : null}
      </div>
    </li>
  );
}

function ModuleDialog({
  projectId,
  module,
  open,
  onOpenChange,
  onSaved,
}: {
  projectId: string;
  module?: ProjectModule;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useT();
  const humanize = useHumanize();
  const [busy, setBusy] = React.useState(false);
  const blank = { name: "", description: "", status: "active", color: "#6366f1" };
  const [form, setForm] = React.useState(blank);

  React.useEffect(() => {
    if (!open) return;
    setForm(
      module
        ? {
            name: module.name,
            description: module.description ?? "",
            status: module.status,
            color: module.color,
          }
        : blank,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, module?.id]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    const body = { ...form, name: form.name.trim(), description: form.description || null };
    try {
      if (module) {
        await api.patch(`/projects/${projectId}/modules/${module.id}`, body);
      } else {
        await api.post(`/projects/${projectId}/modules`, body);
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
        <DialogHeader title={module ? t("projects.editModule") : t("projects.newModule")} />
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
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("common.status")}>
              <SimpleSelect
                value={form.status}
                onValueChange={(status) => setForm({ ...form, status })}
                options={STATUSES.map((value) => ({ value, label: humanize(value) }))}
              />
            </Field>
            <Field label={t("projects.moduleColor")}>
              <Input
                type="color"
                value={form.color}
                onChange={(event) => setForm({ ...form, color: event.target.value })}
                className="h-9 p-1"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("action.cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              {module ? t("action.save") : t("action.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
