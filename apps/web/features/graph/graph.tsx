"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Search, Share2 } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useDebounced } from "@/lib/hooks";
import { PageHeader, Section } from "@/components/shared/page";
import { SearchInput } from "@/components/shared/data";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { ENTITY_ICONS } from "@/components/shared/entity";
import { cn } from "@/lib/utils";

type Node = { type: string; id: string; title: string; url: string; label: string; status?: string | null };
type Graph = { nodes: Node[]; edges: { source: string; target: string; type: string }[] };

/** Force-free radial layout: the root sits in the middle, neighbours fan out by
 *  relationship type. Deterministic, readable and cheap to render. */
export function GraphView() {
  const t = useT();
  const [query, setQuery] = React.useState("");
  const [root, setRoot] = React.useState<Node | null>(null);
  const search = useDebounced(query);

  const results = useQuery({
    queryKey: ["graph-search", search],
    queryFn: () => api.get<{ hits: Node[] }>("/search", { q: search, limit_per_type: 3 }),
    enabled: search.trim().length >= 2,
  });

  const graph = useQuery({
    queryKey: ["graph-explore", root?.type, root?.id],
    queryFn: () =>
      api.get<Graph>("/graph/explore", { entity_type: root!.type, entity_id: root!.id, depth: 2 }),
    enabled: Boolean(root),
  });

  const rootKey = root ? `${root.type}:${root.id}` : "";
  const direct = (graph.data?.edges ?? []).filter(
    (edge) => edge.source === rootKey || edge.target === rootKey,
  );
  const directKeys = new Set(
    direct.map((edge) => (edge.source === rootKey ? edge.target : edge.source)),
  );
  const nodesByKey = new Map((graph.data?.nodes ?? []).map((node) => [`${node.type}:${node.id}`, node]));

  const firstRing = [...directKeys].map((key) => nodesByKey.get(key)).filter(Boolean) as Node[];
  const secondRing = (graph.data?.nodes ?? []).filter(
    (node) => `${node.type}:${node.id}` !== rootKey && !directKeys.has(`${node.type}:${node.id}`),
  );

  return (
    <div>
      <PageHeader
        title={t("nav.graph")}
        icon={<Share2 className="h-5 w-5 text-muted" />}
        subtitle="Every entity in ORBIT is a node; every connection is a typed edge"
      />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-3">
          <Section title={t("action.search")} contentClassName="p-3">
            <SearchInput value={query} onChange={setQuery} placeholder="Find an entity…" />
            <ul className="mt-2 space-y-0.5">
              {(results.data?.hits ?? []).map((hit) => {
                const Icon = ENTITY_ICONS[hit.type] ?? Search;
                const active = root?.id === hit.id;
                return (
                  <li key={`${hit.type}-${hit.id}`}>
                    <button
                      type="button"
                      onClick={() => setRoot(hit)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-[13px] transition-colors",
                        active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{hit.title}</span>
                      <span className="text-[10px] text-faint">{hit.label}</span>
                    </button>
                  </li>
                );
              })}
              {search.length >= 2 && !results.data?.hits.length ? (
                <p className="px-2 py-2 text-[12px] text-faint">{t("common.empty")}</p>
              ) : null}
            </ul>
          </Section>
        </aside>

        <Section contentClassName="p-4">
          {!root ? (
            <EmptyState
              icon={Share2}
              title="Pick an entity to explore"
              description="Search for a project, task, idea, customer or person to see everything connected to it."
            />
          ) : graph.isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-[13px] font-medium text-accent">
                  {root.title}
                </span>
                <span className="text-[11px] text-faint">
                  {graph.data?.nodes.length ?? 0} nodes · {graph.data?.edges.length ?? 0} edges
                </span>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faint">
                  Directly connected
                </p>
                <div className="flex flex-wrap gap-2">
                  {firstRing.map((node) => {
                    const Icon = ENTITY_ICONS[node.type] ?? Search;
                    const edge = direct.find(
                      (item) =>
                        item.source === `${node.type}:${node.id}` ||
                        item.target === `${node.type}:${node.id}`,
                    );
                    return (
                      <Link
                        key={`${node.type}-${node.id}`}
                        href={node.url}
                        className="group flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-2 transition-colors hover:border-accent/40"
                      >
                        <Icon className="h-3.5 w-3.5 text-faint group-hover:text-accent" />
                        <span className="max-w-[220px] truncate text-[13px]">{node.title}</span>
                        <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-faint">
                          {edge?.type.replace(/_/g, " ")}
                        </span>
                      </Link>
                    );
                  })}
                  {!firstRing.length ? (
                    <p className="text-[13px] text-faint">No connections yet</p>
                  ) : null}
                </div>
              </div>

              {secondRing.length ? (
                <div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faint">
                    Two hops away
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {secondRing.map((node) => {
                      const Icon = ENTITY_ICONS[node.type] ?? Search;
                      return (
                        <Link
                          key={`${node.type}-${node.id}`}
                          href={node.url}
                          className="flex items-center gap-1.5 rounded border border-border px-2 py-1 text-[12px] text-muted transition-colors hover:border-accent/40 hover:text-text"
                        >
                          <Icon className="h-3 w-3" />
                          <span className="max-w-[180px] truncate">{node.title}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faint">
                  Edges
                </p>
                <ul className="space-y-1 font-mono text-[11px] text-muted">
                  {(graph.data?.edges ?? []).slice(0, 14).map((edge, index) => {
                    const source = nodesByKey.get(edge.source);
                    const target = nodesByKey.get(edge.target);
                    return (
                      <li key={index} className="truncate">
                        <span className="text-text">{source?.title ?? edge.source}</span>
                        <span className="mx-1.5 text-accent">--{edge.type}--&gt;</span>
                        <span className="text-text">{target?.title ?? edge.target}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
