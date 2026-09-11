"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Handshake, Mail, Phone, Plus, Receipt } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n, useT } from "@/lib/i18n";
import { useCreate, useCreateParam, useDebounced, useItem, useList } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import { MetricCard, PageHeader, Section } from "@/components/shared/page";
import { Column, DataTable, FilterChips, SearchInput, Toolbar } from "@/components/shared/data";
import { DetailRow, LoadingPanel, RelatedPanel } from "@/components/shared/entity";
import { Avatar, Badge, EmptyState, Progress, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { UserPicker, useProjects } from "@/components/shared/pickers";
import { cn, formatCurrency, formatDate, humanize, relativeTime } from "@/lib/utils";

type Customer = {
  id: string;
  name: string;
  industry?: string | null;
  website?: string | null;
  country?: string | null;
  status: string;
  owner?: any;
  annual_value?: number | null;
  contact_count: number;
  open_deals: number;
  pipeline_value: number;
  notes?: string | null;
};

type Deal = {
  id: string;
  title: string;
  crm_company_id?: string | null;
  crm_company_name?: string | null;
  stage: string;
  value: number;
  currency: string;
  probability: number;
  owner?: any;
  expected_close?: string | null;
};

const STAGES = ["qualification", "proposal", "negotiation", "won", "lost"];

export function CrmView() {
  const t = useT();
  const { locale } = useI18n();
  const { can, company } = useSession();
  const [createOpen, setCreateOpen] = useCreateParam();
  const [dealOpen, setDealOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<string | undefined>();
  const search = useDebounced(query);
  const currency = company.currency ?? "USD";

  const customers = useList<Customer>("/crm/companies", {
    q: search,
    status: status ? [status] : undefined,
    page_size: 50,
  });
  const pipeline = useItem<{ stages: { key: string; label: string; value: number; count: number; deals: Deal[] }[] }>(
    "/crm/pipeline",
  );

  const totalPipeline = (pipeline.data?.stages ?? [])
    .filter((stage) => !["won", "lost"].includes(stage.key))
    .reduce((total, stage) => total + stage.value, 0);
  const won = pipeline.data?.stages.find((stage) => stage.key === "won");

  const columns: Column<Customer>[] = [
    {
      key: "name",
      header: t("common.name"),
      cell: (row) => (
        <span className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-surface-2 text-[10px] font-medium text-muted">
            {row.name.slice(0, 2).toUpperCase()}
          </span>
          <span className="truncate font-medium">{row.name}</span>
        </span>
      ),
    },
    { key: "industry", header: "Industry", cell: (row) => <span className="text-[12px] text-muted">{row.industry ?? "—"}</span> },
    { key: "status", header: t("common.status"), cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: "owner",
      header: t("common.owner"),
      cell: (row) =>
        row.owner ? (
          <span className="flex items-center gap-1.5 text-[12px]">
            <Avatar name={row.owner.full_name} color={row.owner.avatar_color} size={18} />
            {row.owner.full_name}
          </span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    { key: "deals", header: "Open deals", align: "center", cell: (row) => <span className="text-[12px]">{row.open_deals}</span> },
    {
      key: "pipeline",
      header: t("crm.pipeline"),
      align: "end",
      cell: (row) => (
        <span className="text-[12px]">{formatCurrency(row.pipeline_value, currency, locale, true)}</span>
      ),
    },
    {
      key: "annual",
      header: "Annual value",
      align: "end",
      cell: (row) => (
        <span className="text-[12px] text-muted">
          {row.annual_value ? formatCurrency(row.annual_value, currency, locale, true) : "—"}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("crm.title")}
        subtitle="Customers, deals and contracts — connected to the projects that deliver them"
        actions={
          can("crm.write") ? (
            <>
              <Button variant="secondary" onClick={() => setDealOpen(true)}>
                <Handshake className="h-3.5 w-3.5" />
                {t("crm.newDeal")}
              </Button>
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                {t("crm.newCompany")}
              </Button>
            </>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label={t("crm.companies")} value={customers.data?.total ?? 0} icon={<Building2 className="h-3.5 w-3.5" />} />
        <MetricCard
          label={t("crm.pipeline")}
          value={formatCurrency(totalPipeline, currency, locale, true)}
          tone="accent"
          icon={<Handshake className="h-3.5 w-3.5" />}
        />
        <MetricCard
          label="Won"
          value={formatCurrency(won?.value ?? 0, currency, locale, true)}
          hint={`${won?.count ?? 0} deals`}
          tone="positive"
        />
        <MetricCard
          label="Customers"
          value={(customers.data?.items ?? []).filter((row) => row.status === "customer").length}
        />
      </div>

      <Tabs defaultValue="pipeline">
        <TabsList className="mb-4">
          <TabsTrigger value="pipeline">{t("crm.pipeline")}</TabsTrigger>
          <TabsTrigger value="companies">{t("crm.companies")}</TabsTrigger>
          <TabsTrigger value="contracts">{t("crm.contracts")}</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline">
          <div className="no-scrollbar flex gap-3 overflow-x-auto pb-3">
            {(pipeline.data?.stages ?? []).map((stage) => (
              <div key={stage.key} className="w-[280px] shrink-0">
                <div className="mb-2 flex items-center gap-2 px-1">
                  <span className="text-[12px] font-medium">{stage.label}</span>
                  <span className="rounded bg-surface-2 px-1.5 text-[10px] text-muted">{stage.count}</span>
                  <span className="ms-auto text-[11px] text-muted">
                    {formatCurrency(stage.value, currency, locale, true)}
                  </span>
                </div>
                <div className="space-y-2">
                  {stage.deals.map((deal) => (
                    <DealCard key={deal.id} deal={deal} />
                  ))}
                  {!stage.deals.length ? (
                    <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[11px] text-faint">
                      {t("common.empty")}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="companies">
          <Toolbar>
            <SearchInput value={query} onChange={setQuery} className="w-56" />
            <FilterChips
              value={status}
              onChange={setStatus}
              options={["lead", "prospect", "customer", "churned"].map((value) => ({
                value,
                label: humanize(value),
              }))}
            />
          </Toolbar>
          <div className="panel overflow-hidden">
            <DataTable
              columns={columns}
              rows={customers.data?.items ?? []}
              loading={customers.isLoading}
              rowHref={(row) => `/crm/${row.id}`}
              empty={<EmptyState icon={Building2} title={t("common.empty")} />}
            />
          </div>
        </TabsContent>

        <TabsContent value="contracts">
          <ContractsTable />
        </TabsContent>
      </Tabs>

      <CustomerDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DealDialog open={dealOpen} onOpenChange={setDealOpen} />
    </div>
  );
}

function DealCard({ deal }: { deal: Deal }) {
  const { locale } = useI18n();
  const client = useQueryClient();
  const { can } = useSession();

  return (
    <div className="panel p-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug">{deal.title}</p>
        <span className="shrink-0 text-[12px] font-medium">
          {formatCurrency(deal.value, deal.currency, locale, true)}
        </span>
      </div>
      {deal.crm_company_id ? (
        <Link
          href={`/crm/${deal.crm_company_id}`}
          className="mt-1 block truncate text-[11px] text-muted hover:text-accent"
        >
          {deal.crm_company_name}
        </Link>
      ) : null}
      <div className="mt-2 flex items-center gap-2">
        <Progress value={deal.probability} className="flex-1" />
        <span className="text-[10px] text-faint">{deal.probability}%</span>
        {deal.owner ? (
          <Avatar name={deal.owner.full_name} color={deal.owner.avatar_color} size={16} />
        ) : null}
      </div>
      {can("crm.write") && !["won", "lost"].includes(deal.stage) ? (
        <div className="mt-2 flex gap-1">
          <select
            value={deal.stage}
            onChange={async (event) => {
              await api.patch(`/crm/deals/${deal.id}`, { stage: event.target.value });
              client.invalidateQueries({ queryKey: ["/crm/pipeline"] });
              client.invalidateQueries({ queryKey: ["/crm/companies"] });
            }}
            className="w-full rounded border border-border bg-surface-2 px-1.5 py-1 text-[11px]"
          >
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {humanize(stage)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}

function ContractsTable() {
  const t = useT();
  const { locale } = useI18n();
  const { company } = useSession();
  const contracts = useItem<any[]>("/crm/contracts");

  const columns: Column<any>[] = [
    { key: "title", header: t("common.title"), cell: (row) => <span className="font-medium">{row.title}</span> },
    { key: "number", header: "Number", cell: (row) => <span className="font-mono text-[12px] text-muted">{row.number ?? "—"}</span> },
    { key: "customer", header: "Customer", cell: (row) => <span className="text-[12px]">{row.crm_company_name ?? "—"}</span> },
    { key: "status", header: t("common.status"), cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: "value",
      header: t("crm.value"),
      align: "end",
      cell: (row) => <span>{formatCurrency(row.value, company.currency, locale, true)}</span>,
    },
    {
      key: "end",
      header: "Ends",
      align: "end",
      cell: (row) => <span className="text-[12px] text-muted">{formatDate(row.end_date, locale)}</span>,
    },
  ];

  return (
    <div className="panel overflow-hidden">
      <DataTable
        columns={columns}
        rows={contracts.data ?? []}
        loading={contracts.isLoading}
        empty={<EmptyState icon={Receipt} title={t("common.empty")} />}
      />
    </div>
  );
}

function CustomerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const [form, setForm] = React.useState({
    name: "",
    industry: "",
    website: "",
    country: "",
    status: "lead",
    owner_id: null as string | null,
    annual_value: "",
    notes: "",
  });

  const create = useCreate<Customer>("/crm/companies", {
    invalidate: ["/crm/companies"],
    success: "Customer created",
    onDone: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title={t("crm.newCompany")} />
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({
              ...form,
              annual_value: form.annual_value ? Number(form.annual_value) : null,
            } as any);
          }}
        >
          <Field label={t("common.name")}>
            <Input
              required
              autoFocus
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Industry">
              <Input
                value={form.industry}
                onChange={(event) => setForm({ ...form, industry: event.target.value })}
              />
            </Field>
            <Field label="Country">
              <Input
                value={form.country}
                onChange={(event) => setForm({ ...form, country: event.target.value })}
              />
            </Field>
            <Field label="Website">
              <Input
                value={form.website}
                onChange={(event) => setForm({ ...form, website: event.target.value })}
              />
            </Field>
            <Field label={t("common.status")}>
              <SimpleSelect
                value={form.status}
                onValueChange={(status) => setForm({ ...form, status })}
                options={["lead", "prospect", "customer", "churned"].map((value) => ({
                  value,
                  label: humanize(value),
                }))}
              />
            </Field>
            <Field label={t("common.owner")}>
              <UserPicker value={form.owner_id} onChange={(owner_id) => setForm({ ...form, owner_id })} />
            </Field>
            <Field label="Annual value">
              <Input
                type="number"
                value={form.annual_value}
                onChange={(event) => setForm({ ...form, annual_value: event.target.value })}
              />
            </Field>
          </div>
          <Field label={t("common.notes")}>
            <Textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
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

export function DealDialog({
  open,
  onOpenChange,
  customerId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId?: string;
}) {
  const t = useT();
  const customers = useList<Customer>("/crm/companies", { page_size: 100 });
  const projects = useProjects();
  const [form, setForm] = React.useState({
    title: "",
    crm_company_id: customerId ?? "",
    stage: "qualification",
    value: "",
    probability: 50,
    owner_id: null as string | null,
    expected_close: "",
    project_id: "",
  });

  const create = useCreate<Deal>("/crm/deals", {
    invalidate: ["/crm/pipeline", "/crm/companies"],
    success: "Deal created",
    onDone: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title={t("crm.newDeal")} />
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({
              ...form,
              value: Number(form.value || 0),
              crm_company_id: form.crm_company_id || null,
              project_id: form.project_id || null,
              expected_close: form.expected_close || null,
            } as any);
          }}
        >
          <Field label={t("common.title")}>
            <Input
              required
              autoFocus
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer">
              <SimpleSelect
                value={form.crm_company_id}
                onValueChange={(crm_company_id) => setForm({ ...form, crm_company_id })}
                placeholder={t("common.none")}
                options={(customers.data?.items ?? []).map((customer) => ({
                  value: customer.id,
                  label: customer.name,
                }))}
              />
            </Field>
            <Field label={t("crm.stage")}>
              <SimpleSelect
                value={form.stage}
                onValueChange={(stage) => setForm({ ...form, stage })}
                options={STAGES.map((value) => ({ value, label: humanize(value) }))}
              />
            </Field>
            <Field label={t("crm.value")}>
              <Input
                type="number"
                value={form.value}
                onChange={(event) => setForm({ ...form, value: event.target.value })}
              />
            </Field>
            <Field label={`${t("crm.probability")}: ${form.probability}%`}>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={form.probability}
                onChange={(event) => setForm({ ...form, probability: Number(event.target.value) })}
                className="w-full accent-[var(--accent)]"
              />
            </Field>
            <Field label={t("common.owner")}>
              <UserPicker value={form.owner_id} onChange={(owner_id) => setForm({ ...form, owner_id })} />
            </Field>
            <Field label="Expected close">
              <Input
                type="date"
                value={form.expected_close}
                onChange={(event) => setForm({ ...form, expected_close: event.target.value })}
              />
            </Field>
          </div>
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

export function CustomerDetail({ customerId }: { customerId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const { company, can } = useSession();
  const client = useQueryClient();
  const [dealOpen, setDealOpen] = React.useState(false);
  const [note, setNote] = React.useState("");

  const { data, isLoading } = useItem<any>(`/crm/companies/${customerId}`);
  if (isLoading || !data) return <LoadingPanel />;
  const customer = data.company;

  const addNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!note.trim()) return;
    await api.post("/crm/activities", {
      crm_company_id: customerId,
      type: "note",
      subject: note.slice(0, 80),
      body: note,
    });
    setNote("");
    client.invalidateQueries({ queryKey: [`/crm/companies/${customerId}`] });
  };

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: t("crm.title"), href: "/crm" }, { label: customer.name }]}
        icon={<Building2 className="h-5 w-5 text-muted" />}
        title={customer.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2 text-[12px]">
            <StatusBadge status={customer.status} />
            {customer.industry ? <span>{customer.industry}</span> : null}
            {customer.country ? <span className="text-faint">· {customer.country}</span> : null}
            {customer.website ? (
              <a href={customer.website} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                {customer.website.replace(/^https?:\/\//, "")}
              </a>
            ) : null}
          </span>
        }
        actions={
          can("crm.write") ? (
            <Button variant="primary" onClick={() => setDealOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("crm.newDeal")}
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Section title={t("crm.deals")} contentClassName="p-0">
            <ul>
              {data.deals.map((deal: Deal) => (
                <li
                  key={deal.id}
                  className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-0"
                >
                  <Handshake className="h-3.5 w-3.5 shrink-0 text-faint" />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{deal.title}</span>
                  <StatusBadge status={deal.stage} />
                  <span className="w-24 text-end text-[13px] font-medium">
                    {formatCurrency(deal.value, company.currency, locale, true)}
                  </span>
                </li>
              ))}
              {!data.deals.length ? <p className="p-4 text-[13px] text-faint">{t("common.empty")}</p> : null}
            </ul>
          </Section>

          <div className="grid gap-4 sm:grid-cols-2">
            <Section title={t("crm.contracts")} contentClassName="p-0">
              <ul>
                {data.contracts.map((contract: any) => (
                  <li key={contract.id} className="border-b border-border/60 px-4 py-2.5 last:border-0">
                    <p className="text-[13px]">{contract.title}</p>
                    <p className="text-[11px] text-faint">
                      {formatCurrency(contract.value, company.currency, locale, true)} ·{" "}
                      {formatDate(contract.end_date, locale)}
                    </p>
                  </li>
                ))}
                {!data.contracts.length ? (
                  <p className="p-4 text-[13px] text-faint">{t("common.empty")}</p>
                ) : null}
              </ul>
            </Section>
            <Section title={t("finance.invoices")} contentClassName="p-0">
              <ul>
                {data.invoices.map((invoice: any) => (
                  <li
                    key={invoice.id}
                    className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5 last:border-0"
                  >
                    <span className="font-mono text-[11px] text-muted">{invoice.number}</span>
                    <StatusBadge status={invoice.status} />
                    <span className="ms-auto text-[13px]">
                      {formatCurrency(invoice.total, company.currency, locale, true)}
                    </span>
                  </li>
                ))}
                {!data.invoices.length ? (
                  <p className="p-4 text-[13px] text-faint">{t("common.empty")}</p>
                ) : null}
              </ul>
            </Section>
          </div>

          <Section title={t("crm.activities")} contentClassName="p-3">
            {can("crm.write") ? (
              <form onSubmit={addNote} className="mb-3 flex gap-2">
                <Input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Log a call, email or note…"
                />
                <Button type="submit" variant="primary">
                  {t("action.add")}
                </Button>
              </form>
            ) : null}
            <ul className="space-y-2.5">
              {data.activities.map((activity: any) => (
                <li key={activity.id} className="flex gap-2.5">
                  <Avatar name={activity.user?.full_name} color={activity.user?.avatar_color} size={22} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px]">
                      <Badge>{activity.type}</Badge> <span className="ms-1">{activity.subject}</span>
                    </p>
                    {activity.body ? <p className="text-[12px] text-muted">{activity.body}</p> : null}
                    <p className="text-[11px] text-faint">{relativeTime(activity.created_at, locale)}</p>
                  </div>
                </li>
              ))}
              {!data.activities.length ? <p className="text-[13px] text-faint">{t("common.empty")}</p> : null}
            </ul>
          </Section>
        </div>

        <aside className="space-y-4">
          <Section title={t("crm.contacts")} contentClassName="p-3">
            <ul className="space-y-2.5">
              {data.contacts.map((contact: any) => (
                <li key={contact.id}>
                  <p className="text-[13px] font-medium">
                    {contact.full_name}
                    {contact.is_primary ? (
                      <Badge className="ms-1.5 border-accent/30 bg-accent-soft text-accent">primary</Badge>
                    ) : null}
                  </p>
                  <p className="text-[11px] text-faint">{contact.title}</p>
                  {contact.email ? (
                    <a
                      href={`mailto:${contact.email}`}
                      className="flex items-center gap-1 text-[11px] text-muted hover:text-accent"
                    >
                      <Mail className="h-3 w-3" />
                      {contact.email}
                    </a>
                  ) : null}
                  {contact.phone ? (
                    <span className="flex items-center gap-1 text-[11px] text-muted">
                      <Phone className="h-3 w-3" />
                      {contact.phone}
                    </span>
                  ) : null}
                </li>
              ))}
              {!data.contacts.length ? <p className="text-[13px] text-faint">{t("common.empty")}</p> : null}
            </ul>
          </Section>

          <Section title={t("common.details")} contentClassName="p-3">
            <div className="divide-y divide-border/60">
              <DetailRow label={t("common.status")}>
                <StatusBadge status={customer.status} />
              </DetailRow>
              <DetailRow label={t("common.owner")}>{customer.owner?.full_name ?? "—"}</DetailRow>
              <DetailRow label="Annual value">
                {customer.annual_value
                  ? formatCurrency(customer.annual_value, company.currency, locale, true)
                  : "—"}
              </DetailRow>
              <DetailRow label={t("crm.pipeline")}>
                {formatCurrency(customer.pipeline_value, company.currency, locale, true)}
              </DetailRow>
            </div>
          </Section>

          <Section title={t("common.related")} contentClassName="p-2">
            <RelatedPanel entityType="crm_company" entityId={customerId} />
          </Section>
        </aside>
      </div>

      <DealDialog open={dealOpen} onOpenChange={setDealOpen} customerId={customerId} />
    </div>
  );
}
