"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check, ClipboardList, Clock, FileText, Plus, Workflow as WorkflowIcon, X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useI18n, useT } from "@/lib/i18n";
import { useCreateParam, useItem, useList } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import type { Request, WorkflowDefinition } from "@/lib/types";
import { MetricCard, PageHeader, Section } from "@/components/shared/page";
import { Column, DataTable, FilterChips, Toolbar } from "@/components/shared/data";
import { Comments, DetailRow, LoadingPanel, RelatedPanel } from "@/components/shared/entity";
import { Avatar, Badge, EmptyState, Skeleton, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { cn, formatCurrency, formatDate, humanize, relativeTime } from "@/lib/utils";

export function OfficeView() {
  const t = useT();
  const { can } = useSession();
  const [createOpen, setCreateOpen] = useCreateParam();
  const [definition, setDefinition] = React.useState<WorkflowDefinition | null>(null);

  const definitions = useItem<WorkflowDefinition[]>("/workflows");
  const mine = useList<Request>("/requests", { mine: true, page_size: 10 });
  const awaiting = useList<Request>("/requests", { awaiting_me: true, page_size: 10 });

  return (
    <div>
      <PageHeader
        title={t("office.title")}
        subtitle={t("office.subtitle")}
        actions={
          can("workflows.write") ? (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("office.newRequest")}
            </Button>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <MetricCard
          label={t("office.awaitingMe")}
          value={awaiting.data?.total ?? 0}
          tone={awaiting.data?.total ? "warning" : "default"}
          icon={<Clock className="h-3.5 w-3.5" />}
          href="/approvals"
        />
        <MetricCard
          label={t("office.myRequests")}
          value={mine.data?.total ?? 0}
          icon={<ClipboardList className="h-3.5 w-3.5" />}
        />
        <MetricCard
          label={t("nav.workflows")}
          value={definitions.data?.length ?? 0}
          icon={<WorkflowIcon className="h-3.5 w-3.5" />}
          href="/workflows"
        />
      </div>

      <Section title={t("office.newRequest")} contentClassName="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
        {(definitions.data ?? []).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setDefinition(item)}
            disabled={!can("workflows.write")}
            className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-2 p-3 text-start transition-all hover:-translate-y-px hover:border-accent/40 hover:bg-accent-soft disabled:opacity-60"
          >
            <span className="text-[18px]">{item.icon}</span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">{item.name}</span>
              <span className="mt-0.5 block line-clamp-2 text-[11px] text-muted">
                {item.description}
              </span>
              <span className="mt-1 block text-[10px] text-faint">
                {item.states.filter((state) => state.type === "approval").length} approval steps ·{" "}
                {item.open_count} open
              </span>
            </span>
          </button>
        ))}
        {!definitions.data?.length ? (
          <p className="p-2 text-[13px] text-faint">{t("common.empty")}</p>
        ) : null}
      </Section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section title={t("office.awaitingMe")} contentClassName="p-0">
          <RequestList data={awaiting.data?.items} loading={awaiting.isLoading} />
        </Section>
        <Section title={t("office.myRequests")} contentClassName="p-0">
          <RequestList data={mine.data?.items} loading={mine.isLoading} />
        </Section>
      </div>

      <RequestDialog
        definition={definition}
        open={Boolean(definition) || createOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDefinition(null);
            setCreateOpen(false);
          }
        }}
        definitions={definitions.data ?? []}
      />
    </div>
  );
}

