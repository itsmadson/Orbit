"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Atom, Banknote, Building2, Calendar, CheckSquare, ClipboardList, Download, FileSignature,
  FileText, FolderKanban, Gavel, Handshake, Laptop, Lightbulb, Link2, Loader2, Paperclip,
  Receipt, Sparkles, Target, Trash2, User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { OrbitLoading } from "@/components/ui/orbit-loader";
import { useConfirm } from "@/components/ui/confirm";
import { CommentBody, MentionInput } from "@/components/shared/mention-input";
import { cn, formatDate, relativeTime, formatBytes } from "@/lib/utils";
import { Avatar, EmptyState, Skeleton, StatusBadge, TimeAgo } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useSession } from "@/components/providers";

export const ENTITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  project: FolderKanban,
  task: CheckSquare,
  idea: Lightbulb,
  research: Atom,
  experiment: Atom,
  document: FileText,
  decision: Gavel,
  meeting: Calendar,
  crm_company: Building2,
  deal: Handshake,
  contract: FileSignature,
  invoice: Receipt,
  transaction: Banknote,
  asset: Laptop,
  goal: Target,
  request: ClipboardList,
  brainstorm_board: Sparkles,
  user: UserIcon,
};

type Comment = {
  id: string;
  body: string;
  created_at: string;
  author?: { id: string; full_name: string; avatar_color?: string | null } | null;
};

export function Comments({ entityType, entityId }: { entityType: string; entityId: string }) {
  const t = useT();
  const client = useQueryClient();
  const [body, setBody] = React.useState("");
  const [mentions, setMentions] = React.useState<string[]>([]);
  const key = ["comments", entityType, entityId];

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => api.get<Comment[]>("/comments", { entity_type: entityType, entity_id: entityId }),
  });

  const create = useMutation({
    mutationFn: (text: string) =>
      api.post<Comment>("/comments", { body: text, mentions }, {
        entity_type: entityType,
        entity_id: entityId,
      }),
    onSuccess: () => {
      setBody("");
      setMentions([]);
      client.invalidateQueries({ queryKey: key });
      // A mention becomes someone's notification, so the badge should move now.
      client.invalidateQueries({ queryKey: ["inbox-counts"] });
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <div className="space-y-3">
      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((comment) => (
            <div key={comment.id} className="flex gap-2.5">
              <Avatar
                name={comment.author?.full_name}
                color={comment.author?.avatar_color}
                size={26}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-medium">
                    {comment.author?.full_name ?? "Unknown"}
                  </span>
                  <span className="text-[11px] text-faint">{<TimeAgo value={comment.created_at} />}</span>
                </div>
                <CommentBody body={comment.body} className="text-[13px] text-muted" />
              </div>
            </div>
          ))}
          {!data?.length ? (
            <p className="text-[13px] text-faint">{t("common.empty")}</p>
          ) : null}
        </div>
      )}
      <div className="space-y-2">
        <MentionInput
          value={body}
          onChange={setBody}
          onMentionsChange={setMentions}
          onSubmit={() => body.trim() && create.mutate(body)}
          placeholder={`${t("action.comment")}…`}
        />
        <div className="flex items-center justify-end gap-2">
          {mentions.length ? (
            <span className="me-auto text-[11px] text-accent">
              {t("comments.willNotify").replace("{count}", String(mentions.length))}
            </span>
          ) : null}
          <Button
            size="sm"
            variant="primary"
            disabled={!body.trim()}
            loading={create.isPending}
            onClick={() => create.mutate(body)}
          >
            {t("action.send")}
          </Button>
        </div>
      </div>
    </div>
  );
}

type Attachment = {
  id: string;
  filename: string;
  size: number;
  content_type: string;
  created_at: string;
  uploaded_by?: { full_name: string } | null;
};

