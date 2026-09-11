"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Gavel, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n, useT } from "@/lib/i18n";
import { useCreate, useCreateParam, useDebounced, useItem, useList } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import type { Decision } from "@/lib/types";
import { PageHeader, Section } from "@/components/shared/page";
import { FilterChips, SearchInput, Toolbar } from "@/components/shared/data";
import { Comments, DetailRow, LoadingPanel, RelatedPanel } from "@/components/shared/entity";
import { Avatar, Badge, EmptyState, Skeleton, StatusBadge, TimeAgo } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { MultiUserPicker, useProjects } from "@/components/shared/pickers";
import { cn, formatDate, humanize } from "@/lib/utils";

const STATUSES = ["proposed", "discussion", "decided", "revisited", "archived"];

export function DecisionsView() {
  const t = useT();
  const { locale } = useI18n();
  const { can } = useSession();
  const [createOpen, setCreateOpen] = useCreateParam();
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<string | undefined>();
  const search = useDebounced(query);

  const list = useList<Decision>("/decisions", {
    q: search,
    status: status ? [status] : undefined,
    page_size: 40,
  });

  return (
    <div>
      <PageHeader
        title={t("decisions.title")}
        subtitle="Institutional memory: what was decided, why, and what followed"
        actions={
          can("decisions.write") ? (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("decisions.new")}
            </Button>
          ) : null
        }
      />

      <Toolbar>
        <SearchInput value={query} onChange={setQuery} className="w-56" />
        <FilterChips
          value={status}
          onChange={setStatus}
          options={STATUSES.map((value) => ({ value, label: humanize(value) }))}
        />
      </Toolbar>

      {list.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      ) : !list.data?.items.length ? (
        <EmptyState icon={Gavel} title={t("common.empty")} />
      ) : (
        <div className="space-y-3">
          {list.data.items.map((decision) => (
            <Link
              key={decision.id}
              href={`/decisions/${decision.id}`}
              className="panel block p-4 transition-all hover:-translate-y-px hover:border-border-strong"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium leading-snug">{decision.title}</p>
                  {decision.problem ? (
                    <p className="mt-1 line-clamp-2 text-[12px] text-muted">{decision.problem}</p>
                  ) : null}
                </div>
                <StatusBadge status={decision.status} />
              </div>
              {decision.decision ? (
                <p className="mt-2 border-s-2 border-accent/40 ps-2.5 text-[13px] leading-relaxed">
                  {decision.decision}
                </p>
              ) : null}
              <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11px] text-muted">
                {decision.decided_by ? (
                  <span className="flex items-center gap-1.5">
                    <Avatar
                      name={decision.decided_by.full_name}
                      color={decision.decided_by.avatar_color}
                      size={16}
                    />
                    {decision.decided_by.full_name}
                  </span>
                ) : null}
                {decision.project_name ? <Badge>{decision.project_name}</Badge> : null}
                <span className="ms-auto">
                  {decision.decided_at ? (
                    formatDate(decision.decided_at, locale)
                  ) : (
                    <TimeAgo value={decision.created_at} />
                  )}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <DecisionDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

export function DecisionDialog({
  open,
  onOpenChange,
  meetingId,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId?: string;
  projectId?: string;
}) {
  const t = useT();
  const projects = useProjects();
  const [form, setForm] = React.useState({
    title: "",
    problem: "",
    context: "",
    decision: "",
    reason: "",
    consequences: "",
    status: "proposed",
    project_id: projectId ?? "",
    participants: [] as string[],
  });
  const [options, setOptions] = React.useState<{ title: string; pros: string; cons: string; chosen: boolean }[]>([
    { title: "", pros: "", cons: "", chosen: false },
  ]);

  const create = useCreate<Decision>("/decisions", {
    invalidate: ["/decisions", "dashboard"],
    success: "Decision recorded",
    onDone: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader
          title={t("decisions.new")}
          description="Capture the problem, the options considered and the reasoning."
        />
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({
              ...form,
              project_id: form.project_id || null,
              meeting_id: meetingId ?? null,
              options: options.filter((option) => option.title.trim()),
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
            <Field label={t("decisions.problem")}>
              <Textarea
                value={form.problem}
                onChange={(event) => setForm({ ...form, problem: event.target.value })}
              />
            </Field>
            <Field label={t("decisions.context")}>
              <Textarea
                value={form.context}
                onChange={(event) => setForm({ ...form, context: event.target.value })}
              />
            </Field>
          </div>

          <Field label={t("decisions.options")}>
            <div className="space-y-2">
              {options.map((option, index) => (
                <div key={index} className="rounded-md border border-border bg-surface-2 p-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={option.title}
                      placeholder={`Option ${index + 1}`}
                      onChange={(event) => {
                        const next = [...options];
                        next[index] = { ...option, title: event.target.value };
                        setOptions(next);
                      }}
                    />
                    <button
                      type="button"
                      title="Chosen"
                      onClick={() => {
                        setOptions(
                          options.map((item, cursor) => ({ ...item, chosen: cursor === index })),
                        );
                      }}
                      className={cn(
                        "rounded border px-2 py-1.5",
                        option.chosen
                          ? "border-positive/40 bg-positive/10 text-positive"
                          : "border-border text-faint",
                      )}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setOptions(options.filter((_, cursor) => cursor !== index))}
                      className="rounded border border-border px-2 py-1.5 text-faint hover:text-danger"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Input
                      value={option.pros}
                      placeholder="Pros"
                      onChange={(event) => {
                        const next = [...options];
                        next[index] = { ...option, pros: event.target.value };
                        setOptions(next);
                      }}
                    />
                    <Input
                      value={option.cons}
                      placeholder="Cons"
                      onChange={(event) => {
                        const next = [...options];
                        next[index] = { ...option, cons: event.target.value };
                        setOptions(next);
                      }}
                    />
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setOptions([...options, { title: "", pros: "", cons: "", chosen: false }])}
              >
                <Plus className="h-3.5 w-3.5" />
                {t("action.add")}
              </Button>
            </div>
          </Field>

          <Field label={t("decisions.decision")}>
            <Textarea
              value={form.decision}
              onChange={(event) => setForm({ ...form, decision: event.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("decisions.reason")}>
              <Textarea
                value={form.reason}
                onChange={(event) => setForm({ ...form, reason: event.target.value })}
              />
            </Field>
            <Field label={t("decisions.consequences")}>
              <Textarea
                value={form.consequences}
                onChange={(event) => setForm({ ...form, consequences: event.target.value })}
              />
            </Field>
            <Field label={t("common.status")}>
              <SimpleSelect
                value={form.status}
                onValueChange={(status) => setForm({ ...form, status })}
                options={STATUSES.map((value) => ({ value, label: humanize(value) }))}
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
          </div>
          <Field label={t("decisions.participants")}>
            <MultiUserPicker
              value={form.participants}
              onChange={(participants) => setForm({ ...form, participants })}
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

export function DecisionDetail({ decisionId }: { decisionId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const client = useQueryClient();
  const { can } = useSession();
  const { data: decision, isLoading } = useItem<Decision>(`/decisions/${decisionId}`);

  if (isLoading || !decision) return <LoadingPanel />;

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: t("decisions.title"), href: "/decisions" }, { label: decision.title }]}
        icon={<Gavel className="h-5 w-5 text-muted" />}
        title={decision.title}
        subtitle={
          decision.decided_at
            ? `${t("decisions.decidedBy")}: ${decision.decided_by?.full_name ?? "—"} · ${formatDate(decision.decided_at, locale)}`
            : undefined
        }
        actions={
          can("decisions.write") ? (
            <SimpleSelect
              value={decision.status}
              onValueChange={async (status) => {
                await api.patch(`/decisions/${decisionId}`, { status });
                client.invalidateQueries({ queryKey: [`/decisions/${decisionId}`] });
                client.invalidateQueries({ queryKey: ["/decisions"] });
              }}
              className="w-36"
              options={STATUSES.map((value) => ({ value, label: humanize(value) }))}
            />
          ) : (
            <StatusBadge status={decision.status} />
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_290px]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Section title={t("decisions.problem")}>
              <p className="text-[13px] leading-relaxed text-muted">{decision.problem ?? "—"}</p>
            </Section>
            <Section title={t("decisions.context")}>
              <p className="text-[13px] leading-relaxed text-muted">{decision.context ?? "—"}</p>
            </Section>
          </div>

          <Section title={t("decisions.options")} contentClassName="p-3">
            {decision.options?.length ? (
              <ul className="space-y-2">
                {decision.options.map((option, index) => (
                  <li
                    key={index}
                    className={cn(
                      "rounded-lg border p-3",
                      option.chosen
                        ? "border-positive/40 bg-positive/[0.06]"
                        : "border-border bg-surface-2",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium">{option.title}</span>
                      {option.chosen ? (
                        <Badge className="border-positive/30 bg-positive/10 text-positive">
                          chosen
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-1.5 grid gap-1 text-[12px] sm:grid-cols-2">
                      {option.pros ? (
                        <p className="text-muted">
                          <span className="text-positive">+</span> {option.pros}
                        </p>
                      ) : null}
                      {option.cons ? (
                        <p className="text-muted">
                          <span className="text-danger">−</span> {option.cons}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-faint">—</p>
            )}
          </Section>

          <Section title={t("decisions.decision")}>
            <p className="text-[14px] font-medium leading-relaxed">{decision.decision ?? "—"}</p>
            {decision.reason ? (
              <p className="mt-3 text-[13px] leading-relaxed text-muted">
                <span className="text-faint">{t("decisions.reason")}: </span>
                {decision.reason}
              </p>
            ) : null}
            {decision.consequences ? (
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                <span className="text-faint">{t("decisions.consequences")}: </span>
                {decision.consequences}
              </p>
            ) : null}
          </Section>

          <Section title={t("common.comments")}>
            <Comments entityType="decision" entityId={decisionId} />
          </Section>
        </div>

        <aside className="space-y-4">
          <Section title={t("common.details")} contentClassName="p-3">
            <div className="divide-y divide-border/60">
              <DetailRow label={t("common.status")}>
                <StatusBadge status={decision.status} />
              </DetailRow>
              <DetailRow label={t("decisions.decidedBy")}>
                {decision.decided_by?.full_name ?? "—"}
              </DetailRow>
              <DetailRow label={t("common.date")}>
                {formatDate(decision.decided_at ?? decision.created_at, locale)}
              </DetailRow>
              {decision.project_id ? (
                <DetailRow label={t("common.project")}>
                  <Link href={`/projects/${decision.project_id}`} className="hover:text-accent">
                    {decision.project_name}
                  </Link>
                </DetailRow>
              ) : null}
              {decision.meeting_id ? (
                <DetailRow label={t("meetings.title")}>
                  <Link href={`/meetings/${decision.meeting_id}`} className="hover:text-accent">
                    {t("action.open")}
                  </Link>
                </DetailRow>
              ) : null}
            </div>
          </Section>

          <Section title={t("decisions.participants")} contentClassName="p-3">
            {decision.participant_refs?.length ? (
              <ul className="space-y-2">
                {decision.participant_refs.map((person) => (
                  <li key={person.id} className="flex items-center gap-2 text-[13px]">
                    <Avatar name={person.full_name} color={person.avatar_color} size={20} />
                    {person.full_name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-faint">—</p>
            )}
          </Section>

          <Section title={t("common.related")} contentClassName="p-2">
            <RelatedPanel entityType="decision" entityId={decisionId} />
          </Section>
        </aside>
      </div>
    </div>
  );
}
