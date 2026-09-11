"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Lightbulb, Plus, ThumbsUp } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n, useT } from "@/lib/i18n";
import { useCreate, useCreateParam, useDebounced, useItem, useList } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import type { Idea } from "@/lib/types";
import { PageHeader, Section } from "@/components/shared/page";
import { FilterChips, SearchInput, Toolbar } from "@/components/shared/data";
import { Badge, EmptyState, Skeleton, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger, TimeAgo } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { MultiUserPicker, TagInput } from "@/components/shared/pickers";
import { Avatar } from "@/components/ui/misc";
import { cn, formatCurrency, humanize, relativeTime } from "@/lib/utils";

const PIPELINE_ORDER = [
  "draft", "submitted", "discussion", "evaluation", "approved", "prototype", "rd", "product",
];

export function IdeasView() {
  const t = useT();
  const { locale } = useI18n();
  const { can } = useSession();
  const [createOpen, setCreateOpen] = useCreateParam();
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<string | undefined>();
  const [sort, setSort] = React.useState("score");
  const search = useDebounced(query);

  const list = useList<Idea>("/ideas", {
    q: search,
    status: status ? [status] : undefined,
    sort,
    page_size: 60,
  });
  const pipeline = useItem<{ stages: { key: string; label: string; count: number; ideas: Idea[] }[] }>(
    "/ideas/pipeline",
  );

  return (
    <div>
      <PageHeader
        title={t("ideas.title")}
        subtitle="Innovation pipeline — from raw idea to shipped product"
        actions={
          can("ideas.write") ? (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("ideas.new")}
            </Button>
          ) : null
        }
      />

      <Tabs defaultValue="grid">
        <TabsList className="mb-4">
          <TabsTrigger value="grid">{t("projects.list")}</TabsTrigger>
          <TabsTrigger value="pipeline">{t("ideas.pipeline")}</TabsTrigger>
        </TabsList>

        <TabsContent value="grid">
          <Toolbar>
            <SearchInput value={query} onChange={setQuery} className="w-56" />
            <FilterChips
              value={status}
              onChange={setStatus}
              options={PIPELINE_ORDER.map((value) => ({ value, label: humanize(value) }))}
            />
            <SimpleSelect
              value={sort}
              onValueChange={setSort}
              className="ms-auto w-36"
              options={[
                { value: "score", label: t("ideas.score") },
                { value: "votes", label: t("ideas.votes") },
                { value: "recent", label: t("common.created") },
              ]}
            />
          </Toolbar>

          {list.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-44" />
              ))}
            </div>
          ) : !list.data?.items.length ? (
            <EmptyState icon={Lightbulb} title={t("common.empty")} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.data.items.map((idea) => (
                <IdeaCard key={idea.id} idea={idea} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="pipeline">
          <div className="no-scrollbar flex gap-3 overflow-x-auto pb-3">
            {(pipeline.data?.stages ?? [])
              .filter((stage) => PIPELINE_ORDER.includes(stage.key))
              .map((stage) => (
                <div key={stage.key} className="w-[260px] shrink-0">
                  <div className="mb-2 flex items-center gap-2 px-1">
                    <span className="text-[12px] font-medium">{stage.label}</span>
                    <span className="rounded bg-surface-2 px-1.5 text-[10px] text-muted">
                      {stage.count}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {stage.ideas.map((idea) => (
                      <IdeaCard key={idea.id} idea={idea} compact />
                    ))}
                    {!stage.ideas.length ? (
                      <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[11px] text-faint">
                        {t("common.empty")}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
          </div>
        </TabsContent>
      </Tabs>

      <IdeaDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

export function IdeaCard({ idea, compact }: { idea: Idea; compact?: boolean }) {
  const { locale } = useI18n();
  const client = useQueryClient();
  const [voting, setVoting] = React.useState(false);

  const vote = async (event: React.MouseEvent) => {
    event.preventDefault();
    setVoting(true);
    try {
      await api.post(`/ideas/${idea.id}/vote`);
      client.invalidateQueries({ queryKey: ["/ideas"] });
      client.invalidateQueries({ queryKey: ["/ideas/pipeline"] });
      client.invalidateQueries({ queryKey: [`/ideas/${idea.id}`] });
    } finally {
      setVoting(false);
    }
  };

  return (
    <Link
      href={`/ideas/${idea.id}`}
      className="panel block p-3 transition-all hover:-translate-y-px hover:border-border-strong"
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cn("min-w-0 flex-1 font-medium leading-snug", compact ? "text-[13px]" : "text-[14px]")}>
          {idea.title}
        </p>
        <button
          type="button"
          onClick={vote}
          disabled={voting}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] transition-colors",
            idea.has_voted
              ? "border-accent/40 bg-accent-soft text-accent"
              : "border-border bg-surface-2 text-muted hover:text-text",
          )}
        >
          <ThumbsUp className="h-3 w-3" />
          {idea.vote_count}
        </button>
      </div>
      {!compact && idea.description ? (
        <p
          className="mt-1.5 line-clamp-2 text-[12px] text-muted"
          dangerouslySetInnerHTML={{ __html: idea.description }}
        />
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <StatusBadge status={idea.status} />
        <Badge className="border-accent/30 bg-accent-soft text-accent">
          score {Number(idea.score).toFixed(1)}
        </Badge>
        {idea.tags?.slice(0, compact ? 1 : 3).map((tag) => (
          <Badge key={tag}>{tag}</Badge>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-faint">
        {idea.author ? (
          <>
            <Avatar name={idea.author.full_name} color={idea.author.avatar_color} size={16} />
            <span className="truncate">{idea.author.full_name}</span>
          </>
        ) : null}
        <span className="ms-auto">{<TimeAgo value={idea.created_at} />}</span>
      </div>
    </Link>
  );
}

export function IdeaDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const [form, setForm] = React.useState({
    title: "",
    description: "",
    status: "submitted",
    tags: [] as string[],
    business_value: 3,
    technical_feasibility: 3,
    expected_impact: 3,
    effort: 3,
    estimated_cost: "",
    contributor_ids: [] as string[],
  });

  const create = useCreate<Idea>("/ideas", {
    invalidate: ["/ideas", "/ideas/pipeline", "dashboard"],
    success: "Idea submitted",
    onDone: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader
          title={t("ideas.new")}
          description="Ideas are scored on value, feasibility, impact and effort."
        />
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({
              ...form,
              estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : null,
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
          <Field label={t("common.description")}>
            <Textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="What problem does this solve, and for whom?"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["business_value", t("ideas.businessValue")],
                ["technical_feasibility", t("ideas.feasibility")],
                ["expected_impact", t("ideas.impact")],
                ["effort", t("ideas.effort")],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={`${label}: ${form[key]}`}>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={form[key]}
                  onChange={(event) => setForm({ ...form, [key]: Number(event.target.value) })}
                  className="w-full accent-[var(--accent)]"
                />
              </Field>
            ))}
            <Field label={t("ideas.estimatedCost")}>
              <Input
                type="number"
                value={form.estimated_cost}
                onChange={(event) => setForm({ ...form, estimated_cost: event.target.value })}
              />
            </Field>
            <Field label={t("common.status")}>
              <SimpleSelect
                value={form.status}
                onValueChange={(status) => setForm({ ...form, status })}
                options={["draft", "submitted", "discussion"].map((value) => ({
                  value,
                  label: humanize(value),
                }))}
              />
            </Field>
          </div>
          <Field label={t("common.tags")}>
            <TagInput value={form.tags} onChange={(tags) => setForm({ ...form, tags })} />
          </Field>
          <Field label="Contributors">
            <MultiUserPicker
              value={form.contributor_ids}
              onChange={(contributor_ids) => setForm({ ...form, contributor_ids })}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("action.cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              {t("action.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