export function Attachments({
  entityType,
  entityId,
  canDelete = true,
}: {
  entityType: string;
  entityId: string;
  /** Off where someone may add files but not remove other people's. */
  canDelete?: boolean;
}) {
  const t = useT();
  const client = useQueryClient();
  const confirm = useConfirm();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const key = ["attachments", entityType, entityId];

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () =>
      api.get<Attachment[]>("/attachments", { entity_type: entityType, entity_id: entityId }),
  });

  const upload = useMutation({
    mutationFn: (file: File) =>
      api.upload<Attachment>("/attachments", file, {
        entity_type: entityType,
        entity_id: entityId,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
    onError: (error: any) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/attachments/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
    onError: (error: any) => toast.error(error.message),
  });

  /** Upload one by one so a failure names the file that failed. */
  const send = (files: FileList | File[]) => {
    for (const file of Array.from(files)) upload.mutate(file);
  };

  async function confirmRemove(attachment: Attachment) {
    const ok = await confirm({
      title: t("attachments.delete"),
      body: attachment.filename,
      confirmLabel: t("action.delete"),
      destructive: true,
    });
    if (ok) remove.mutate(attachment.id);
  }

  return (
    <div
      className={cn(
        "space-y-2 rounded-xl border border-dashed p-2 transition-colors",
        dragging ? "border-accent/60 bg-accent-soft" : "border-transparent",
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (event.dataTransfer.files?.length) send(event.dataTransfer.files);
      }}
    >
      {isLoading ? <Skeleton className="h-10 w-full" /> : null}

      {(data ?? []).map((attachment) => (
        <div
          key={attachment.id}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5"
        >
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-faint" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px]" title={attachment.filename}>
              {attachment.filename}
            </p>
            <p className="text-[11px] text-faint">
              {formatBytes(attachment.size)} · {attachment.uploaded_by?.full_name ?? "—"}
            </p>
          </div>
          <a
            href={`/api/orbit/attachments/${attachment.id}/download`}
            className="rounded-lg p-1 text-faint transition-colors hover:bg-surface hover:text-text"
            title={t("action.download")}
          >
            <Download className="h-3.5 w-3.5" />
          </a>
          {canDelete ? (
            <button
              type="button"
              onClick={() => confirmRemove(attachment)}
              className="rounded-lg p-1 text-faint transition-colors hover:bg-surface hover:text-danger"
              title={t("action.delete")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ))}

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) send(event.target.files);
          event.target.value = "";
        }}
      />
      <Button
        variant="secondary"
        size="sm"
        className="w-full"
        loading={upload.isPending}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip className="h-3.5 w-3.5" />
        {t("attachments.add")}
      </Button>
      <p className="text-center text-[11px] text-faint">{t("attachments.dropHint")}</p>
    </div>
  );
}

type Relation = {
  relation_id: string;
  rel_type: string;
  direction: "in" | "out";
  node: { type: string; id: string; title: string; url: string; label: string; status?: string | null };
};

export function RelatedPanel({
  entityType,
  entityId,
  className,
}: {
  entityType: string;
  entityId: string;
  className?: string;
}) {
  const t = useT();
  const { data, isLoading } = useQuery({
    queryKey: ["relations", entityType, entityId],
    queryFn: () =>
      api.get<Relation[]>("/graph/relations", { entity_type: entityType, entity_id: entityId }),
  });

  if (isLoading) return <Skeleton className={cn("h-24 w-full", className)} />;
  if (!data?.length) {
    return <p className={cn("text-[13px] text-faint", className)}>{t("common.empty")}</p>;
  }

  return (
    <div className={cn("space-y-1", className)}>
      {data.map((relation) => {
        const Icon = ENTITY_ICONS[relation.node.type] ?? Link2;
        return (
          <Link
            key={relation.relation_id}
            href={relation.node.url}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-2"
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-faint" />
            <span className="min-w-0 flex-1 truncate text-[13px]">{relation.node.title}</span>
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-faint">
              {relation.rel_type.replace(/_/g, " ")}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

type Activity = {
  id: string;
  action: string;
  summary?: string | null;
  created_at: string;
  entity_type: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  actor?: { full_name: string; avatar_color?: string | null } | null;
};

export function ActivityFeed({ items, compact }: { items: Activity[]; compact?: boolean }) {
  const t = useT();
  if (!items.length) return <p className="text-[13px] text-faint">{t("common.empty")}</p>;
  return (
    <ol className="space-y-2.5">
      {items.map((item) => (
        <li key={item.id} className="flex gap-2.5">
          <Avatar name={item.actor?.full_name} color={item.actor?.avatar_color} size={22} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] leading-snug">
              <span className="font-medium">{item.actor?.full_name ?? "System"}</span>{" "}
              <span className="text-muted">{item.summary ?? item.action}</span>
            </p>
            {!compact && item.changes && Object.keys(item.changes).length ? (
              <div className="mt-1 space-y-0.5">
                {Object.entries(item.changes).slice(0, 3).map(([field, change]) => (
                  <p key={field} className="text-[11px] text-faint">
                    {field}: <span className="line-through">{String(change.from ?? "—")}</span> →{" "}
                    <span className="text-muted">{String(change.to ?? "—")}</span>
                  </p>
                ))}
              </div>
            ) : null}
            <p className="text-[11px] text-faint">{<TimeAgo value={item.created_at} />}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="shrink-0 text-[12px] text-muted">{label}</span>
      <span className="min-w-0 text-end text-[13px]">{children}</span>
    </div>
  );
}

export function LoadingPanel({ label }: { label?: string }) {
  return <OrbitLoading label={label} />;
}
