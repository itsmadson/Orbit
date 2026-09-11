"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FileText, Folder, History, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n, useT } from "@/lib/i18n";
import { useCreate, useCreateParam, useDebounced, useItem, useList } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import type { Doc } from "@/lib/types";
import { PageHeader, Section } from "@/components/shared/page";
import { Column, DataTable, FilterChips, SearchInput, Toolbar } from "@/components/shared/data";
import { Attachments, Comments, DetailRow, LoadingPanel, RelatedPanel } from "@/components/shared/entity";
import { Avatar, Badge, EmptyState, Skeleton, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { TagInput, useProjects } from "@/components/shared/pickers";
import { RichEditor, ReadOnlyHtml } from "@/components/shared/editor";
import { cn, formatDate, humanize, relativeTime } from "@/lib/utils";

const DOC_TYPES = [
  "documentation", "sop", "research", "technical_design", "meeting_notes", "decision",
  "policy", "specification",
];

type Space = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  icon: string;
  color: string;
  document_count: number;
};

type TreeNode = { id: string; title: string; doc_type: string; children: TreeNode[] };

export function WikiView() {
  const t = useT();
  const { locale } = useI18n();
  const { can } = useSession();
  const [createOpen, setCreateOpen] = useCreateParam();
  const [spaceId, setSpaceId] = React.useState<string | undefined>();
  const [query, setQuery] = React.useState("");
  const search = useDebounced(query);

  const spaces = useItem<Space[]>("/spaces");
  const tree = useItem<TreeNode[]>("/documents/tree", spaceId ? { space_id: spaceId } : undefined);
  const recent = useList<Doc>("/documents", { q: search, space_id: spaceId, page_size: 20 });

  return (
    <div>
      <PageHeader
        title={t("knowledge.title")}
        subtitle="Company knowledge: documentation, SOPs, specs and research"
        actions={
          can("documents.write") ? (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("knowledge.newDocument")}
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-3">
          <Section title={t("knowledge.spaces")} contentClassName="p-2">
            <button
              type="button"
              onClick={() => setSpaceId(undefined)}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-[13px] transition-colors",
                !spaceId ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2",
              )}
            >
              <Folder className="h-3.5 w-3.5" />
              {t("common.all")}
            </button>
            {(spaces.data ?? []).map((space) => (
              <button
                key={space.id}
                type="button"
                onClick={() => setSpaceId(space.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-[13px] transition-colors",
                  spaceId === space.id ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2",
                )}
              >
                <span>{space.icon}</span>
                <span className="min-w-0 flex-1 truncate text-start">{space.name}</span>
                <span className="text-[10px] text-faint">{space.document_count}</span>
              </button>
            ))}
          </Section>
        </aside>

        <div className="space-y-4">
          <Toolbar>
            <SearchInput value={query} onChange={setQuery} className="w-full max-w-sm" />
          </Toolbar>

          {search ? (
            <Section title={t("action.search")} contentClassName="p-0">
              <ul>
                {(recent.data?.items ?? []).map((doc) => (
                  <DocRow key={doc.id} doc={doc} />
                ))}
                {!recent.data?.items.length ? (
                  <p className="p-4 text-[13px] text-faint">{t("common.empty")}</p>
                ) : null}
              </ul>
            </Section>
          ) : (
            <>
              <Section title="Pages" contentClassName="p-2">
                {tree.isLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : tree.data?.length ? (
                  <Tree nodes={tree.data} />
                ) : (
                  <EmptyState icon={FileText} title={t("common.empty")} />
                )}
              </Section>
              <Section title={t("common.updated")} contentClassName="p-0">
                <ul>
                  {(recent.data?.items ?? []).slice(0, 8).map((doc) => (
                    <DocRow key={doc.id} doc={doc} />
                  ))}
                </ul>
              </Section>
            </>
          )}
        </div>
      </div>

      <DocumentDialog open={createOpen} onOpenChange={setCreateOpen} spaceId={spaceId} />
    </div>
  );
}

function DocRow({ doc }: { doc: Doc }) {
  const { locale } = useI18n();
  return (
    <li className="border-b border-border/60 last:border-0">
      <Link
        href={`/documents/${doc.id}`}
        className="flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-surface-2"
      >
        <FileText className="h-3.5 w-3.5 shrink-0 text-faint" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px]">{doc.title}</p>
          {doc.excerpt ? <p className="truncate text-[11px] text-faint">{doc.excerpt}</p> : null}
        </div>
        <Badge>{humanize(doc.doc_type)}</Badge>
        <span className="hidden shrink-0 text-[11px] text-faint sm:block">
          {relativeTime(doc.updated_at, locale)}
        </span>
      </Link>
    </li>
  );
}

