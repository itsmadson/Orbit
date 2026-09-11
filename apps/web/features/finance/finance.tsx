"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis,
} from "recharts";
import { Banknote, Plus, Receipt, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n, useT } from "@/lib/i18n";
import { useCreate, useCreateParam, useItem, useList } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import type { Invoice, Transaction } from "@/lib/types";
import { MetricCard, PageHeader, Section } from "@/components/shared/page";
import { Column, DataTable, FilterChips, Pagination, SearchInput, Toolbar } from "@/components/shared/data";
import { Badge, EmptyState, Progress, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { useProjects } from "@/components/shared/pickers";
import { useDebounced } from "@/lib/hooks";
import { cn, formatCurrency, formatDate, humanize } from "@/lib/utils";

type Summary = {
  income: number;
  expenses: number;
  net: number;
  outstanding: number;
  overdue: number;
  accounts_total: number;
  by_category: { name: string; color: string; amount: number }[];
  by_month: { month: string; income: number; expenses: number; net: number }[];
  by_project: { name: string; amount: number }[];
};

type Budget = {
  id: string;
  name: string;
  amount: number;
  spent: number;
  remaining: number;
  utilisation: number;
  project_name?: string | null;
};

export const chartAxis = {
  stroke: "var(--faint)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
};

export const chartTooltip = {
  contentStyle: {
    background: "var(--elevated)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--text)",
  },
  labelStyle: { color: "var(--muted)" },
};

export function FinanceView() {
  const t = useT();
  const { locale } = useI18n();
  const { can, company } = useSession();
  const [createOpen, setCreateOpen] = useCreateParam();
  const [invoiceOpen, setInvoiceOpen] = React.useState(false);
  const currency = company.currency ?? "USD";

  const summary = useItem<Summary>("/finance/summary", { months: 6 });
  const budgets = useItem<Budget[]>("/finance/budgets");

  return (
    <div>
      <PageHeader
        title={t("finance.title")}
        subtitle="Money connected to projects, customers, vendors and budgets"
        actions={
          can("finance.write") ? (
            <>
              <Button variant="secondary" onClick={() => setInvoiceOpen(true)}>
                <Receipt className="h-3.5 w-3.5" />
                {t("finance.newInvoice")}
              </Button>
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                {t("finance.newTransaction")}
              </Button>
            </>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={t("finance.income")}
          value={formatCurrency(summary.data?.income, currency, locale, true)}
          tone="positive"
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          hint="last 6 months"
        />
        <MetricCard
          label={t("finance.expenses")}
          value={formatCurrency(summary.data?.expenses, currency, locale, true)}
          icon={<TrendingDown className="h-3.5 w-3.5" />}
          hint="last 6 months"
        />
        <MetricCard
          label={t("finance.net")}
          value={formatCurrency(summary.data?.net, currency, locale, true)}
          tone={(summary.data?.net ?? 0) >= 0 ? "positive" : "danger"}
          icon={<Wallet className="h-3.5 w-3.5" />}
        />
        <MetricCard
          label={t("finance.outstanding")}
          value={formatCurrency(summary.data?.outstanding, currency, locale, true)}
          hint={
            summary.data?.overdue
              ? `${formatCurrency(summary.data.overdue, currency, locale, true)} overdue`
              : undefined
          }
          tone={summary.data?.overdue ? "warning" : "default"}
          icon={<Receipt className="h-3.5 w-3.5" />}
        />
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">{t("common.overview")}</TabsTrigger>
          <TabsTrigger value="transactions">{t("finance.transactions")}</TabsTrigger>
          <TabsTrigger value="invoices">{t("finance.invoices")}</TabsTrigger>
          <TabsTrigger value="budgets">{t("finance.budgets")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-3">
            <Section title={t("finance.cashflow")} className="lg:col-span-2" contentClassName="p-3">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={summary.data?.by_month ?? []}>
                    <defs>
                      <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--positive)" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="var(--positive)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent-hot)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" {...chartAxis} />
                    <YAxis {...chartAxis} width={54} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                    <ReTooltip
                      {...chartTooltip}
                      formatter={(value: any, name: any) => [
                        formatCurrency(Number(value), currency, locale),
                        humanize(String(name)),
                      ]}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      height={24}
                      iconType="plainline"
                      iconSize={10}
                      formatter={(value: any) => (
                        <span className="text-[11px] text-muted">{humanize(String(value))}</span>
                      )}
                    />
                    <Area
                      type="monotone"
                      dataKey="expenses"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      fill="url(#expenseFill)"
                    />
                    <Area
                      type="monotone"
                      dataKey="income"
                      stroke="var(--positive)"
                      strokeWidth={2}
                      fill="url(#incomeFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Section>

            <Section title={t("finance.byCategory")} contentClassName="p-3">
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={summary.data?.by_category ?? []}
                      dataKey="amount"
                      nameKey="name"
                      innerRadius={40}
                      outerRadius={66}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {(summary.data?.by_category ?? []).map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <ReTooltip
                      {...chartTooltip}
                      formatter={(value: any) => formatCurrency(Number(value), currency, locale)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 space-y-1">
                {(summary.data?.by_category ?? []).slice(0, 6).map((entry) => (
                  <li key={entry.name} className="flex items-center gap-2 text-[12px]">
                    <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
                    <span className="flex-1 truncate text-muted">{entry.name}</span>
                    <span>{formatCurrency(entry.amount, currency, locale, true)}</span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title={t("finance.byProject")} className="lg:col-span-3" contentClassName="p-3">
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.data?.by_project ?? []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" {...chartAxis} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                    <YAxis type="category" dataKey="name" {...chartAxis} width={130} />
                    <ReTooltip
                      {...chartTooltip}
                      formatter={(value: any) => formatCurrency(Number(value), currency, locale)}
                    />
                    <Bar dataKey="amount" fill="var(--accent-solid)" radius={[0, 4, 4, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="transactions">
          <TransactionsTable />
        </TabsContent>

        <TabsContent value="invoices">
          <InvoicesTable />
        </TabsContent>

        <TabsContent value="budgets">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(budgets.data ?? []).map((budget) => (
              <div key={budget.id} className="panel p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13px] font-medium">{budget.name}</p>
                  <Badge
                    className={cn(
                      budget.utilisation > 100
                        ? "border-danger/30 bg-danger/10 text-danger"
                        : budget.utilisation > 80
                          ? "border-warning/30 bg-warning/10 text-warning"
                          : "",
                    )}
                  >
                    {budget.utilisation}%
                  </Badge>
                </div>
                <Progress
                  value={Math.min(100, budget.utilisation)}
                  className="mt-3"
                  tone={
                    budget.utilisation > 100
                      ? "var(--danger)"
                      : budget.utilisation > 80
                        ? "var(--warning)"
                        : "var(--accent)"
                  }
                />
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
                  <span>{formatCurrency(budget.spent, currency, locale, true)} spent</span>
                  <span>{formatCurrency(budget.amount, currency, locale, true)}</span>
                </div>
                <p
                  className={cn(
                    "mt-1 text-[11px]",
                    budget.remaining < 0 ? "text-danger" : "text-faint",
                  )}
                >
                  {formatCurrency(budget.remaining, currency, locale, true)} {t("common.remaining").toLowerCase()}
                </p>
              </div>
            ))}
            {!budgets.data?.length ? <EmptyState icon={Banknote} title={t("common.empty")} /> : null}
          </div>
        </TabsContent>
      </Tabs>

      <TransactionDialog open={createOpen} onOpenChange={setCreateOpen} />
      <InvoiceDialog open={invoiceOpen} onOpenChange={setInvoiceOpen} />
    </div>
  );
}

function TransactionsTable() {
  const t = useT();
  const { locale } = useI18n();
  const { company } = useSession();
  const [query, setQuery] = React.useState("");
  const [kind, setKind] = React.useState<string | undefined>();
  const [page, setPage] = React.useState(1);
  const search = useDebounced(query);

  const list = useList<Transaction>("/finance/transactions", {
    q: search,
    kind,
    page,
    page_size: 40,
  });

  const columns: Column<Transaction>[] = [
    {
      key: "date",
      header: t("common.date"),
      width: "110px",
      cell: (row) => <span className="text-[12px] text-muted">{formatDate(row.occurred_on, locale)}</span>,
    },
    { key: "description", header: t("common.description"), cell: (row) => <span className="truncate">{row.description}</span> },
    {
      key: "category",
      header: t("finance.categories"),
      cell: (row) =>
        row.category_name ? (
          <span className="flex items-center gap-1.5 text-[12px] text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: row.category_color ?? "#64748b" }} />
            {row.category_name}
          </span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key: "project",
      header: t("common.project"),
      cell: (row) =>
        row.project_id ? (
          <Link href={`/projects/${row.project_id}`} className="text-[12px] text-muted hover:text-accent">
            {row.project_name}
          </Link>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key: "vendor",
      header: t("finance.vendors"),
      cell: (row) => <span className="text-[12px] text-muted">{row.vendor_name ?? "—"}</span>,
    },
    {
      key: "amount",
      header: t("common.amount"),
      align: "end",
      cell: (row) => (
        <span className={cn("font-medium", row.kind === "income" ? "text-positive" : "text-text")}>
          {row.kind === "income" ? "+" : "−"}
          {formatCurrency(row.amount, row.currency ?? company.currency, locale)}
        </span>
      ),
    },
  ];

  return (
    <>
      <Toolbar>
        <SearchInput value={query} onChange={setQuery} className="w-56" />
        <FilterChips
          value={kind}
          onChange={setKind}
          options={[
            { value: "income", label: t("finance.income") },
            { value: "expense", label: t("finance.expenses") },
          ]}
        />
      </Toolbar>
      <div className="panel overflow-hidden">
        <DataTable
          columns={columns}
          rows={list.data?.items ?? []}
          loading={list.isLoading}
          empty={<EmptyState icon={Banknote} title={t("common.empty")} />}
          compact
        />
        {list.data ? (
          <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} onPage={setPage} />
        ) : null}
      </div>
    </>
  );
}

function InvoicesTable() {
  const t = useT();
  const { locale } = useI18n();
  const { company } = useSession();
  const client = useQueryClient();
  const [status, setStatus] = React.useState<string | undefined>();
  const { can } = useSession();

  const list = useList<Invoice>("/finance/invoices", {
    status: status ? [status] : undefined,
    page_size: 50,
  });

  const markPaid = async (id: string) => {
    await api.patch(`/finance/invoices/${id}`, { status: "paid" });
    client.invalidateQueries({ queryKey: ["/finance/invoices"] });
    client.invalidateQueries({ queryKey: ["/finance/summary"] });
  };

  const columns: Column<Invoice>[] = [
    { key: "number", header: "Invoice", cell: (row) => <span className="font-mono text-[12px]">{row.number}</span> },
    { key: "customer", header: "Customer", cell: (row) => <span className="truncate">{row.customer_name ?? "—"}</span> },
    { key: "status", header: t("common.status"), cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: "issued",
      header: "Issued",
      cell: (row) => <span className="text-[12px] text-muted">{formatDate(row.issued_on, locale)}</span>,
    },
    {
      key: "due",
      header: "Due",
      cell: (row) => <span className="text-[12px] text-muted">{formatDate(row.due_on, locale)}</span>,
    },
    {
      key: "total",
      header: t("common.amount"),
      align: "end",
      cell: (row) => (
        <span className="font-medium">
          {formatCurrency(row.total, row.currency ?? company.currency, locale)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "end",
      cell: (row) =>
        can("finance.write") && row.status !== "paid" ? (
          <Button size="xs" variant="secondary" onClick={() => markPaid(row.id)}>
            Mark paid
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <Toolbar>
        <FilterChips
          value={status}
          onChange={setStatus}
          options={["draft", "sent", "paid", "overdue"].map((value) => ({
            value,
            label: humanize(value),
          }))}
        />
      </Toolbar>
      <div className="panel overflow-hidden">
        <DataTable
          columns={columns}
          rows={list.data?.items ?? []}
          loading={list.isLoading}
          empty={<EmptyState icon={Receipt} title={t("common.empty")} />}
        />
      </div>
    </>
  );
}

function TransactionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const projects = useProjects();
  const categories = useItem<{ id: string; name: string; kind: string }[]>("/finance/categories");
  const vendors = useItem<{ id: string; name: string }[]>("/finance/vendors");
  const accounts = useItem<{ id: string; name: string }[]>("/finance/accounts");

  const [form, setForm] = React.useState({
    kind: "expense",
    description: "",
    amount: "",
    occurred_on: new Date().toISOString().slice(0, 10),
    category_id: "",
    project_id: "",
    vendor_id: "",
    account_id: "",
  });

  const create = useCreate<Transaction>("/finance/transactions", {
    invalidate: ["/finance/transactions", "/finance/summary", "/finance/budgets", "dashboard"],
    success: "Transaction recorded",
    onDone: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title={t("finance.newTransaction")} />
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({
              ...form,
              amount: Number(form.amount),
              category_id: form.category_id || null,
              project_id: form.project_id || null,
              vendor_id: form.vendor_id || null,
              account_id: form.account_id || null,
            } as any);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("common.type")}>
              <SimpleSelect
                value={form.kind}
                onValueChange={(kind) => setForm({ ...form, kind, category_id: "" })}
                options={[
                  { value: "expense", label: t("finance.expenses") },
                  { value: "income", label: t("finance.income") },
                ]}
              />
            </Field>
            <Field label={t("common.amount")}>
              <Input
                type="number"
                step="0.01"
                required
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
              />
            </Field>
          </div>
          <Field label={t("common.description")}>
            <Input
              required
              autoFocus
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("common.date")}>
              <Input
                type="date"
                required
                value={form.occurred_on}
                onChange={(event) => setForm({ ...form, occurred_on: event.target.value })}
              />
            </Field>
            <Field label={t("finance.categories")}>
              <SimpleSelect
                value={form.category_id}
                onValueChange={(category_id) => setForm({ ...form, category_id })}
                placeholder={t("common.none")}
                options={(categories.data ?? [])
                  .filter((category) => category.kind === form.kind)
                  .map((category) => ({ value: category.id, label: category.name }))}
              />
            </Field>
            <Field label={t("common.project")}>
              <SimpleSelect
                value={form.project_id}
                onValueChange={(project_id) => setForm({ ...form, project_id })}
                placeholder={t("common.none")}
                options={(projects.data?.items ?? []).map((project) => ({
                  value: project.id,
                  label: `${project.icon} ${project.name}`,
                }))}
              />
            </Field>
            <Field label={t("procurement.vendor")}>
              <SimpleSelect
                value={form.vendor_id}
                onValueChange={(vendor_id) => setForm({ ...form, vendor_id })}
                placeholder={t("common.none")}
                options={(vendors.data ?? []).map((vendor) => ({
                  value: vendor.id,
                  label: vendor.name,
                }))}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("action.cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              {t("action.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const customers = useList<{ id: string; name: string }>("/crm/companies", { page_size: 100 });
  const projects = useProjects();
  const [form, setForm] = React.useState({
    customer_id: "",
    project_id: "",
    due_on: "",
    tax_rate: "0.19",
    status: "draft",
  });
  const [lines, setLines] = React.useState([{ description: "", qty: 1, unit_price: 0 }]);

  const create = useCreate<Invoice>("/finance/invoices", {
    invalidate: ["/finance/invoices", "/finance/summary"],
    success: "Invoice created",
    onDone: () => onOpenChange(false),
  });

  const subtotal = lines.reduce((total, line) => total + line.qty * line.unit_price, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader title={t("finance.newInvoice")} />
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({
              ...form,
              customer_id: form.customer_id || null,
              project_id: form.project_id || null,
              due_on: form.due_on || null,
              tax_rate: Number(form.tax_rate),
              issued_on: new Date().toISOString().slice(0, 10),
              lines,
            } as any);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer">
              <SimpleSelect
                value={form.customer_id}
                onValueChange={(customer_id) => setForm({ ...form, customer_id })}
                placeholder={t("common.none")}
                options={(customers.data?.items ?? []).map((customer) => ({
                  value: customer.id,
                  label: customer.name,
                }))}
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
            <Field label="Due date">
              <Input
                type="date"
                value={form.due_on}
                onChange={(event) => setForm({ ...form, due_on: event.target.value })}
              />
            </Field>
            <Field label="Tax rate">
              <Input
                type="number"
                step="0.01"
                value={form.tax_rate}
                onChange={(event) => setForm({ ...form, tax_rate: event.target.value })}
              />
            </Field>
          </div>

          <Field label="Lines">
            <div className="space-y-2">
              {lines.map((line, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    className="flex-1"
                    placeholder="Description"
                    value={line.description}
                    onChange={(event) => {
                      const next = [...lines];
                      next[index] = { ...line, description: event.target.value };
                      setLines(next);
                    }}
                  />
                  <Input
                    className="w-16"
                    type="number"
                    value={line.qty}
                    onChange={(event) => {
                      const next = [...lines];
                      next[index] = { ...line, qty: Number(event.target.value) };
                      setLines(next);
                    }}
                  />
                  <Input
                    className="w-28"
                    type="number"
                    value={line.unit_price}
                    onChange={(event) => {
                      const next = [...lines];
                      next[index] = { ...line, unit_price: Number(event.target.value) };
                      setLines(next);
                    }}
                  />
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setLines([...lines, { description: "", qty: 1, unit_price: 0 }])}
              >
                <Plus className="h-3.5 w-3.5" />
                {t("action.add")}
              </Button>
            </div>
          </Field>

          <p className="text-end text-[13px] text-muted">
            Subtotal: <span className="font-medium text-text">{subtotal.toFixed(2)}</span>
          </p>

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
