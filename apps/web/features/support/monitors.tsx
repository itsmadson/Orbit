"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, Plus, RefreshCw, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useItem } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import { MetricCard, PageHeader, Section } from "@/components/shared/page";
import { Badge, EmptyState, TimeAgo } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";

export type Monitor = {
  id: string;
  name: string;
  url: string;
  status: string;
  is_active: boolean;
  interval_seconds: number;
  last_checked_at?: string | null;
  last_response_ms?: number | null;
  last_error?: string | null;
  uptime: number;
  total_checks: number;
  failed_checks: number;
  customer?: { id: string; name: string } | null;
};

const STATUS_TONE: Record<string, string> = {
  up: "bg-positive",
  down: "bg-danger",
  degraded: "bg-warning",
  unknown: "bg-border-strong",
};

/** A dot that says the one thing that matters about an endpoint. */
export function StatusDot({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("relative flex h-2.5 w-2.5", className)}>
      {status === "down" ? (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-60" />
      ) : null}
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", STATUS_TONE[status])} />
    </span>
  );
}

export function MonitorsView() {
  const t = useT();
  const { can } = useSession();
  const client = useQueryClient();
  const confirm = useConfirm();
  const data = useItem<{ items: Monitor[]; down: number; up: number; uptime: number }>(
    "/monitors",
  );
  const customers = useItem<{ items: { id: string; name: string }[] }>("/crm/companies", {
    page_size: 100,
  });
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    url: "",
    crm_company_id: "",
    interval_seconds: "300",
  });

  const editable = can("monitoring.write");
  const refresh = () => client.invalidateQueries({ queryKey: ["/monitors"] });

  async function create() {
    if (!form.name.trim() || !form.url.trim()) return;
    setBusy(true);
    try {
      await api.post("/monitors", {
        ...form,
        interval_seconds: Number(form.interval_seconds),
        crm_company_id: form.crm_company_id || null,
      });
      toast.success(form.name);
      setForm({ ...form, name: "", url: "" });
      setOpen(false);
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function checkAll() {
    setBusy(true);
    try {
      const result = await api.post<{ checked: number }>("/monitors/check");
      toast.success(`${result.checked}`);
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(monitor: Monitor) {
    const ok = await confirm({
      title: t("action.delete"),
      body: monitor.name,
      confirmLabel: t("action.delete"),
      destructive: true,
    });
    if (!ok) return;
    await api.delete(`/monitors/${monitor.id}`);
    refresh();
  }

  return (
    <div>
      <PageHeader
        title={t("monitoring.title")}
        subtitle={t("monitoring.subtitle")}
        actions={
          editable ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" loading={busy} onClick={checkAll}>
                <RefreshCw className="h-3.5 w-3.5" />
                {t("monitoring.checkNow")}
              </Button>
              <Button variant="primary" onClick={() => setOpen((v) => !v)}>
                <Plus className="h-3.5 w-3.5" />
                {t("monitoring.new")}
              </Button>
            </div>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <MetricCard
          label={t("monitoring.up")}
          value={data.data?.up ?? 0}
          tone="positive"
          icon={<Activity className="h-[15px] w-[15px]" />}
        />
        <MetricCard
          label={t("monitoring.down")}
          value={data.data?.down ?? 0}
          tone={data.data?.down ? "danger" : "default"}
          icon={<Activity className="h-[15px] w-[15px]" />}
        />
        <MetricCard
          label={t("monitoring.uptime")}
          value={`${data.data?.uptime ?? 100}%`}
          icon={<Activity className="h-[15px] w-[15px]" />}
        />
      </div>

      {open ? (
        <Section title={t("monitoring.new")} className="mb-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t("common.name")}>
              <Input
                autoFocus
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>
            <Field label="URL">
              <Input
                value={form.url}
                onChange={(event) => setForm({ ...form, url: event.target.value })}
                placeholder="https://api.example.com/health"
              />
            </Field>
            <Field label={t("crm.customer")}>
              <SimpleSelect
                value={form.crm_company_id}
                onValueChange={(crm_company_id) => setForm({ ...form, crm_company_id })}
                placeholder="—"
                options={(customers.data?.items ?? []).map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
              />
            </Field>
            <Field label={t("monitoring.interval")}>
              <SimpleSelect
                value={form.interval_seconds}
                onValueChange={(interval_seconds) => setForm({ ...form, interval_seconds })}
                options={[
                  { value: "60", label: "1m" },
                  { value: "300", label: "5m" },
                  { value: "900", label: "15m" },
                  { value: "3600", label: "1h" },
                ]}
              />
            </Field>
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant="primary" size="sm" loading={busy} onClick={create}>
              {t("action.create")}
            </Button>
          </div>
        </Section>
      ) : null}

      {data.data?.items.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.data.items.map((monitor) => (
            <div key={monitor.id} className="panel p-3.5">
              <div className="flex items-start gap-2">
                <StatusDot status={monitor.status} className="mt-1.5" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-text">{monitor.name}</div>
                  <div className="truncate text-[11px] text-muted">{monitor.url}</div>
                </div>
                {editable ? (
                  <Button size="icon-sm" variant="ghost" onClick={() => remove(monitor)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                <span className="tnum text-text">{monitor.uptime}%</span>
                <span className="text-faint">{t("monitoring.uptime")}</span>
                {monitor.last_response_ms ? (
                  <span className="ms-auto tnum text-muted">{monitor.last_response_ms}ms</span>
                ) : null}
              </div>

              {monitor.customer ? (
                <Badge className="mt-2">{monitor.customer.name}</Badge>
              ) : null}

              {monitor.last_error ? (
                <p className="mt-2 truncate text-[11px] text-danger" title={monitor.last_error}>
                  {monitor.last_error}
                </p>
              ) : null}

              {monitor.last_checked_at ? (
                <p className="mt-2 text-[11px] text-faint">
                  <TimeAgo value={monitor.last_checked_at} />
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Activity}
          title={t("monitoring.empty")}
          description={t("monitoring.emptyHint")}
        />
      )}
    </div>
  );
}
