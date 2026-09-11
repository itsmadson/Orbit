"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { FlaskConical, FolderKanban, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useI18n, useT } from "@/lib/i18n";
import { useItem } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import type { Idea } from "@/lib/types";
import { PageHeader, Section } from "@/components/shared/page";
import { Comments, DetailRow, LoadingPanel, RelatedPanel } from "@/components/shared/entity";
import { Avatar, Badge, Progress, StatusBadge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/select";
import { ReadOnlyHtml } from "@/components/shared/editor";
import { cn, formatCurrency, formatDate, humanize } from "@/lib/utils";

const STATUSES = [
  "draft", "submitted", "discussion", "evaluation", "approved", "prototype", "rd", "product",
  "rejected", "archived",
];

export function IdeaDetail({ ideaId }: { ideaId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const router = useRouter();
  const client = useQueryClient();
  const { can, company } = useSession();
  const { data: idea, isLoading } = useItem<Idea>(`/ideas/${ideaId}`);

  const refresh = () => {
    client.invalidateQueries({ queryKey: [`/ideas/${ideaId}`] });
    client.invalidateQueries({ queryKey: ["/ideas"] });
  };

  if (isLoading || !idea) return <LoadingPanel />;

  const convert = async (target: "project" | "research") => {
    try {
      const result = await api.post<{ url: string }>(`/ideas/${ideaId}/convert`, { target });
      toast.success(target === "project" ? "Project created" : "R&D project created");
      refresh();
      router.push(result.url);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const scores = [
    { label: t("ideas.businessValue"), value: idea.business_value },
    { label: t("ideas.feasibility"), value: idea.technical_feasibility },
    { label: t("ideas.impact"), value: idea.expected_impact },
    { label: t("ideas.effort"), value: idea.effort },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: t("nav.ideas"), href: "/ideas" }, { label: idea.title }]}
        title={idea.title}
        subtitle={
          <span className="flex items-center gap-2">
            {idea.author ? (
              <>
                <Avatar name={idea.author.full_name} color={idea.author.avatar_color} size={18} />
                {idea.author.full_name}
              </>
            ) : null}
            <span className="text-faint">·</span>
            {formatDate(idea.created_at, locale)}
          </span>
        }
        actions={
          <>
            <Button
              variant="secondary"
              onClick={async () => {
                await api.post(`/ideas/${ideaId}/vote`);
                refresh();
              }}
            >
              <ThumbsUp className={cn("h-3.5 w-3.5", idea.has_voted && "text-accent")} />
              {idea.vote_count}
            </Button>
            {can("ideas.write") ? (
              <>
                <SimpleSelect
                  value={idea.status}
                  onValueChange={async (status) => {
                    await api.patch(`/ideas/${ideaId}`, { status });
                    refresh();
                  }}
                  className="w-36"
                  options={STATUSES.map((value) => ({ value, label: humanize(value) }))}
                />
                <Button variant="primary" onClick={() => convert("project")}>
                  <FolderKanban className="h-3.5 w-3.5" />
                  {t("ideas.convertToProject")}
                </Button>
                <Button variant="secondary" onClick={() => convert("research")}>
                  <FlaskConical className="h-3.5 w-3.5" />
                  {t("ideas.convertToResearch")}
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Section title={t("common.description")}>
            {idea.description ? (
              <ReadOnlyHtml html={idea.description} />
            ) : (
              <p className="text-[13px] text-faint">{t("common.empty")}</p>
            )}
          </Section>
          <Section title={t("common.comments")}>
            <Comments entityType="idea" entityId={idea.id} />
          </Section>
        </div>

        <aside className="space-y-4">
          <Section title={t("ideas.score")} contentClassName="p-3">
            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-[28px] font-semibold leading-none text-accent">
                {Number(idea.score).toFixed(1)}
              </span>
              <span className="text-[11px] text-faint">weighted score</span>
            </div>
            <ul className="space-y-2">
              {scores.map((score) => (
                <li key={score.label}>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                    <span>{score.label}</span>
                    <span>{score.value}/5</span>
                  </div>
                  <Progress value={(score.value / 5) * 100} />
                </li>
              ))}
            </ul>
          </Section>

          <Section title={t("common.details")} contentClassName="p-3">
            <div className="divide-y divide-border/60">
              <DetailRow label={t("common.status")}>
                <StatusBadge status={idea.status} />
              </DetailRow>
              <DetailRow label={t("ideas.estimatedCost")}>
                {idea.estimated_cost
                  ? formatCurrency(idea.estimated_cost, company.currency, locale, true)
                  : "—"}
              </DetailRow>
              <DetailRow label={t("common.tags")}>
                <span className="flex flex-wrap justify-end gap-1">
                  {idea.tags?.length
                    ? idea.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)
                    : "—"}
                </span>
              </DetailRow>
              <DetailRow label="Contributors">
                <span className="flex flex-wrap justify-end gap-1">
                  {idea.contributors?.length
                    ? idea.contributors.map((person) => (
                        <Avatar
                          key={person.id}
                          name={person.full_name}
                          color={person.avatar_color}
                          size={18}
                        />
                      ))
                    : "—"}
                </span>
              </DetailRow>
              {idea.project_id ? (
                <DetailRow label={t("common.project")}>
                  <Link href={`/projects/${idea.project_id}`} className="hover:text-accent">
                    {t("action.open")}
                  </Link>
                </DetailRow>
              ) : null}
            </div>
          </Section>

          <Section title={t("common.related")} contentClassName="p-2">
            <RelatedPanel entityType="idea" entityId={idea.id} />
          </Section>
        </aside>
      </div>
    </div>
  );
}
