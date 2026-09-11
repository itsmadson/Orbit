"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Boxes, Laptop, Package, Plus, Truck } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n, useT } from "@/lib/i18n";
import { useCreate, useCreateParam, useDebounced, useItem, useList } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import { MetricCard, PageHeader, Section } from "@/components/shared/page";
import { Column, DataTable, FilterChips, SearchInput, Toolbar } from "@/components/shared/data";
import { Avatar, Badge, EmptyState, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { UserPicker } from "@/components/shared/pickers";
import { cn, formatCurrency, formatDate, humanize, isOverdue } from "@/lib/utils";

type Asset = {
  id: string;
  name: string;
  tag?: string | null;
  category: string;
  serial_number?: string | null;
  status: string;
  owner?: any;
  location?: string | null;
  purchase_date?: string | null;
  cost?: number | null;
  warranty_until?: string | null;
  vendor_name?: string | null;
};

const CATEGORIES = ["laptop", "server", "phone", "vehicle", "license", "domain", "equipment", "office"];
const STATUSES = ["in_use", "available", "maintenance", "retired", "lost"];

export function AssetsView() {
  const t = useT();
  const { locale } = useI18n();
  const { can, company } = useSession();
  const [createOpen, setCreateOpen] = useCreateParam();
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<string | undefined>();
  const search = useDebounced(query);

  const list = useList<Asset>("/assets", {
    q: search,
    category: category ? [category] : undefined,
    page_size: 60,
  });
  const summary = useItem<any>("/assets/summary");

  const columns: Column<Asset>[] = [
    {
      key: "name",
      header: t("common.name"),
      cell: (row) => (
        <span className="flex items-center gap-2">
          <Laptop className="h-3.5 w-3.5 text-faint" />
          <span className="truncate font-medium">{row.name}</span>
          {row.tag ? <span className="font-mono text-[10px] text-faint">{row.tag}</span> : null}
        </span>
      ),
    },
    { key: "category", header: t("assets.category"), cell: (row) => <Badge>{humanize(row.category)}</Badge> },
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
    { key: "location", header: t("assets.location"), cell: (row) => <span className="text-[12px] text-muted">{row.location ?? "—"}</span> },
    {
      key: "warranty",
      header: t("assets.warranty"),
      cell: (row) => (
        <span className={cn("text-[12px]", isOverdue(row.warranty_until) ? "text-danger" : "text-muted")}>
          {formatDate(row.warranty_until, locale)}
        </span>
      ),
    },
    {
      key: "cost",
      header: "Cost",
      align: "end",
      cell: (row) => (
        <span className="text-[12px]">
          {row.cost ? formatCurrency(row.cost, company.currency, locale, true) : "—"}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("assets.title")}
        subtitle="Everything the company owns, and who holds it"
        actions={
          can("assets.write") ? (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("assets.new")}
            </Button>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label={t("assets.title")} value={list.data?.total ?? 0} icon={<Boxes className="h-3.5 w-3.5" />} />
        <MetricCard
          label={t("assets.totalValue")}
          value={formatCurrency(summary.data?.total_value ?? 0, company.currency, locale, true)}
        />
        <MetricCard label="In use" value={summary.data?.by_status?.in_use ?? 0} tone="accent" />
        <MetricCard
          label="Maintenance"
          value={summary.data?.by_status?.maintenance ?? 0}
          tone={summary.data?.by_status?.maintenance ? "warning" : "default"}
        />
      </div>

      <Toolbar>
        <SearchInput value={query} onChange={setQuery} className="w-56" />
        <FilterChips
          value={category}
          onChange={setCategory}
          options={CATEGORIES.map((value) => ({ value, label: humanize(value) }))}
        />
      </Toolbar>

      <div className="panel overflow-hidden">
        <DataTable
          columns={columns}
          rows={list.data?.items ?? []}
          loading={list.isLoading}
          empty={<EmptyState icon={Boxes} title={t("common.empty")} />}
        />
      </div>

      <AssetDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function AssetDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const vendors = useItem<{ id: string; name: string }[]>("/finance/vendors");
  const [form, setForm] = React.useState({
    name: "",
    tag: "",
    category: "laptop",
    serial_number: "",
    status: "in_use",
    owner_id: null as string | null,
    location: "",
    purchase_date: "",
    cost: "",
    warranty_until: "",
    vendor_id: "",
    notes: "",
  });

  const create = useCreate<Asset>("/assets", {
    invalidate: ["/assets", "/assets/summary"],
    success: "Asset registered",
    onDone: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader title={t("assets.new")} />
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({
              ...form,
              cost: form.cost ? Number(form.cost) : null,
              purchase_date: form.purchase_date || null,
              warranty_until: form.warranty_until || null,
              vendor_id: form.vendor_id || null,
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
            <Field label={t("assets.category")}>
              <SimpleSelect
                value={form.category}
                onValueChange={(category) => setForm({ ...form, category })}
                options={CATEGORIES.map((value) => ({ value, label: humanize(value) }))}
              />
            </Field>
            <Field label={t("common.status")}>
              <SimpleSelect
                value={form.status}
                onValueChange={(status) => setForm({ ...form, status })}
                options={STATUSES.map((value) => ({ value, label: humanize(value) }))}
              />
            </Field>
            <Field label="Asset tag">
              <Input value={form.tag} onChange={(event) => setForm({ ...form, tag: event.target.value })} />
            </Field>
            <Field label={t("assets.serial")}>
              <Input
                value={form.serial_number}
                onChange={(event) => setForm({ ...form, serial_number: event.target.value })}
              />
            </Field>
            <Field label={t("common.owner")}>
              <UserPicker value={form.owner_id} onChange={(owner_id) => setForm({ ...form, owner_id })} />
            </Field>
            <Field label={t("assets.location")}>
              <Input
                value={form.location}
                onChange={(event) => setForm({ ...form, location: event.target.value })}
              />
            </Field>
            <Field label="Purchase date">
              <Input
                type="date"
                value={form.purchase_date}
                onChange={(event) => setForm({ ...form, purchase_date: event.target.value })}
              />
            </Field>
            <Field label="Cost">
              <Input
                type="number"
                value={form.cost}
                onChange={(event) => setForm({ ...form, cost: event.target.value })}
              />
            </Field>
            <Field label={t("assets.warranty")}>
              <Input
                type="date"
                value={form.warranty_until}
                onChange={(event) => setForm({ ...form, warranty_until: event.target.value })}
              />
            </Field>
            <Field label={t("procurement.vendor")}>
              <SimpleSelect
                value={form.vendor_id}
                onValueChange={(vendor_id) => setForm({ ...form, vendor_id })}
                placeholder={t("common.none")}
                options={(vendors.data ?? []).map((vendor) => ({ value: vendor.id, label: vendor.name }))}
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

type PurchaseOrder = {
  id: string;
  number: string;
  title: string;
  status: string;
  vendor_name?: string | null;
  total: number;
  currency: string;
  ordered_on?: string | null;
  expected_on?: string | null;
  delivered_on?: string | null;
  request_id?: string | null;
  invoice_id?: string | null;
};

export function ProcurementView() {
  const t = useT();
  const { locale } = useI18n();
  const client = useQueryClient();
  const { can, company } = useSession();
  const [status, setStatus] = React.useState<string | undefined>();

  const orders = useList<PurchaseOrder>("/purchase-orders", {
    status: status ? [status] : undefined,
    page_size: 50,
  });
  const vendors = useItem<any[]>("/finance/vendors");

  const advance = async (order: PurchaseOrder, next: string) => {
    await api.patch(`/purchase-orders/${order.id}`, { status: next });
    client.invalidateQueries({ queryKey: ["/purchase-orders"] });
  };

  const columns: Column<PurchaseOrder>[] = [
    { key: "number", header: "PO", cell: (row) => <span className="font-mono text-[12px]">{row.number}</span> },
    { key: "title", header: t("common.title"), cell: (row) => <span className="truncate font-medium">{row.title}</span> },
    { key: "vendor", header: t("procurement.vendor"), cell: (row) => <span className="text-[12px] text-muted">{row.vendor_name ?? "—"}</span> },
    { key: "status", header: t("common.status"), cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: "total",
      header: t("common.amount"),
      align: "end",
      cell: (row) => <span>{formatCurrency(row.total, row.currency ?? company.currency, locale, true)}</span>,
    },
    {
      key: "expected",
      header: "Expected",
      align: "end",
      cell: (row) => <span className="text-[12px] text-muted">{formatDate(row.expected_on, locale)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "end",
      cell: (row) => {
        if (!can("procurement.write")) return null;
        const next = { draft: "ordered", ordered: "delivered", delivered: "invoiced", invoiced: "paid" }[
          row.status
        ];
        return next ? (
          <Button size="xs" variant="secondary" onClick={() => advance(row, next)}>
            → {humanize(next)}
          </Button>
        ) : null;
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("procurement.title")}
        subtitle="Purchase request → approval → order → delivery → invoice → payment"
      />

      <Tabs defaultValue="orders">
        <TabsList className="mb-4">
          <TabsTrigger value="orders" count={orders.data?.total}>
            {t("procurement.purchaseOrders")}
          </TabsTrigger>
          <TabsTrigger value="vendors" count={vendors.data?.length}>
            {t("finance.vendors")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          <Toolbar>
            <FilterChips
              value={status}
              onChange={setStatus}
              options={["draft", "ordered", "delivered", "invoiced", "paid"].map((value) => ({
                value,
                label: humanize(value),
              }))}
            />
          </Toolbar>
          <div className="panel overflow-hidden">
            <DataTable
              columns={columns}
              rows={orders.data?.items ?? []}
              loading={orders.isLoading}
              empty={
                <EmptyState
                  icon={Package}
                  title={t("common.empty")}
                  description="Approved purchase requests become orders here."
                />
              }
            />
          </div>
        </TabsContent>

        <TabsContent value="vendors">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(vendors.data ?? []).map((vendor) => (
              <div key={vendor.id} className="panel p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[14px] font-medium">{vendor.name}</p>
                  <Badge>{vendor.category ?? "—"}</Badge>
                </div>
                <p className="mt-1 text-[12px] text-muted">{vendor.email ?? "—"}</p>
                <div className="mt-3 flex items-center justify-between text-[12px]">
                  <span className="text-muted">Total spend</span>
                  <span className="font-medium">
                    {formatCurrency(vendor.total_spend, company.currency, locale, true)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-0.5 text-[12px] text-warning">
                  {"★".repeat(vendor.rating ?? 0)}
                  <span className="text-faint">{"★".repeat(5 - (vendor.rating ?? 0))}</span>
                </div>
              </div>
            ))}
            {!vendors.data?.length ? <EmptyState icon={Truck} title={t("common.empty")} /> : null}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
