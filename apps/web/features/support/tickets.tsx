"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, LifeBuoy, Paperclip, Plus, Timer, UserX } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useCreateParam, useDebounced, useItem, useList } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import { MetricCard, PageHeader } from "@/components/shared/page";
import { Column, DataTable, FilterChips, SearchInput, Toolbar } from "@/components/shared/data";
import {
  Badge, EmptyState, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger, TimeAgo,
} from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type Ticket = {
  id: string;
  number: string;
  subject: string;
  status: string;
  priority: string;
  category?: string | null;
  source: string;
  customer?: { id: string; name: string } | null;
  assignee?: { id: string; full_name: string; avatar_color?: string | null } | null;
  requester?: { full_name: string } | null;
  created_at: string;
  message_count: number;
  attachment_count?: number;
  body?: string | null;
  task_id?: string | null;
  first_response_at?: string | null;
  resolved_at?: string | null;
  sla: {
    response?: { breached?: boolean; hours_left?: number; met?: boolean | null } | null;
    resolution?: { breached?: boolean; hours_left?: number; met?: boolean | null } | null;
    paused?: boolean;
  };
};

const PRIORITY_TONE: Record<string, string> = {
  urgent: "text-danger",
  high: "text-warning",
  normal: "text-muted",
  low: "text-faint",
};

/** The SLA clock as one glance: breached, running low, paused, or fine. */
export function SlaPill({ ticket }: { ticket: Ticket }) {
  const t = useT();
  if (ticket.sla?.paused) return <Badge>{t("support.slaPaused")}</Badge>;
  const clock =
    ticket.sla?.response && ticket.sla.response.met === null
      ? ticket.sla.response
      : ticket.sla?.resolution;
  if (!clock) return null;
  if (clock.breached) return <Badge tone="overdue">{t("support.slaBreached")}</Badge>;
  if (typeof clock.hours_left === "number" && clock.hours_left < 4) {
    return <Badge tone="pending">{clock.hours_left}h</Badge>;
  }
  return null;
}