function RequestList({ data, loading }: { data?: Request[]; loading?: boolean }) {
  const t = useT();
  const { locale } = useI18n();
  if (loading) return <div className="p-3"><Skeleton className="h-24 w-full" /></div>;
  if (!data?.length) return <p className="p-4 text-[13px] text-faint">{t("common.empty")}</p>;
  return (
    <ul>
      {data.map((request) => (
        <li key={request.id} className="border-b border-border/60 last:border-0">
          <Link
            href={`/approvals/${request.id}`}
            className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2"
          >
            <span className="text-[15px]">{request.definition_icon}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px]">{request.title}</p>
              <p className="text-[11px] text-faint">
                {request.requester?.full_name} · {relativeTime(request.created_at, locale)}
              </p>
            </div>
            {request.awaiting_me ? (
              <Badge className="border-warning/30 bg-warning/10 text-warning">action needed</Badge>
            ) : null}
            <StatusBadge status={request.status === "open" ? request.state : request.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function RequestDialog({
  open,
  onOpenChange,
  definition,
  definitions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definition: WorkflowDefinition | null;
  definitions: WorkflowDefinition[];
}) {
  const t = useT();
  const router = useRouter();
  const client = useQueryClient();
  const [selected, setSelected] = React.useState<WorkflowDefinition | null>(definition);
  const [data, setData] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setSelected(definition);
    setData({});
  }, [definition, open]);

  const active = selected ?? definition;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!active) return;
    setSaving(true);
    try {
      const request = await api.post<Request>("/requests", {
        definition_id: active.id,
        title: `${active.name}: ${Object.values(data)[0] ?? ""}`,
        data,
      });
      toast.success("Request submitted");
      client.invalidateQueries({ queryKey: ["/requests"] });
      client.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
      router.push(`/approvals/${request.id}`);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader
          title={active ? active.name : t("office.newRequest")}
          description={active?.description ?? undefined}
        />
        {!active ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {definitions.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item)}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-3 text-start transition-colors hover:border-accent/40"
              >
                <span className="text-[16px]">{item.icon}</span>
                <span className="text-[13px]">{item.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <form className="space-y-3" onSubmit={submit}>
            {active.form_schema.map((field) => (
              <Field key={field.key} label={field.label} hint={field.help}>
                {field.type === "textarea" ? (
                  <Textarea
                    required={field.required}
                    value={data[field.key] ?? ""}
                    onChange={(event) => setData({ ...data, [field.key]: event.target.value })}
                  />
                ) : field.type === "select" ? (
                  <SimpleSelect
                    value={data[field.key] ?? ""}
                    onValueChange={(value) => setData({ ...data, [field.key]: value })}
                    options={(field.options ?? []).map((value) => ({ value, label: value }))}
                  />
                ) : (
                  <Input
                    type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                    required={field.required}
                    value={data[field.key] ?? ""}
                    onChange={(event) => setData({ ...data, [field.key]: event.target.value })}
                  />
                )}
              </Field>
            ))}

            <div className="rounded-lg border border-border bg-surface-2 p-3">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">
                {t("office.steps")}
              </p>
              <ol className="flex flex-wrap items-center gap-1.5">
                {active.states
                  .filter((state) => state.type !== "start")
                  .map((state, index) => (
                    <li key={state.key} className="flex items-center gap-1.5">
                      {index > 0 ? <span className="text-faint">→</span> : null}
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-[11px]",
                          state.type === "terminal"
                            ? "border-border text-faint"
                            : "border-accent/30 bg-accent-soft text-accent",
                        )}
                      >
                        {state.label}
                      </span>
                    </li>
                  ))}
              </ol>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {t("action.cancel")}
              </Button>
              <Button type="submit" variant="primary" loading={saving}>
                {t("action.submit")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ApprovalsView() {
  const t = useT();
  const { locale } = useI18n();
  const [status, setStatus] = React.useState<string | undefined>();
  const [page, setPage] = React.useState(1);

  const awaiting = useList<Request>("/requests", { awaiting_me: true, page_size: 50 });
  const all = useList<Request>("/requests", {
    status: status ? [status] : undefined,
    page,
    page_size: 40,
  });

  const columns: Column<Request>[] = [
    {
      key: "title",
      header: t("common.title"),
      cell: (row) => (
        <span className="flex items-center gap-2">
          <span>{row.definition_icon}</span>
          <span className="truncate font-medium">{row.title}</span>
        </span>
      ),
    },
    {
      key: "requester",
      header: "Requester",
      cell: (row) =>
        row.requester ? (
          <span className="flex items-center gap-1.5 text-[12px]">
            <Avatar name={row.requester.full_name} color={row.requester.avatar_color} size={18} />
            {row.requester.full_name}
          </span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key: "state",
      header: "Step",
      cell: (row) => <Badge>{row.state_label ?? humanize(row.state)}</Badge>,
    },
    { key: "status", header: t("common.status"), cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: "amount",
      header: t("common.amount"),
      align: "end",
      cell: (row) => (
        <span className="text-[12px] text-muted">
          {row.amount ? formatCurrency(row.amount, "USD", locale, true) : "—"}
        </span>
      ),
    },
    {
      key: "created",
      header: t("common.created"),
      align: "end",
      cell: (row) => <span className="text-[12px] text-muted">{formatDate(row.created_at, locale)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader title={t("nav.approvals")} subtitle="Requests moving through the company" />

      <Tabs defaultValue="awaiting">
        <TabsList className="mb-4">
          <TabsTrigger value="awaiting" count={awaiting.data?.total}>
            {t("office.awaitingMe")}
          </TabsTrigger>
          <TabsTrigger value="all">{t("common.all")}</TabsTrigger>
        </TabsList>

        <TabsContent value="awaiting">
          <div className="panel overflow-hidden">
            <DataTable
              columns={columns}
              rows={awaiting.data?.items ?? []}
              loading={awaiting.isLoading}
              rowHref={(row) => `/approvals/${row.id}`}
              empty={<EmptyState icon={Check} title="Nothing waiting on you" />}
            />
          </div>
        </TabsContent>

        <TabsContent value="all">
          <Toolbar>
            <FilterChips
              value={status}
              onChange={setStatus}
              options={["open", "approved", "rejected", "cancelled"].map((value) => ({
                value,
                label: humanize(value),
              }))}
            />
          </Toolbar>
          <div className="panel overflow-hidden">
            <DataTable
              columns={columns}
              rows={all.data?.items ?? []}
              loading={all.isLoading}
              rowHref={(row) => `/approvals/${row.id}`}
              empty={<EmptyState icon={ClipboardList} title={t("common.empty")} />}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function RequestDetail({ requestId }: { requestId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const client = useQueryClient();
  const { can } = useSession();
  const [comment, setComment] = React.useState("");
  const [acting, setActing] = React.useState(false);

  const { data: request, isLoading } = useItem<Request>(`/requests/${requestId}`);

  if (isLoading || !request) return <LoadingPanel />;

  const act = async (action: string) => {
    setActing(true);
    try {
      await api.post(`/requests/${requestId}/actions`, { action, comment: comment || null });
      toast.success(humanize(action));
      setComment("");
      client.invalidateQueries({ queryKey: [`/requests/${requestId}`] });
      client.invalidateQueries({ queryKey: ["/requests"] });
      client.invalidateQueries({ queryKey: ["inbox-counts"] });
      client.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setActing(false);
    }
  };

  const raisePo = async () => {
    try {
      const po = await api.post<{ number: string }>(`/purchase-orders/from-request/${requestId}`);
      toast.success(`Created ${po.number}`);
      client.invalidateQueries({ queryKey: ["/purchase-orders"] });
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: t("nav.approvals"), href: "/approvals" }, { label: `#${request.number}` }]}
        icon={<span className="text-[20px]">{request.definition_icon}</span>}
        title={request.title}
        subtitle={
          <span className="flex items-center gap-2 text-[12px]">
            <span>{request.definition_name}</span>
            <span className="text-faint">·</span>
            <span>{request.requester?.full_name}</span>
            <span className="text-faint">· {formatDate(request.created_at, locale)}</span>
          </span>
        }
        actions={<StatusBadge status={request.status === "open" ? request.state : request.status} />}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Section title="Request" contentClassName="p-3">
            <div className="divide-y divide-border/60">
              {(request.form_schema ?? []).map((field) => (
                <DetailRow key={field.key} label={field.label}>
                  {String(request.data?.[field.key] ?? "—")}
                </DetailRow>
              ))}
            </div>
          </Section>

          <Section title={t("office.steps")} contentClassName="p-3">
            <ol className="space-y-3">
              {(request.states ?? [])
                .filter((state) => state.type !== "start")
                .map((state) => {
                  const approvals = (request.approvals ?? []).filter(
                    (approval) => approval.state_key === state.key,
                  );
                  const done = approvals.some((approval) => approval.status === "approved");
                  const rejected = approvals.some((approval) => approval.status === "rejected");
                  const current = request.state === state.key && request.status === "open";
                  return (
                    <li key={state.key} className="flex gap-3">
                      <span
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                          done
                            ? "border-positive bg-positive/15 text-positive"
                            : rejected
                              ? "border-danger bg-danger/15 text-danger"
                              : current
                                ? "border-accent bg-accent-soft text-accent"
                                : "border-border text-faint",
                        )}
                      >
                        {done ? <Check className="h-3 w-3" /> : rejected ? <X className="h-3 w-3" /> : "•"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium">{state.label}</p>
                        {state.approver_role ? (
                          <p className="text-[11px] text-faint">role: {state.approver_role}</p>
                        ) : null}
                        {approvals.map((approval) => (
                          <p key={approval.id} className="mt-0.5 text-[11px] text-muted">
                            {approval.approver?.full_name ?? "—"} · {approval.status}
                            {approval.comment ? ` — “${approval.comment}”` : ""}
                            {approval.decided_at
                              ? ` · ${relativeTime(approval.decided_at, locale)}`
                              : ""}
                          </p>
                        ))}
                      </div>
                    </li>
                  );
                })}
            </ol>
          </Section>

          {request.can_act && request.available_actions?.length ? (
            <Section title="Decision" contentClassName="p-3">
              <Textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Optional comment"
                className="mb-2"
              />
              <div className="flex flex-wrap gap-2">
                {request.available_actions.map((action) => (
                  <Button
                    key={action.action}
                    variant={action.action === "reject" ? "danger" : "primary"}
                    loading={acting}
                    onClick={() => act(action.action)}
                  >
                    {action.action === "reject" ? (
                      <X className="h-3.5 w-3.5" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    {action.label ?? humanize(action.action)}
                  </Button>
                ))}
              </div>
            </Section>
          ) : null}

          <Section title={t("common.comments")}>
            <Comments entityType="request" entityId={requestId} />
          </Section>
        </div>

        <aside className="space-y-4">
          <Section title={t("common.details")} contentClassName="p-3">
            <div className="divide-y divide-border/60">
              <DetailRow label={t("common.status")}>
                <StatusBadge status={request.status} />
              </DetailRow>
              <DetailRow label="Current step">{request.state_label ?? request.state}</DetailRow>
              <DetailRow label="Requester">{request.requester?.full_name ?? "—"}</DetailRow>
              <DetailRow label={t("common.amount")}>
                {request.amount ? formatCurrency(request.amount, "USD", locale) : "—"}
              </DetailRow>
              <DetailRow label={t("common.created")}>
                {formatDate(request.created_at, locale)}
              </DetailRow>
            </div>
            {request.status === "approved" && can("procurement.write") ? (
              <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={raisePo}>
                {t("procurement.newOrder")}
              </Button>
            ) : null}
          </Section>

          <Section title={t("common.related")} contentClassName="p-2">
            <RelatedPanel entityType="request" entityId={requestId} />
          </Section>
        </aside>
      </div>
    </div>
  );
}

export function WorkflowsView() {
  const t = useT();
  const definitions = useItem<WorkflowDefinition[]>("/workflows");

  return (
    <div>
      <PageHeader
        title={t("nav.workflows")}
        subtitle="Workflows are data: states, transitions and forms — new ones need no code"
      />
      <div className="space-y-3">
        {(definitions.data ?? []).map((definition) => (
          <Section
            key={definition.id}
            title={
              <span className="flex items-center gap-2">
                <span>{definition.icon}</span>
                {definition.name}
                <Badge>{definition.category}</Badge>
              </span>
            }
            action={
              <span className="text-[11px] text-faint">
                {definition.request_count} requests · {definition.open_count} open
              </span>
            }
            contentClassName="p-4"
          >
            <p className="mb-3 text-[13px] text-muted">{definition.description}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {definition.states
                .filter((state) => state.type !== "start")
                .map((state, index) => (
                  <React.Fragment key={state.key}>
                    {index > 0 ? <span className="text-faint">→</span> : null}
                    <span
                      className={cn(
                        "rounded border px-2 py-1 text-[11px]",
                        state.type === "terminal"
                          ? state.result === "rejected"
                            ? "border-danger/30 bg-danger/10 text-danger"
                            : "border-positive/30 bg-positive/10 text-positive"
                          : "border-accent/30 bg-accent-soft text-accent",
                      )}
                    >
                      {state.label}
                      {state.approver_role ? (
                        <span className="ms-1 text-[10px] opacity-70">({state.approver_role})</span>
                      ) : null}
                    </span>
                  </React.Fragment>
                ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {definition.form_schema.map((field) => (
                <Badge key={field.key}>
                  <FileText className="h-3 w-3" />
                  {field.label}
                  {field.required ? <span className="text-danger">*</span> : null}
                </Badge>
              ))}
            </div>
          </Section>
        ))}
        {!definitions.data?.length ? <EmptyState icon={WorkflowIcon} title={t("common.empty")} /> : null}
      </div>
    </div>
  );
}
