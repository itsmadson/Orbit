"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { STATUS_CATEGORIES, STATUS_COLORS, statusName, type TaskStatus } from "@/lib/statuses";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Everything that shows a status reads one of these queries. */
export function useInvalidateStatuses() {
  const client = useQueryClient();
  return React.useCallback(() => {
    for (const key of ["/task-statuses", "/tasks/board", "/tasks", "dashboard", "/projects"]) {
      client.invalidateQueries({ queryKey: [key] });
    }
  }, [client]);
}

/**
 * Add a board column, or edit one.
 *
 * The category is the one thing that matters beyond the name: it tells reports
 * whether a task sitting in this column is still open, moving, or finished.
 */
export function StatusDialog({
  open,
  onOpenChange,
  status,
  after,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing. */
  status?: TaskStatus | null;
  /** Key of the column the new one should follow. */
  after?: string | null;
}) {
  const { t } = useI18n();
  const invalidate = useInvalidateStatuses();
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    name_fa: "",
    category: "started" as string,
    color: STATUS_COLORS[2],
  });

  React.useEffect(() => {
    if (!open) return;
    setForm({
      name: status?.name ?? "",
      name_fa: status?.name_fa ?? "",
      category: status?.category ?? "started",
      color: status?.color ?? STATUS_COLORS[2],
    });
  }, [open, status]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (status) {
        await api.patch(`/task-statuses/${status.id}`, {
          name: form.name,
          name_fa: form.name_fa || null,
          color: form.color,
          ...(status.is_system ? {} : { category: form.category }),
        });
        toast.success(t("tasks.status.saved"));
      } else {
        await api.post("/task-statuses", { ...form, name_fa: form.name_fa || null, after });
        toast.success(t("tasks.status.added"));
      }
      invalidate();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.message ?? t("common.requestFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader
          title={status ? t("tasks.status.edit") : t("tasks.status.add")}
          description={t("tasks.status.hint")}
        />
        <form onSubmit={submit} className="space-y-3">
          <Field label={t("tasks.status.name")}>
            <Input
              required
              autoFocus
              maxLength={60}
              dir="auto"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder={t("tasks.status.namePlaceholder")}
            />
          </Field>
          <Field label={t("tasks.status.nameFa")} hint={t("tasks.status.nameFaHint")}>
            <Input
              maxLength={60}
              dir="rtl"
              value={form.name_fa}
              onChange={(event) => setForm({ ...form, name_fa: event.target.value })}
              placeholder="در انتظار مشتری"
            />
          </Field>
          <Field
            label={t("tasks.status.category")}
            hint={status?.is_system ? t("tasks.status.categoryLocked") : t(`tasks.status.categoryHint.${form.category}`)}
          >
            <SimpleSelect
              value={form.category}
              disabled={status?.is_system}
              onValueChange={(category) => setForm({ ...form, category })}
              options={STATUS_CATEGORIES.map((value) => ({
                value,
                label: t(`tasks.status.category.${value}`),
              }))}
            />
          </Field>
          <Field label={t("tasks.status.color")}>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={color}
                  aria-pressed={form.color === color}
                  onClick={() => setForm({ ...form, color })}
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border-2 transition-transform hover:scale-110",
                    form.color === color ? "border-text" : "border-transparent",
                  )}
                  style={{ backgroundColor: color }}
                >
                  {form.color === color ? <Check className="h-3 w-3 text-white" /> : null}
                </button>
              ))}
            </div>
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("action.cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {status ? t("action.save") : t("action.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Deleting a column that still holds tasks: they have to go somewhere first. */
export function DeleteStatusDialog({
  status,
  statuses,
  onOpenChange,
}: {
  status: TaskStatus | null;
  statuses: TaskStatus[];
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale, n } = useI18n();
  const invalidate = useInvalidateStatuses();
  const [moveTo, setMoveTo] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const others = statuses.filter((item) => item.key !== status?.key);
  const count = status?.task_count ?? 0;

  React.useEffect(() => {
    if (!status) return;
    // Default to a neighbour of the same kind, so "QA" empties into "In review".
    const sameKind = others.find((item) => item.category === status.category);
    setMoveTo((sameKind ?? others[0])?.key ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.key]);

  const remove = async () => {
    if (!status) return;
    setSaving(true);
    try {
      await api.delete(`/task-statuses/${status.id}`, count ? { move_to: moveTo } : undefined);
      toast.success(t("tasks.status.deleted"));
      invalidate();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.message ?? t("common.requestFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(status)} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader
          title={t("tasks.status.deleteTitle", { name: status ? statusName(status, locale, t) : "" })}
          description={
            count
              ? t("tasks.status.deleteMove", { count: n(count) })
              : t("tasks.status.deleteEmpty")
          }
        />
        {count ? (
          <Field label={t("tasks.status.moveTo")}>
            <SimpleSelect
              value={moveTo}
              onValueChange={setMoveTo}
              options={others.map((item) => ({ value: item.key, label: statusName(item, locale, t) }))}
            />
          </Field>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("action.cancel")}
          </Button>
          <Button variant="danger" loading={saving} disabled={Boolean(count) && !moveTo} onClick={remove}>
            {t("action.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
