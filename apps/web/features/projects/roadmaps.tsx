"use client";

import * as React from "react";
import Link from "next/link";
import { Map as MapIcon, Target } from "lucide-react";
import { useI18n, useT } from "@/lib/i18n";
import { useList } from "@/lib/hooks";
import type { ProjectSummary } from "@/lib/types";
import { PageHeader, Section } from "@/components/shared/page";
import { EmptyState, Progress, Skeleton, StatusBadge } from "@/components/ui/misc";
import { cn, formatDate, isOverdue } from "@/lib/utils";

type ProjectWithMilestones = ProjectSummary & {
  milestones?: { id: string; name: string; due_date?: string | null; status: string; progress: number }[];
};

/** Cross-project roadmap: quarters across the top, projects and milestones below. */
export function RoadmapsView() {
  const t = useT();
  const { locale } = useI18n();
  const { data, isLoading } = useList<ProjectWithMilestones>("/projects", {
    status: "active",
    page_size: 50,
  });

  const projects = data?.items ?? [];
  const dates = projects.flatMap((project) =>
    [project.start_date, project.end_date].filter(Boolean),
  ) as string[];

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!projects.length) return <EmptyState icon={MapIcon} title={t("common.empty")} />;

  const times = dates.map((date) => new Date(date).getTime());
  const min = Math.min(...times, Date.now() - 86400000 * 30);
  const max = Math.max(...times, Date.now() + 86400000 * 60);
  const span = max - min;
  const percent = (value: number) => ((value - min) / span) * 100;
  const todayPercent = percent(Date.now());

  const quarters: { label: string; at: number }[] = [];
  const cursor = new Date(min);
  cursor.setDate(1);
  cursor.setMonth(Math.floor(cursor.getMonth() / 3) * 3);
  while (cursor.getTime() < max) {
    quarters.push({
      label: `Q${Math.floor(cursor.getMonth() / 3) + 1} ${cursor.getFullYear()}`,
      at: percent(cursor.getTime()),
    });
    cursor.setMonth(cursor.getMonth() + 3);
  }

  return (
    <div>
      <PageHeader
        title={t("nav.roadmaps")}
        icon={<MapIcon className="h-5 w-5 text-muted" />}
        subtitle="Every active project on one timeline, with its milestones"
      />

      <Section contentClassName="p-4">
        <div className="relative mb-3 h-5 border-b border-border">
          {quarters.map((quarter) => (
            <span
              key={quarter.label}
              className="absolute text-[10px] uppercase tracking-wide text-faint"
              style={{ insetInlineStart: `${Math.max(0, quarter.at)}%` }}
            >
              {quarter.label}
            </span>
          ))}
        </div>

        <div className="relative space-y-3">
          {todayPercent >= 0 && todayPercent <= 100 ? (
            <div
              className="pointer-events-none absolute inset-y-0 z-10 w-px bg-accent/50"
              style={{ insetInlineStart: `${todayPercent}%` }}
            />
          ) : null}

          {projects.map((project) => {
            const start = project.start_date ? percent(new Date(project.start_date).getTime()) : 0;
            const end = project.end_date ? percent(new Date(project.end_date).getTime()) : 100;
            const width = Math.max(4, end - start);
            return (
              <div key={project.id}>
                <div className="mb-1 flex items-center gap-2">
                  <Link
                    href={`/projects/${project.id}`}
                    className="flex items-center gap-1.5 text-[13px] font-medium hover:text-accent"
                  >
                    <span>{project.icon}</span>
                    {project.name}
                  </Link>
                  <StatusBadge status={project.health} />
                  <span className="ms-auto text-[11px] text-muted">
                    {formatDate(project.start_date, locale)} → {formatDate(project.end_date, locale)}
                  </span>
                </div>
                <div className="relative h-7 rounded bg-surface-2">
                  <div
                    className="absolute top-1 h-5 rounded"
                    style={{
                      insetInlineStart: `${Math.max(0, start)}%`,
                      width: `${width}%`,
                      background: `color-mix(in oklab, ${project.color} 35%, transparent)`,
                      border: `1px solid color-mix(in oklab, ${project.color} 60%, transparent)`,
                    }}
                  >
                    <div
                      className="h-full rounded-s"
                      style={{ width: `${project.progress}%`, background: project.color, opacity: 0.55 }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
