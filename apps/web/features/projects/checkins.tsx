"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n, useT } from "@/lib/i18n";
import { useItem } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import { Section } from "@/components/shared/page";
import { Avatar, Progress, StatusBadge, TimeAgo } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";

type Checkin = {
  id: string;
  health: string;
  summary: string;
  progress?: number | null;
  highlights?: string | null;
  risks?: string | null;
  next_steps?: string | null;
  period_end: string;
  author?: { full_name: string; avatar_color?: string | null } | null;
  created_at: string;
};

/**
 * Status with a date and an author behind it.
 *
 * A health flag alone says a project is at risk but never why or since when;
 * posting a check-in moves the project's health, so the two cannot drift.
 */
export function ProjectCheckins({ projectId }: { projectId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const { can } = useSession();
  const client = useQueryClient();
  const checkins = useItem<Checkin[]>(`/projects/${projectId}/checkins`);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [form, setForm] = React.useState({
    health: "on_track",
    summary: "",
    progress: "",
    risks: "",
    next_steps: "",
  });

  async function submit() {
    if (!form.summary.trim()) return;
    setBusy(true);
    try {
      await api.post(`/projects/${projectId}/checkins`, {
        ...form,
        progress: form.progress === "" ? null : Number(form.progress),
        risks: form.risks || null,
        next_steps: form.next_steps || null,
      });
      toast.success(t("checkins.posted"));
      setForm({ health: "on_track", summary: "", progress: "", risks: "", next_steps: "" });
      setOpen(false);
      client.invalidateQueries({ queryKey: [`/projects/${projectId}/checkins`] });
      client.invalidateQueries({ queryKey: [`/projects/${projectId}`] });
      client.invalidateQueries({ queryKey: ["/projects"] });
    } catch (error: any) {
      toast.error(error?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title={
        <span className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-accent" />
          {t("checkins.title")}
        </span>
      }
      action={
        can("projects.write") ? (
          <Button size="sm" variant={open ? "ghost" : "secondary"} onClick={() => setOpen((v) => !v)}>
            {open ? t("action.cancel") : t("checkins.new")}
          </Button>
        ) : null
      }
      contentClassName="p-0"
    >
      {open ? (
        <div className="space-y-3 border-b border-border p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("common.status")}>
              <SimpleSelect
                value={form.health}
                onValueChange={(health) => setForm({ ...form, health })}
                options={["on_track", "at_risk", "off_track"].map((value) => ({
                  value,
                  label: t(`status.${value}`) === `status.${value}` ? value : t(`status.${value}`),
                }))}
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
          <Field label={t("checkins.summary")}>
            <Textarea
              value={form.summary}
              onChange={(event) => setForm({ ...form, summary: event.target.value })}
              rows={3}
              autoFocus
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("checkins.risks")}>
              <Textarea
                value={form.risks}
                onChange={(event) => setForm({ ...form, risks: event.target.value })}
                rows={2}
              />
            </Field>
            <Field label={t("checkins.nextSteps")}>
              <Textarea
                value={form.next_steps}
                onChange={(event) => setForm({ ...form, next_steps: event.target.value })}
                rows={2}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button variant="primary" size="sm" loading={busy} onClick={submit}>
              {t("checkins.new")}
            </Button>
          </div>
        </div>
      ) : null}

      {checkins.data?.length ? (
        <ul className="divide-y divide-border">
          {checkins.data.map((checkin) => (
            <li key={checkin.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={checkin.health} />
                <span className="text-[11px] text-muted">
                  {formatDate(checkin.period_end, locale)}
                </span>
                <span className="ms-auto flex items-center gap-1.5 text-[11px] text-faint">
                  {checkin.author ? (
                    <Avatar
                      name={checkin.author.full_name}
                      color={checkin.author.avatar_color}
                      size={18}
                    />
                  ) : null}
                  <TimeAgo value={checkin.created_at} />
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[13px] text-text">{checkin.summary}</p>
              {typeof checkin.progress === "number" ? (
                <Progress value={checkin.progress} className="mt-2" />
              ) : null}
              {checkin.risks ? (
                <p className="mt-2 text-[12px] text-warning">
                  <span className="text-muted">{t("checkins.risks")}: </span>
                  {checkin.risks}
                </p>
              ) : null}
              {checkin.next_steps ? (
                <p className="mt-1 text-[12px] text-muted">
                  <span className="text-faint">{t("checkins.nextSteps")}: </span>
                  {checkin.next_steps}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-4 text-[13px] text-faint">{t("checkins.none")}</p>
      )}
    </Section>
  );
}
