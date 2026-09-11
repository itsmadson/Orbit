"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Atom, FlaskConical, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n, useT } from "@/lib/i18n";
import { useCreate, useCreateParam, useDebounced, useItem, useList } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import type { Experiment, Research } from "@/lib/types";
import { MetricCard, PageHeader, Section } from "@/components/shared/page";
import { Column, DataTable, FilterChips, SearchInput, Toolbar } from "@/components/shared/data";
import { Comments, DetailRow, LoadingPanel, RelatedPanel } from "@/components/shared/entity";
import { Avatar, Badge, EmptyState, Progress, Skeleton, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { TagInput, UserPicker } from "@/components/shared/pickers";
import { formatCurrency, formatDate, humanize } from "@/lib/utils";

const EXPERIMENT_STATUSES = ["planned", "running", "completed", "failed", "validated", "archived"];

export function RdListView() {
  const t = useT();
  const { locale } = useI18n();
  const { can, company } = useSession();
  const [createOpen, setCreateOpen] = useCreateParam();
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<string | undefined>();
  const search = useDebounced(query);

  const list = useList<Research>("/rd", {
    q: search,
    status: status ? [status] : undefined,
    page_size: 40,
  });
  const experiments = useList<Experiment>("/experiments", { page_size: 100 });

  const running = (experiments.data?.items ?? []).filter((item) => item.status === "running").length;
  const validated = (experiments.data?.items ?? []).filter((item) => item.status === "validated").length;

  return (
    <div>
      <PageHeader
        title={t("rd.title")}
        subtitle="Research questions, hypotheses and the experiments that answer them"
        actions={
          can("rd.write") ? (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("rd.new")}
            </Button>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label={t("rd.title")} value={list.data?.total ?? 0} icon={<FlaskConical className="h-3.5 w-3.5" />} />
        <MetricCard label={t("rd.experiments")} value={experiments.data?.total ?? 0} icon={<Atom className="h-3.5 w-3.5" />} />
        <MetricCard label="Running" value={running} tone="accent" />
        <MetricCard label="Validated" value={validated} tone="positive" />
      </div>

      <Toolbar>
        <SearchInput value={query} onChange={setQuery} className="w-56" />
        <FilterChips
          value={status}
          onChange={setStatus}
          options={["active", "completed", "paused"].map((value) => ({ value, label: humanize(value) }))}
        />
      </Toolbar>

      {list.isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-40" />
          ))}
        </div>
      ) : !list.data?.items.length ? (
        <EmptyState icon={FlaskConical} title={t("common.empty")} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.data.items.map((research) => (
            <Link
              key={research.id}
              href={`/rd/${research.id}`}
              className="panel p-4 transition-all hover:-translate-y-px hover:border-border-strong"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[14px] font-medium leading-snug">{research.title}</p>
                <StatusBadge status={research.status} />
              </div>
              {research.research_question ? (
                <p className="mt-1.5 line-clamp-2 text-[12px] italic text-muted">
                  “{research.research_question}”
                </p>
              ) : null}
              <div className="mt-3 flex items-center gap-3 text-[11px] text-muted">
                {research.lead ? (
                  <span className="flex items-center gap-1.5">
                    <Avatar name={research.lead.full_name} color={research.lead.avatar_color} size={16} />
                    {research.lead.full_name}
                  </span>
                ) : null}
                <span>
                  {research.experiment_count} {t("rd.experiments").toLowerCase()}
                </span>
                {research.running_experiments ? (
                  <span className="text-accent">{research.running_experiments} running</span>
                ) : null}
                {research.budget ? (
                  <span className="ms-auto">
                    {formatCurrency(research.budget, company.currency, locale, true)}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}

      <ResearchDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function ResearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const [form, setForm] = React.useState({
    title: "",
    research_question: "",
    hypothesis: "",
    objectives: [] as string[],
    methods: "",
    status: "active",
    lead_id: null as string | null,
    budget: "",
  });

  const create = useCreate<Research>("/rd", {
    invalidate: ["/rd", "dashboard"],
    success: "R&D project created",
    onDone: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader title={t("rd.new")} />
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({
              ...form,
              budget: form.budget ? Number(form.budget) : null,
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
          <Field label={t("rd.question")}>
            <Textarea
              value={form.research_question}
              onChange={(event) => setForm({ ...form, research_question: event.target.value })}
              placeholder="What are we trying to find out?"
            />
          </Field>
          <Field label={t("rd.hypothesis")}>
            <Textarea
              value={form.hypothesis}
              onChange={(event) => setForm({ ...form, hypothesis: event.target.value })}
              placeholder="We believe that…"
            />
          </Field>
          <Field label={t("rd.objectives")} hint="Enter to add">
            <TagInput
              value={form.objectives}
              onChange={(objectives) => setForm({ ...form, objectives })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Lead researcher">
              <UserPicker value={form.lead_id} onChange={(lead_id) => setForm({ ...form, lead_id })} />
            </Field>
            <Field label={t("common.budget")}>
              <Input
                type="number"
                value={form.budget}
                onChange={(event) => setForm({ ...form, budget: event.target.value })}
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

export function ResearchDetail({ researchId }: { researchId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const client = useQueryClient();
  const { can, company } = useSession();
  const [experimentOpen, setExperimentOpen] = React.useState(false);

  const { data: research, isLoading } = useItem<Research>(`/rd/${researchId}`);
  const experiments = useItem<Experiment[]>(`/rd/${researchId}/experiments`);

  const refresh = () => {
    client.invalidateQueries({ queryKey: [`/rd/${researchId}`] });
    client.invalidateQueries({ queryKey: [`/rd/${researchId}/experiments`] });
  };

  if (isLoading || !research) return <LoadingPanel />;

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: t("rd.title"), href: "/rd" }, { label: research.title }]}
        title={research.title}
        subtitle={research.research_question ? `“${research.research_question}”` : undefined}
        actions={
          can("rd.write") ? (
            <>
              <SimpleSelect
                value={research.status}
                onValueChange={async (status) => {
                  await api.patch(`/rd/${researchId}`, { status });
                  refresh();
                }}
                className="w-32"
                options={["active", "paused", "completed"].map((value) => ({
                  value,
                  label: humanize(value),
                }))}
              />
              <Button variant="primary" onClick={() => setExperimentOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                {t("rd.newExperiment")}
              </Button>
            </>
          ) : (
            <StatusBadge status={research.status} />
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Section title={t("rd.hypothesis")}>
              <p className="text-[13px] leading-relaxed text-muted">{research.hypothesis ?? "—"}</p>
            </Section>
            <Section title={t("rd.objectives")}>
              {research.objectives?.length ? (
                <ul className="space-y-1.5">
                  {research.objectives.map((objective) => (
                    <li key={objective} className="flex items-start gap-2 text-[13px]">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                      {objective}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-faint">—</p>
              )}
            </Section>
          </div>

          <Section
            title={`${t("rd.experiments")} (${experiments.data?.length ?? 0})`}
            contentClassName="p-0"
          >
            <ul>
              {(experiments.data ?? []).map((experiment) => (
                <li key={experiment.id} className="border-b border-border/60 last:border-0">
                  <Link
                    href={`/experiments/${experiment.id}`}
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                  >
                    <span className="mt-0.5 font-mono text-[11px] text-faint">
                      #{experiment.number}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">{experiment.name}</p>
                      {experiment.result ? (
                        <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">
                          {experiment.result}
                        </p>
                      ) : null}
                      {Object.keys(experiment.metrics ?? {}).length ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {Object.entries(experiment.metrics).map(([key, value]) => (
                            <Badge key={key}>
                              {key}: {String(value)}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <StatusBadge status={experiment.status} />
                  </Link>
                </li>
              ))}
              {!experiments.data?.length ? (
                <p className="p-4 text-[13px] text-faint">{t("common.empty")}</p>
              ) : null}
            </ul>
          </Section>

          <div className="grid gap-4 sm:grid-cols-2">
            <Section title={t("rd.findings")}>
              <p className="text-[13px] leading-relaxed text-muted">{research.findings ?? "—"}</p>
            </Section>
            <Section title={t("rd.conclusion")}>
              <p className="text-[13px] leading-relaxed text-muted">{research.conclusion ?? "—"}</p>
            </Section>
          </div>

          <Section title={t("common.comments")}>
            <Comments entityType="research" entityId={researchId} />
          </Section>
        </div>

        <aside className="space-y-4">
          <Section title={t("common.details")} contentClassName="p-3">
            <div className="divide-y divide-border/60">
              <DetailRow label={t("common.status")}>
                <StatusBadge status={research.status} />
              </DetailRow>
              <DetailRow label="Lead">
                {research.lead ? (
                  <span className="flex items-center justify-end gap-1.5">
                    <Avatar name={research.lead.full_name} color={research.lead.avatar_color} size={18} />
                    {research.lead.full_name}
                  </span>
                ) : (
                  "—"
                )}
              </DetailRow>
              <DetailRow label={t("common.budget")}>
                {research.budget ? formatCurrency(research.budget, company.currency, locale, true) : "—"}
              </DetailRow>
              <DetailRow label="Start">{formatDate(research.start_date, locale)}</DetailRow>
              <DetailRow label={t("rd.experiments")}>
                {research.experiment_count} ({research.running_experiments} running)
              </DetailRow>
              {research.project_id ? (
                <DetailRow label={t("common.project")}>
                  <Link href={`/projects/${research.project_id}`} className="hover:text-accent">
                    {t("action.open")}
                  </Link>
                </DetailRow>
              ) : null}
              {research.idea_id ? (
                <DetailRow label={t("nav.ideas")}>
                  <Link href={`/ideas/${research.idea_id}`} className="hover:text-accent">
                    {t("action.open")}
                  </Link>
                </DetailRow>
              ) : null}
            </div>
          </Section>

          <Section title={t("rd.methods")} contentClassName="p-3">
            <p className="text-[13px] text-muted">{research.methods ?? "—"}</p>
          </Section>

          <Section title={t("common.related")} contentClassName="p-2">
            <RelatedPanel entityType="research" entityId={researchId} />
          </Section>
        </aside>
      </div>

      <ExperimentDialog
        open={experimentOpen}
        onOpenChange={setExperimentOpen}
        researchId={researchId}
        onDone={refresh}
      />
    </div>
  );
}

export function ExperimentDialog({
  open,
  onOpenChange,
  researchId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  researchId?: string;
  onDone?: () => void;
}) {
  const t = useT();
  const [form, setForm] = React.useState({
    name: "",
    hypothesis: "",
    method: "",
    status: "planned",
    dataset_ref: "",
    researcher_id: null as string | null,
  });

  const create = useCreate<Experiment>("/experiments", {
    invalidate: ["/experiments", "/rd"],
    success: "Experiment created",
    onDone: () => {
      onOpenChange(false);
      onDone?.();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title={t("rd.newExperiment")} />
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({ ...form, research_id: researchId ?? null } as any);
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
          <Field label={t("rd.hypothesis")}>
            <Textarea
              value={form.hypothesis}
              onChange={(event) => setForm({ ...form, hypothesis: event.target.value })}
            />
          </Field>
          <Field label={t("rd.methods")}>
            <Textarea
              value={form.method}
              onChange={(event) => setForm({ ...form, method: event.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("common.status")}>
              <SimpleSelect
                value={form.status}
                onValueChange={(status) => setForm({ ...form, status })}
                options={EXPERIMENT_STATUSES.map((value) => ({ value, label: humanize(value) }))}
              />
            </Field>
            <Field label="Researcher">
              <UserPicker
                value={form.researcher_id}
                onChange={(researcher_id) => setForm({ ...form, researcher_id })}
              />
            </Field>
          </div>
          <Field label={t("rd.dataset")}>
            <Input
              value={form.dataset_ref}
              onChange={(event) => setForm({ ...form, dataset_ref: event.target.value })}
              placeholder="s3://bucket/dataset.parquet"
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

export function ExperimentsView() {
  const t = useT();
  const { locale } = useI18n();
  const { can } = useSession();
  const [createOpen, setCreateOpen] = useCreateParam();
  const [status, setStatus] = React.useState<string | undefined>();
  const [page, setPage] = React.useState(1);

  const list = useList<Experiment>("/experiments", {
    status: status ? [status] : undefined,
    page,
    page_size: 40,
  });

  const columns: Column<Experiment>[] = [
    { key: "number", header: "#", width: "60px", cell: (row) => <span className="font-mono text-[11px] text-faint">#{row.number}</span> },
    { key: "name", header: t("common.name"), cell: (row) => <span className="font-medium">{row.name}</span> },
    {
      key: "research",
      header: t("rd.title"),
      cell: (row) =>
        row.research_id ? (
          <Link href={`/rd/${row.research_id}`} className="text-[12px] text-muted hover:text-accent">
            {row.research_title}
          </Link>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    { key: "status", header: t("common.status"), cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: "metrics",
      header: t("rd.metrics"),
      cell: (row) => (
        <span className="flex flex-wrap gap-1">
          {Object.entries(row.metrics ?? {}).slice(0, 2).map(([key, value]) => (
            <Badge key={key}>
              {key}: {String(value)}
            </Badge>
          ))}
        </span>
      ),
    },
    {
      key: "researcher",
      header: "Researcher",
      cell: (row) =>
        row.researcher ? (
          <span className="flex items-center gap-1.5 text-[12px]">
            <Avatar name={row.researcher.full_name} color={row.researcher.avatar_color} size={18} />
            {row.researcher.full_name}
          </span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key: "ended",
      header: "Ended",
      align: "end",
      cell: (row) => <span className="text-[12px] text-muted">{formatDate(row.ended_at, locale)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("nav.experiments")}
        actions={
          can("rd.write") ? (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("rd.newExperiment")}
            </Button>
          ) : null
        }
      />
      <Toolbar>
        <FilterChips
          value={status}
          onChange={setStatus}
          options={EXPERIMENT_STATUSES.map((value) => ({ value, label: humanize(value) }))}
        />
      </Toolbar>
      <div className="panel overflow-hidden">
        <DataTable
          columns={columns}
          rows={list.data?.items ?? []}
          loading={list.isLoading}
          rowHref={(row) => `/experiments/${row.id}`}
          empty={<EmptyState icon={Atom} title={t("common.empty")} />}
        />
      </div>
      <ExperimentDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

export function ExperimentDetail({ experimentId }: { experimentId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const client = useQueryClient();
  const { can } = useSession();
  const { data: experiment, isLoading } = useItem<Experiment>(`/experiments/${experimentId}`);
  const [result, setResult] = React.useState<string | null>(null);

  if (isLoading || !experiment) return <LoadingPanel />;

  const refresh = () => client.invalidateQueries({ queryKey: [`/experiments/${experimentId}`] });

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { label: t("nav.experiments"), href: "/experiments" },
          { label: `#${experiment.number}` },
        ]}
        title={experiment.name}
        subtitle={
          experiment.research_title ? (
            <Link href={`/rd/${experiment.research_id}`} className="hover:text-accent">
              {experiment.research_title}
            </Link>
          ) : undefined
        }
        actions={
          can("rd.write") ? (
            <SimpleSelect
              value={experiment.status}
              onValueChange={async (status) => {
                await api.patch(`/experiments/${experimentId}`, { status });
                refresh();
              }}
              className="w-36"
              options={EXPERIMENT_STATUSES.map((value) => ({ value, label: humanize(value) }))}
            />
          ) : (
            <StatusBadge status={experiment.status} />
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Section title={t("rd.hypothesis")}>
            <p className="text-[13px] text-muted">{experiment.hypothesis ?? "—"}</p>
          </Section>
          <Section title={t("rd.methods")}>
            <p className="text-[13px] text-muted">{experiment.method ?? "—"}</p>
          </Section>
          <Section
            title={t("rd.result")}
            action={
              can("rd.write") ? (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setResult(result === null ? experiment.result ?? "" : null)}
                >
                  {result === null ? t("action.edit") : t("action.cancel")}
                </Button>
              ) : null
            }
          >
            {result === null ? (
              <p className="text-[13px] text-muted">{experiment.result ?? "—"}</p>
            ) : (
              <div className="space-y-2">
                <Textarea value={result} onChange={(event) => setResult(event.target.value)} />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={async () => {
                      await api.patch(`/experiments/${experimentId}`, { result });
                      setResult(null);
                      refresh();
                    }}
                  >
                    {t("action.save")}
                  </Button>
                </div>
              </div>
            )}
          </Section>
          <Section title={t("common.comments")}>
            <Comments entityType="experiment" entityId={experimentId} />
          </Section>
        </div>

        <aside className="space-y-4">
          <Section title={t("rd.metrics")} contentClassName="p-3">
            {Object.keys(experiment.metrics ?? {}).length ? (
              <ul className="space-y-2">
                {Object.entries(experiment.metrics).map(([key, value]) => (
                  <li key={key}>
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="text-muted">{key}</span>
                      <span className="font-medium">{String(value)}</span>
                    </div>
                    {typeof value === "number" && value <= 1 ? (
                      <Progress value={value * 100} className="mt-1" />
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-faint">—</p>
            )}
          </Section>
          <Section title={t("common.details")} contentClassName="p-3">
            <div className="divide-y divide-border/60">
              <DetailRow label={t("common.status")}>
                <StatusBadge status={experiment.status} />
              </DetailRow>
              <DetailRow label="Researcher">
                {experiment.researcher?.full_name ?? "—"}
              </DetailRow>
              <DetailRow label={t("rd.dataset")}>
                <span className="font-mono text-[11px]">{experiment.dataset_ref ?? "—"}</span>
              </DetailRow>
              <DetailRow label="Started">{formatDate(experiment.started_at, locale)}</DetailRow>
              <DetailRow label="Ended">{formatDate(experiment.ended_at, locale)}</DetailRow>
            </div>
          </Section>
          <Section title={t("common.related")} contentClassName="p-2">
            <RelatedPanel entityType="experiment" entityId={experimentId} />
          </Section>
        </aside>
      </div>
    </div>
  );
}