export function TicketsView() {
  const t = useT();
  const { can } = useSession();
  const [createOpen, setCreateOpen] = useCreateParam();
  const [tab, setTab] = React.useState("open");
  const [query, setQuery] = React.useState("");
  const [priority, setPriority] = React.useState("");
  const search = useDebounced(query);

  const stats = useItem<{
    by_status: Record<string, number>;
    open: number;
    breached: number;
    unassigned: number;
  }>("/tickets/stats");

  const list = useList<Ticket>("/tickets", {
    q: search || undefined,
    priority: priority || undefined,
    status:
      tab === "open" ? ["new", "open", "pending_customer"] : tab === "all" ? undefined : undefined,
    mine: tab === "mine" || undefined,
    breached: tab === "breached" || undefined,
    unassigned: tab === "unassigned" || undefined,
    page_size: 50,
  });

  const columns: Column<Ticket>[] = [
    {
      key: "number",
      header: t("support.number"),
      width: "110px",
      cell: (row) => <span className="font-mono text-[11px] tnum text-muted">{row.number}</span>,
    },
    {
      key: "subject",
      header: t("support.subject"),
      cell: (row) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium text-text">{row.subject}</span>
            <SlaPill ticket={row} />
          </div>
          <div className="flex items-center gap-1.5 truncate text-[11px] text-muted">
            {[row.customer?.name, row.requester?.full_name].filter(Boolean).join(" · ")}
            {row.attachment_count ? (
              <span className="flex items-center gap-0.5 text-faint">
                <Paperclip className="h-3 w-3" />
                {row.attachment_count}
              </span>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: "priority",
      header: t("common.priority"),
      width: "90px",
      cell: (row) => (
        <span className={cn("text-[12px]", PRIORITY_TONE[row.priority])}>{row.priority}</span>
      ),
    },
    {
      key: "assignee",
      header: t("common.assignee"),
      width: "140px",
      cell: (row) =>
        row.assignee ? (
          <span className="truncate text-[12px] text-muted">{row.assignee.full_name}</span>
        ) : (
          <span className="text-[11px] text-faint">{t("support.unassigned")}</span>
        ),
    },
    {
      key: "status",
      header: t("common.status"),
      width: "130px",
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "created",
      header: t("common.created"),
      width: "110px",
      cell: (row) => <TimeAgo value={row.created_at} className="text-[12px] text-muted" />,
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("support.title")}
        subtitle={t("support.subtitle")}
        actions={
          can("support.write") ? (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("support.new")}
            </Button>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={t("support.open")}
          value={stats.data?.open ?? 0}
          icon={<LifeBuoy className="h-[15px] w-[15px]" />}
        />
        <MetricCard
          label={t("support.breached")}
          value={stats.data?.breached ?? 0}
          tone={stats.data?.breached ? "danger" : "default"}
          icon={<AlertTriangle className="h-[15px] w-[15px]" />}
        />
        <MetricCard
          label={t("support.unassigned")}
          value={stats.data?.unassigned ?? 0}
          tone={stats.data?.unassigned ? "warning" : "default"}
          icon={<UserX className="h-[15px] w-[15px]" />}
        />
        <MetricCard
          label={t("support.waitingOnCustomer")}
          value={stats.data?.by_status?.pending_customer ?? 0}
          icon={<Timer className="h-[15px] w-[15px]" />}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="pill" className="mb-4">
          <TabsTrigger variant="pill" value="open">{t("support.open")}</TabsTrigger>
          <TabsTrigger variant="pill" value="mine">{t("tasks.myTasks")}</TabsTrigger>
          <TabsTrigger variant="pill" value="unassigned">{t("support.unassigned")}</TabsTrigger>
          <TabsTrigger variant="pill" value="breached">{t("support.breached")}</TabsTrigger>
          <TabsTrigger variant="pill" value="all">{t("common.all")}</TabsTrigger>
        </TabsList>

        {["open", "mine", "unassigned", "breached", "all"].map((value) => (
          <TabsContent key={value} value={value}>
            <Toolbar>
              <SearchInput value={query} onChange={setQuery} className="w-56" />
              <FilterChips
                value={priority}
                onChange={(next) => setPriority(next ?? "")}
                options={["urgent", "high", "normal", "low"].map((p) => ({ value: p, label: p }))}
              />
            </Toolbar>
            {list.data?.items.length === 0 ? (
              <EmptyState icon={LifeBuoy} title={t("support.empty")} />
            ) : (
              <div className="panel overflow-hidden">
                <DataTable
                  columns={columns}
                  rows={list.data?.items ?? []}
                  loading={list.isLoading}
                  rowHref={(row) => `/tickets/${row.id}`}
                />
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <TicketDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function TicketDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const router = useRouter();
  const customers = useItem<{ items: { id: string; name: string }[] }>("/crm/companies", {
    page_size: 100,
  });
  const [form, setForm] = React.useState({
    subject: "",
    body: "",
    priority: "normal",
    crm_company_id: "",
  });
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const ticket = await api.post<Ticket>("/tickets", {
        ...form,
        crm_company_id: form.crm_company_id || null,
      });
      toast.success(ticket.number);
      onOpenChange(false);
      setForm({ ...form, subject: "", body: "" });
      router.push(`/tickets/${ticket.id}`);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader title={t("support.new")} />
          <div className="space-y-3 px-4 py-3">
            <Field label={t("support.subject")}>
              <Input
                required
                autoFocus
                value={form.subject}
                onChange={(event) => setForm({ ...form, subject: event.target.value })}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
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
              <Field label={t("common.priority")}>
                <SimpleSelect
                  value={form.priority}
                  onValueChange={(priority) => setForm({ ...form, priority })}
                  options={["urgent", "high", "normal", "low"].map((p) => ({
                    value: p,
                    label: p,
                  }))}
                />
              </Field>
            </div>
            <Field label={t("support.describe")}>
              <Textarea
                rows={5}
                value={form.body}
                onChange={(event) => setForm({ ...form, body: event.target.value })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("action.cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!form.subject.trim()}>
              {t("action.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