function Tree({ nodes, depth = 0 }: { nodes: TreeNode[]; depth?: number }) {
  return (
    <ul>
      {nodes.map((node) => (
        <li key={node.id}>
          <Link
            href={`/documents/${node.id}`}
            className="flex items-center gap-1.5 rounded px-2 py-1.5 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-text"
            style={{ paddingInlineStart: 8 + depth * 14 }}
          >
            {node.children.length ? (
              <ChevronRight className="h-3 w-3 text-faint rtl:rotate-180" />
            ) : (
              <FileText className="h-3 w-3 text-faint" />
            )}
            <span className="truncate">{node.title}</span>
          </Link>
          {node.children.length ? <Tree nodes={node.children} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
  );
}

export function DocumentsView() {
  const t = useT();
  const { locale } = useI18n();
  const { can } = useSession();
  const [createOpen, setCreateOpen] = useCreateParam();
  const [query, setQuery] = React.useState("");
  const [docType, setDocType] = React.useState<string | undefined>();
  const [page, setPage] = React.useState(1);
  const search = useDebounced(query);

  const list = useList<Doc>("/documents", {
    q: search,
    doc_type: docType ? [docType] : undefined,
    page,
    page_size: 40,
  });

  const columns: Column<Doc>[] = [
    {
      key: "title",
      header: t("common.title"),
      cell: (row) => (
        <span className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-faint" />
          <span className="truncate font-medium">{row.title}</span>
        </span>
      ),
    },
    { key: "type", header: t("common.type"), cell: (row) => <Badge>{humanize(row.doc_type)}</Badge> },
    { key: "status", header: t("common.status"), cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: "author",
      header: "Author",
      cell: (row) =>
        row.author ? (
          <span className="flex items-center gap-1.5 text-[12px]">
            <Avatar name={row.author.full_name} color={row.author.avatar_color} size={18} />
            {row.author.full_name}
          </span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    { key: "version", header: "v", align: "center", cell: (row) => <span className="text-[12px] text-muted">{row.version}</span> },
    {
      key: "updated",
      header: t("common.updated"),
      align: "end",
      cell: (row) => <span className="text-[12px] text-muted">{formatDate(row.updated_at, locale)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("nav.documents")}
        actions={
          can("documents.write") ? (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("knowledge.newDocument")}
            </Button>
          ) : null
        }
      />
      <Toolbar>
        <SearchInput value={query} onChange={setQuery} className="w-56" />
        <FilterChips
          value={docType}
          onChange={setDocType}
          options={DOC_TYPES.map((value) => ({ value, label: humanize(value) }))}
        />
      </Toolbar>
      <div className="panel overflow-hidden">
        <DataTable
          columns={columns}
          rows={list.data?.items ?? []}
          loading={list.isLoading}
          rowHref={(row) => `/documents/${row.id}`}
          empty={<EmptyState icon={FileText} title={t("common.empty")} />}
        />
      </div>
      <DocumentDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

export function DocumentDialog({
  open,
  onOpenChange,
  spaceId,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId?: string;
  projectId?: string;
}) {
  const t = useT();
  const router = useRouter();
  const spaces = useItem<Space[]>("/spaces");
  const projects = useProjects();
  const [form, setForm] = React.useState({
    title: "",
    doc_type: "documentation",
    space_id: spaceId ?? "",
    project_id: projectId ?? "",
    status: "draft",
    tags: [] as string[],
    content: "",
  });

  const create = useCreate<Doc>("/documents", {
    invalidate: ["/documents", "/documents/tree", "/spaces"],
    success: "Document created",
    onDone: (doc) => {
      onOpenChange(false);
      router.push(`/documents/${doc.id}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader title={t("knowledge.newDocument")} />
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({
              ...form,
              space_id: form.space_id || null,
              project_id: form.project_id || null,
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
            <Field label={t("knowledge.docType")}>
              <SimpleSelect
                value={form.doc_type}
                onValueChange={(doc_type) => setForm({ ...form, doc_type })}
                options={DOC_TYPES.map((value) => ({ value, label: humanize(value) }))}
              />
            </Field>
            <Field label={t("knowledge.spaces")}>
              <SimpleSelect
                value={form.space_id}
                onValueChange={(space_id) => setForm({ ...form, space_id })}
                placeholder={t("common.none")}
                options={(spaces.data ?? []).map((space) => ({
                  value: space.id,
                  label: `${space.icon} ${space.name}`,
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
                  label: `${project.icon} ${project.name}`,
                }))}
              />
            </Field>
            <Field label={t("common.tags")}>
              <TagInput value={form.tags} onChange={(tags) => setForm({ ...form, tags })} />
            </Field>
          </div>
          <Field label="Content">
            <RichEditor
              content={form.content}
              onChange={(content) => setForm({ ...form, content })}
              minHeight="180px"
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

export function DocumentDetail({ documentId }: { documentId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const client = useQueryClient();
  const { can } = useSession();
  const canWrite = can("documents.write");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [title, setTitle] = React.useState("");

  const { data: doc, isLoading } = useItem<Doc>(`/documents/${documentId}`);
  const versions = useItem<any[]>(`/documents/${documentId}/versions`);

  React.useEffect(() => {
    if (doc && !editing) {
      setDraft(doc.content ?? "");
      setTitle(doc.title);
    }
  }, [doc, editing]);

  if (isLoading || !doc) return <LoadingPanel />;

  const save = async () => {
    await api.patch(`/documents/${documentId}`, { title, content: draft });
    client.invalidateQueries({ queryKey: [`/documents/${documentId}`] });
    client.invalidateQueries({ queryKey: [`/documents/${documentId}/versions`] });
    client.invalidateQueries({ queryKey: ["/documents"] });
    setEditing(false);
  };

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { label: t("knowledge.title"), href: "/wiki" },
          ...(doc.space_name ? [{ label: doc.space_name }] : []),
          ...(doc.breadcrumb ?? []).map((crumb) => ({
            label: crumb.title,
            href: `/documents/${crumb.id}`,
          })),
          { label: doc.title },
        ]}
        title={
          editing ? (
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-9 text-[18px]"
            />
          ) : (
            doc.title
          )
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2 text-[12px]">
            <Badge>{humanize(doc.doc_type)}</Badge>
            <StatusBadge status={doc.status} />
            <span className="text-faint">v{doc.version}</span>
            {doc.author ? <span>· {doc.author.full_name}</span> : null}
            <span className="text-faint">· {formatDate(doc.updated_at, locale, true)}</span>
          </span>
        }
        actions={
          canWrite ? (
            editing ? (
              <>
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  {t("action.cancel")}
                </Button>
                <Button variant="primary" onClick={save}>
                  {t("action.save")}
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                {t("action.edit")}
              </Button>
            )
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <Section contentClassName="p-5">
            {editing ? (
              <RichEditor content={draft} onChange={setDraft} minHeight="420px" />
            ) : doc.content ? (
              <ReadOnlyHtml html={doc.content} />
            ) : (
              <p className="text-[13px] text-faint">{t("common.empty")}</p>
            )}
          </Section>

          <Tabs defaultValue="comments">
            <TabsList className="mb-3">
              <TabsTrigger value="comments">{t("common.comments")}</TabsTrigger>
              <TabsTrigger value="attachments">{t("common.attachments")}</TabsTrigger>
              <TabsTrigger value="versions" count={versions.data?.length}>
                {t("knowledge.versions")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="comments">
              <Comments entityType="document" entityId={documentId} />
            </TabsContent>
            <TabsContent value="attachments">
              <Attachments entityType="document" entityId={documentId} />
            </TabsContent>
            <TabsContent value="versions">
              <ul className="space-y-2">
                {(versions.data ?? []).map((version) => (
                  <li key={version.id} className="flex items-center gap-2.5 text-[13px]">
                    <History className="h-3.5 w-3.5 text-faint" />
                    <span className="font-mono text-[11px] text-muted">v{version.version}</span>
                    <span className="flex-1 truncate">{version.change_note}</span>
                    <span className="text-[11px] text-faint">
                      {version.author?.full_name} · {relativeTime(version.created_at, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            </TabsContent>
          </Tabs>
        </div>

        <aside className="space-y-4">
          <Section title={t("common.details")} contentClassName="p-3">
            <div className="divide-y divide-border/60">
              <DetailRow label={t("knowledge.docType")}>{humanize(doc.doc_type)}</DetailRow>
              <DetailRow label={t("common.status")}>
                <StatusBadge status={doc.status} />
              </DetailRow>
              <DetailRow label={t("common.tags")}>
                <span className="flex flex-wrap justify-end gap-1">
                  {doc.tags?.length ? doc.tags.map((tag) => <Badge key={tag}>{tag}</Badge>) : "—"}
                </span>
              </DetailRow>
              {doc.project_id ? (
                <DetailRow label={t("common.project")}>
                  <Link href={`/projects/${doc.project_id}`} className="hover:text-accent">
                    {t("action.open")}
                  </Link>
                </DetailRow>
              ) : null}
              <DetailRow label={t("common.created")}>{formatDate(doc.created_at, locale)}</DetailRow>
            </div>
          </Section>
          <Section title={t("common.related")} contentClassName="p-2">
            <RelatedPanel entityType="document" entityId={documentId} />
          </Section>
        </aside>
      </div>
    </div>
  );
}
