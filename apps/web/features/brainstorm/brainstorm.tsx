"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Lightbulb, Plus, Sparkles, ThumbsUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useCreate, useItem } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import { PageHeader, Section } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { TagInput } from "@/components/shared/pickers";
import { LoadingPanel } from "@/components/shared/entity";
import { cn } from "@/lib/utils";

type Card = {
  id: string;
  text: string;
  category?: string | null;
  color: string;
  x: number;
  y: number;
  votes: number;
  idea_id?: string | null;
  author?: { full_name: string; avatar_color?: string | null } | null;
};

type Board = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  categories: string[];
  card_count: number;
  cards?: Card[];
};

const CARD_COLORS = ["#f5501b", "#2d88e2", "#61a746", "#b2468b", "#00a7b5", "#946ad5"];

export function BrainstormListView() {
  const t = useT();
  const { can } = useSession();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", description: "", categories: [] as string[] });
  const { data, isLoading } = useItem<Board[]>("/brainstorm");

  const create = useCreate<Board>("/brainstorm", {
    invalidate: ["/brainstorm"],
    success: "Board created",
    onDone: () => {
      setOpen(false);
      setForm({ name: "", description: "", categories: [] });
    },
  });

  return (
    <div>
      <PageHeader
        title={t("brainstorm.title")}
        subtitle="Collaborative boards that turn raw thinking into scored ideas"
        actions={
          can("brainstorm.write") ? (
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("brainstorm.newBoard")}
            </Button>
          ) : null
        }
      />

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-32" />
          ))}
        </div>
      ) : !data?.length ? (
        <EmptyState icon={Sparkles} title={t("common.empty")} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((board) => (
            <Link
              key={board.id}
              href={`/brainstorm/${board.id}`}
              className="panel p-4 transition-all hover:-translate-y-px hover:border-border-strong"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />
                <p className="flex-1 truncate text-[14px] font-medium">{board.name}</p>
                <span className="text-[11px] text-faint">{board.card_count}</span>
              </div>
              {board.description ? (
                <p className="mt-1.5 line-clamp-2 text-[12px] text-muted">{board.description}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1">
                {board.categories?.map((category) => (
                  <span
                    key={category}
                    className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted"
                  >
                    {category}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader title={t("brainstorm.newBoard")} />
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate(form as any);
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
            <Field label={t("common.description")}>
              <Textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </Field>
            <Field label="Categories" hint="Enter to add">
              <TagInput
                value={form.categories}
                onChange={(categories) => setForm({ ...form, categories })}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t("action.cancel")}
              </Button>
              <Button type="submit" variant="primary" loading={create.isPending}>
                {t("action.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Real canvas: cards are absolutely positioned, dragged with pointer events and
 *  persisted to Postgres on drop. */
export function BrainstormBoardView({ boardId }: { boardId: string }) {
  const confirm = useConfirm();
  const t = useT();
  const client = useQueryClient();
  const { can } = useSession();
  const canWrite = can("brainstorm.write");
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = React.useState<{ id: string; dx: number; dy: number } | null>(null);
  const [local, setLocal] = React.useState<Record<string, { x: number; y: number }>>({});
  const [newCard, setNewCard] = React.useState("");
  const [category, setCategory] = React.useState<string | null>(null);

  const { data: board, isLoading } = useItem<Board>(`/brainstorm/${boardId}`);
  const refresh = () => client.invalidateQueries({ queryKey: [`/brainstorm/${boardId}`] });

  const onPointerDown = (event: React.PointerEvent, card: Card) => {
    if (!canWrite) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const position = local[card.id] ?? { x: card.x, y: card.y };
    setDragging({
      id: card.id,
      dx: event.clientX - rect.left - position.x,
      dy: event.clientY - rect.top - position.y,
    });
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragging) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setLocal((current) => ({
      ...current,
      [dragging.id]: {
        x: Math.max(0, Math.round(event.clientX - rect.left - dragging.dx)),
        y: Math.max(0, Math.round(event.clientY - rect.top - dragging.dy)),
      },
    }));
  };

  const onPointerUp = async () => {
    if (!dragging) return;
    const position = local[dragging.id];
    const id = dragging.id;
    setDragging(null);
    if (!position) return;
    try {
      await api.patch(`/brainstorm/${boardId}/cards/${id}`, position);
    } catch (error: any) {
      toast.error(error.message);
      refresh();
    }
  };

  const addCard = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newCard.trim()) return;
    const index = board?.cards?.length ?? 0;
    try {
      await api.post(`/brainstorm/${boardId}/cards`, {
        text: newCard,
        category,
        color: CARD_COLORS[index % CARD_COLORS.length],
        x: 40 + (index % 5) * 210,
        y: 40 + Math.floor(index / 5) * 150,
      });
      setNewCard("");
      refresh();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  if (isLoading || !board) return <LoadingPanel />;

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: t("brainstorm.title"), href: "/brainstorm" }, { label: board.name }]}
        title={board.name}
        subtitle={board.description}
        actions={
          canWrite ? (
            <form onSubmit={addCard} className="flex items-center gap-2">
              {board.categories?.length ? (
                <select
                  value={category ?? ""}
                  onChange={(event) => setCategory(event.target.value || null)}
                  className="h-8 rounded-md border border-border bg-surface-2 px-2 text-[13px]"
                >
                  <option value="">{t("common.none")}</option>
                  {board.categories.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              ) : null}
              <Input
                value={newCard}
                onChange={(event) => setNewCard(event.target.value)}
                placeholder={t("brainstorm.addCard")}
                className="w-56"
              />
              <Button type="submit" variant="primary">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </form>
          ) : null
        }
      />

      <div
        ref={canvasRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="relative min-h-[620px] w-full overflow-auto rounded-lg border border-border bg-surface-2"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      >
        {(board.cards ?? []).map((card) => {
          const position = local[card.id] ?? { x: card.x, y: card.y };
          return (
            <div
              key={card.id}
              onPointerDown={(event) => onPointerDown(event, card)}
              className={cn(
                "absolute w-[190px] cursor-grab touch-none rounded-lg border p-2.5 shadow-lg transition-shadow active:cursor-grabbing",
                dragging?.id === card.id && "z-20 shadow-2xl",
              )}
              style={{
                insetInlineStart: position.x,
                top: position.y,
                background: `color-mix(in oklab, ${card.color} 18%, var(--surface))`,
                borderColor: `color-mix(in oklab, ${card.color} 45%, transparent)`,
              }}
            >
              <p className="text-[13px] leading-snug">{card.text}</p>
              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted">
                {card.category ? (
                  <span className="rounded bg-black/20 px-1.5 py-0.5">{card.category}</span>
                ) : null}
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={async () => {
                    await api.post(`/brainstorm/${boardId}/cards/${card.id}/vote`);
                    refresh();
                  }}
                  className="ms-auto flex items-center gap-0.5 rounded px-1 py-0.5 hover:bg-black/20"
                >
                  <ThumbsUp className="h-3 w-3" />
                  {card.votes}
                </button>
                {canWrite ? (
                  <>
                    <button
                      type="button"
                      title={t("brainstorm.promote")}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={async () => {
                        try {
                          await api.post(`/brainstorm/${boardId}/cards/${card.id}/promote`);
                          toast.success("Promoted to idea");
                          refresh();
                        } catch (error: any) {
                          toast.error(error.message);
                        }
                      }}
                      className="rounded px-1 py-0.5 hover:bg-black/20"
                    >
                      <Lightbulb
                        className={cn("h-3 w-3", card.idea_id ? "text-warning" : "")}
                      />
                    </button>
                    <button
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={async () => {
                        const ok = await confirm({
                          title: t("brainstorm.deleteCard"),
                          body: card.text,
                          confirmLabel: t("action.delete"),
                          destructive: true,
                        });
                        if (!ok) return;
                        await api.delete(`/brainstorm/${boardId}/cards/${card.id}`);
                        refresh();
                      }}
                      className="rounded px-1 py-0.5 hover:bg-black/20"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
        {!board.cards?.length ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-[13px] text-faint">
              {canWrite ? t("brainstorm.addCard") : t("common.empty")}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
