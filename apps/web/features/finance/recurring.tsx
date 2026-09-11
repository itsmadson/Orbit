"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Repeat, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n, useT } from "@/lib/i18n";
import { useItem } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import { Section } from "@/components/shared/page";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

type Schedule = {
  id: string;
  name: string;
  kind: string;
  amount: number;
  currency: string;
  cadence: string;
  next_run: string;
  is_active: boolean;
  is_due: boolean;
  posted_count: number;
  category?: { name: string; color: string } | null;
};

/**
 * Money that repeats: rent, salaries, subscriptions.
 *
 * Posting is deliberate rather than automatic — a schedule that quietly writes
 * rows while nobody is looking is how a ledger stops being trusted. Catching up
 * an idle schedule produces one row per missed period, not a lump.
 */
export function RecurringPanel() {
  const t = useT();
  const { locale } = useI18n();
  const { company, can } = useSession();
  const client = useQueryClient();
  const confirm = useConfirm();
  const data = useItem<{ items: Schedule[]; due_count: number; due_total: number }>(
    "/finance/recurring",
  );
  const accounts = useItem<{ id: string; name: string }[]>("/finance/accounts");
  const categories = useItem<{ id: string; name: string; kind: string }[]>("/finance/categories");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    kind: "expense",
    amount: "",
    cadence: "monthly",
    day_of_month: "1",
    starts_on: new Date().toISOString().slice(0, 10),
    account_id: "",
    category_id: "",
  });

  const editable = can("finance.write");
  const refresh = () => {
    client.invalidateQueries({ queryKey: ["/finance/recurring"] });
    client.invalidateQueries({ queryKey: ["/finance/summary"] });
    client.invalidateQueries({ queryKey: ["/finance/transactions"] });
  };

  async function create() {
    if (!form.name.trim() || !form.amount) return;
    setBusy(true);
    try {
      await api.post("/finance/recurring", {
        ...form,
        amount: Number(form.amount),
        day_of_month: Number(form.day_of_month),
        account_id: form.account_id || null,
        category_id: form.category_id || null,
      });
      toast.success(t("finance.newRecurring"));
      setForm({ ...form, name: "", amount: "" });
      setOpen(false);
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function postDue() {
    setBusy(true);
    try {
      const result = await api.post<{ posted: number; total: number }>(
        "/finance/recurring/post",
      );
      toast.success(
        result.posted
          ? `${result.posted} · ${formatCurrency(result.total, company.currency, locale)}`
          : t("common.empty"),
      );
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(schedule: Schedule) {
    const ok = await confirm({
      title: t("action.delete"),
      body: schedule.name,
      confirmLabel: t("action.delete"),
      destructive: true,
    });
    if (!ok) return;
    await api.delete(`/finance/recurring/${schedule.id}`);
    refresh();
  }

  return (
    <Section
      title={
        <span className="flex items-center gap-1.5">
          <Repeat className="h-3.5 w-3.5 text-accent" />
          {t("finance.recurring")}
        </span>
      }
      action={
        editable ? (
          <div className="flex items-center gap-2">
            {data.data?.due_count ? (
              <Button size="sm" variant="primary" loading={busy} onClick={postDue}>
                {t("finance.recurringDue").replace("{count}", String(data.data.due_count))}
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
              <Plus className="h-3.5 w-3.5" />
              {t("finance.newRecurring")}
            </Button>
          </div>
        ) : null
      }
      contentClassName="p-0"
    >
      {open ? (
        <div className="space-y-3 border-b border-border p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t("common.name")}>
              <Input
                autoFocus
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>
            <Field label={t("common.amount")}>
              <Input
                type="number"
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
              />
            </Field>
            <Field label={t("common.type")}>
              <SimpleSelect
                value={form.kind}
                onValueChange={(kind) => setForm({ ...form, kind })}
                options={[
                  { value: "expense", label: t("finance.expense") },
                  { value: "income", label: t("finance.income") },
                ]}
              />
            </Field>
            <Field label={t("finance.cadence")}>
              <SimpleSelect
                value={form.cadence}
                onValueChange={(cadence) => setForm({ ...form, cadence })}
                options={["weekly", "monthly", "quarterly", "yearly"].map((value) => ({
                  value,
                  label: value,
                }))}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("finance.nextRun")}>
              <Input
                type="date"
                value={form.starts_on}
                onChange={(event) => setForm({ ...form, starts_on: event.target.value })}
              />
            </Field>
            <Field label={t("finance.account")}>
              <SimpleSelect
                value={form.account_id}
                onValueChange={(account_id) => setForm({ ...form, account_id })}
                placeholder="—"
                options={(accounts.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
              />
            </Field>
            <Field label={t("finance.category")}>
              <SimpleSelect
                value={form.category_id}
                onValueChange={(category_id) => setForm({ ...form, category_id })}
                placeholder="—"
                options={(categories.data ?? [])
                  .filter((c) => c.kind === form.kind)
                  .map((c) => ({ value: c.id, label: c.name }))}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button variant="primary" size="sm" loading={busy} onClick={create}>
              {t("action.save")}
            </Button>
          </div>
        </div>
      ) : null}

      {data.data?.items.length ? (
        <ul className="divide-y divide-border">
          {data.data.items.map((schedule) => (
            <li key={schedule.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-text">{schedule.name}</span>
                <span className="text-[11px] text-muted">
                  {schedule.cadence}
                  {schedule.category ? ` · ${schedule.category.name}` : ""}
                  {schedule.posted_count ? ` · ${schedule.posted_count}×` : ""}
                </span>
              </span>
              <span
                className={cn(
                  "text-[13px] font-medium tnum",
                  schedule.kind === "income" ? "text-positive" : "text-text",
                )}
              >
                {formatCurrency(schedule.amount, schedule.currency, locale)}
              </span>
              <Badge tone={schedule.is_due ? "pending" : undefined}>
                {t("finance.nextRun")} {formatDate(schedule.next_run, locale)}
              </Badge>
              {editable ? (
                <Button size="icon-sm" variant="ghost" onClick={() => remove(schedule)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-4 text-[13px] text-faint">{t("finance.noRecurring")}</p>
      )}
    </Section>
  );
}
