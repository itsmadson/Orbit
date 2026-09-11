"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, CircleSlash } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n, useT } from "@/lib/i18n";
import { useItem } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import { Section } from "@/components/shared/page";
import { Badge, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

type Followup = {
  id: string;
  title: string;
  stage: string;
  value: number;
  currency: string;
  next_step?: string | null;
  next_step_due?: string | null;
  days_overdue?: number | null;
  company?: { id: string; name: string } | null;
};

type Board = {
  overdue: Followup[];
  upcoming: Followup[];
  unscheduled: Followup[];
  counts: { overdue: number; upcoming: number; unscheduled: number };
};

/**
 * The pipeline's actual to-do list.
 *
 * A stage tells you where a deal is; it never tells you what you owe it. These
 * are the three questions a salesperson opens the CRM to answer: what did I
 * miss, what is coming, and which deals have nobody scheduled to touch them.
 */
export function Followups() {
  const t = useT();
  const { company } = useSession();
  const { locale } = useI18n();
  const client = useQueryClient();
  const [mine, setMine] = React.useState(true);
  const [editing, setEditing] = React.useState<Followup | null>(null);
  const board = useItem<Board>("/crm/followups", { mine });

  const refresh = () => {
    client.invalidateQueries({ queryKey: ["/crm/followups"] });
    client.invalidateQueries({ queryKey: ["/crm/deals"] });
  };

  const groups = [
    {
      key: "overdue",
      label: t("crm.overdue"),
      icon: AlertTriangle,
      tone: "text-danger",
      rows: board.data?.overdue ?? [],
    },
    {
      key: "upcoming",
      label: t("crm.upcoming"),
      icon: CalendarClock,
      tone: "text-warning",
      rows: board.data?.upcoming ?? [],
    },
    {
      key: "unscheduled",
      label: t("crm.unscheduled"),
      icon: CircleSlash,
      tone: "text-muted",
      rows: board.data?.unscheduled ?? [],
    },
  ];

  const empty = groups.every((group) => !group.rows.length);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {[
          { value: true, label: t("tasks.myTasks") },
          { value: false, label: t("common.all") },
        ].map((option) => (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => setMine(option.value)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
              mine === option.value
                ? "border-accent/45 bg-accent-soft text-accent"
                : "border-border bg-surface-2 text-muted hover:text-text",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {empty ? (
        <EmptyState icon={CalendarClock} title={t("crm.noFollowups")} />
      ) : (
        groups.map((group) =>
          group.rows.length ? (
            <Section
              key={group.key}
              title={
                <span className="flex items-center gap-1.5">
                  <group.icon className={cn("h-3.5 w-3.5", group.tone)} />
                  {group.label}
                  <span className="text-faint tnum">{group.rows.length}</span>
                </span>
              }
              contentClassName="p-0"
            >
              <ul className="divide-y divide-border">
                {group.rows.map((deal) => (
                  <li key={deal.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/crm/deals/${deal.id}`}
                        className="block truncate text-[13px] font-medium text-text hover:text-accent"
                      >
                        {deal.title}
                      </Link>
                      <div className="truncate text-[11px] text-muted">
                        {deal.company?.name}
                        {deal.next_step ? ` · ${deal.next_step}` : ""}
                      </div>
                    </div>
                    <span className="text-[12px] tnum text-muted">
                      {formatCurrency(deal.value, deal.currency ?? company.currency, locale, true)}
                    </span>
                    {deal.next_step_due ? (
                      <Badge tone={group.key === "overdue" ? "overdue" : "pending"}>
                        {group.key === "overdue" && deal.days_overdue
                          ? `${deal.days_overdue}d`
                          : formatDate(deal.next_step_due, locale)}
                      </Badge>
                    ) : null}
                    <Button size="xs" variant="secondary" onClick={() => setEditing(deal)}>
                      {t("crm.setNextStep")}
                    </Button>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null,
        )
      )}

      <NextStepDialog deal={editing} onClose={() => setEditing(null)} onSaved={refresh} />
    </div>
  );
}

export function NextStepDialog({
  deal,
  onClose,
  onSaved,
}: {
  deal: { id: string; title: string; next_step?: string | null; next_step_due?: string | null } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [step, setStep] = React.useState("");
  const [due, setDue] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setStep(deal?.next_step ?? "");
    setDue(deal?.next_step_due ?? "");
  }, [deal]);

  async function save() {
    if (!deal || !step.trim()) return;
    setBusy(true);
    try {
      await api.post(`/crm/deals/${deal.id}/next-step`, {
        next_step: step.trim(),
        due_on: due || null,
      });
      toast.success(t("crm.nextStep"));
      onSaved();
      onClose();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!deal} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm">
        <DialogHeader title={t("crm.setNextStep")} description={deal?.title} />
        <div className="space-y-3 px-4 py-3">
          <Field label={t("crm.nextStep")}>
            <Input
              autoFocus
              value={step}
              onChange={(event) => setStep(event.target.value)}
              placeholder="Send the revised proposal"
            />
          </Field>
          <Field label={t("crm.dueOn")}>
            <Input type="date" value={due} onChange={(event) => setDue(event.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button variant="primary" loading={busy} onClick={save} disabled={!step.trim()}>
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
