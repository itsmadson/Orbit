"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Calendar, CheckSquare, Gavel, MapPin, Plus, Video } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useI18n, useT } from "@/lib/i18n";
import { useCreate, useCreateParam, useItem, useList } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import type { Meeting } from "@/lib/types";
import { PageHeader, Section } from "@/components/shared/page";
import { Comments, DetailRow, LoadingPanel, RelatedPanel } from "@/components/shared/entity";
import { Avatar, AvatarGroup, Badge, EmptyState, Skeleton, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { MultiUserPicker, UserPicker, useProjects } from "@/components/shared/pickers";
import { RichEditor, ReadOnlyHtml } from "@/components/shared/editor";
import { DecisionDialog } from "@/features/decisions/decisions";
import { cn, formatDate, formatTime, humanize } from "@/lib/utils";

export function MeetingsView() {
  const t = useT();
  const { locale } = useI18n();
  const { can } = useSession();
  const [createOpen, setCreateOpen] = useCreateParam();

  const upcoming = useList<Meeting>("/meetings", { upcoming: true, page_size: 30 });
  const past = useList<Meeting>("/meetings", { page_size: 30 });

  return (
    <div>
      <PageHeader
        title={t("meetings.title")}
        subtitle="Meetings that produce decisions and action items, not just notes"
        actions={
          can("meetings.write") ? (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("meetings.new")}
            </Button>
          ) : null
        }
      />

      <Tabs defaultValue="upcoming">
        <TabsList className="mb-4">
          <TabsTrigger value="upcoming" count={upcoming.data?.total}>
            {t("meetings.upcoming")}
          </TabsTrigger>
          <TabsTrigger value="all">{t("common.all")}</TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming">
          <MeetingList data={upcoming.data?.items} loading={upcoming.isLoading} />
        </TabsContent>
        <TabsContent value="all">
          <MeetingList data={past.data?.items} loading={past.isLoading} />
        </TabsContent>
      </Tabs>

      <MeetingDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function MeetingList({ data, loading }: { data?: Meeting[]; loading?: boolean }) {
  const t = useT();
  const { locale } = useI18n();
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-20" />
        ))}
      </div>
    );
  }
  if (!data?.length) return <EmptyState icon={Calendar} title={t("common.empty")} />;

  return (
    <div className="space-y-2">
      {data.map((meeting) => (
        <Link
          key={meeting.id}
          href={`/meetings/${meeting.id}`}
          className="panel flex items-center gap-4 p-3.5 transition-all hover:-translate-y-px hover:border-border-strong"
        >
          <div className="flex w-14 shrink-0 flex-col items-center rounded-md border border-border bg-surface-2 py-1.5">
            <span className="text-[10px] uppercase text-faint">
              {new Date(meeting.starts_at).toLocaleDateString(locale === "fa" ? "fa-IR" : "en-GB", {
                month: "short",
              })}
            </span>
            <span className="text-[17px] font-semibold leading-tight">
              {new Date(meeting.starts_at).toLocaleDateString(locale === "fa" ? "fa-IR" : "en-GB", {
                day: "numeric",
              })}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium">{meeting.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2.5 text-[11px] text-muted">
              <span>{formatTime(meeting.starts_at, locale)}</span>
              {meeting.location ? (
                <span className="flex items-center gap-1">
                  {meeting.location.toLowerCase().includes("zoom") ||
                  meeting.location.toLowerCase().includes("meet") ? (
                    <Video className="h-3 w-3" />
                  ) : (
                    <MapPin className="h-3 w-3" />
                  )}
                  {meeting.location}
                </span>
              ) : null}
              {meeting.project_name ? <Badge>{meeting.project_name}</Badge> : null}
              {meeting.action_item_count ? (
                <span className="flex items-center gap-1">
                  <CheckSquare className="h-3 w-3" />
                  {meeting.action_item_count}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-[11px] text-faint">{meeting.participant_count} people</span>
            <StatusBadge status={meeting.status} />
          </div>
        </Link>
      ))}
    </div>
  );
}

export function MeetingDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
}) {
  const t = useT();
  const projects = useProjects();
  const [form, setForm] = React.useState({
    title: "",
    description: "",
    location: "",
    starts_at: "",
    ends_at: "",
    project_id: projectId ?? "",
    participant_ids: [] as string[],
  });
  const [agenda, setAgenda] = React.useState<{ title: string; minutes: number }[]>([]);
  const [agendaDraft, setAgendaDraft] = React.useState("");

  const create = useCreate<Meeting>("/meetings", {
    invalidate: ["/meetings", "dashboard"],
    success: "Meeting scheduled",
    onDone: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader title={t("meetings.new")} />
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({
              ...form,
              project_id: form.project_id || null,
              starts_at: new Date(form.starts_at).toISOString(),
              ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
              agenda,
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
            <Field label="Starts">
              <Input
                type="datetime-local"
                required
                value={form.starts_at}
                onChange={(event) => setForm({ ...form, starts_at: event.target.value })}
              />
            </Field>
            <Field label="Ends">
              <Input
                type="datetime-local"
                value={form.ends_at}
                onChange={(event) => setForm({ ...form, ends_at: event.target.value })}
              />
            </Field>
            <Field label="Location">
              <Input
                value={form.location}
                onChange={(event) => setForm({ ...form, location: event.target.value })}
                placeholder="Meeting room A / Zoom"
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
          <Field label={t("meetings.agenda")}>
            <div className="space-y-1.5">
              {agenda.map((item, index) => (
                <div key={index} className="flex items-center gap-2 text-[13px]">
                  <span className="flex-1 rounded bg-surface-2 px-2 py-1.5">{item.title}</span>
                  <span className="text-[11px] text-faint">{item.minutes}m</span>
                  <button
                    type="button"
                    onClick={() => setAgenda(agenda.filter((_, cursor) => cursor !== index))}
                    className="text-faint hover:text-danger"
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  value={agendaDraft}
                  onChange={(event) => setAgendaDraft(event.target.value)}
                  placeholder="Agenda item"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && agendaDraft.trim()) {
                      event.preventDefault();
                      setAgenda([...agenda, { title: agendaDraft.trim(), minutes: 15 }]);
                      setAgendaDraft("");
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (!agendaDraft.trim()) return;
                    setAgenda([...agenda, { title: agendaDraft.trim(), minutes: 15 }]);
                    setAgendaDraft("");
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </Field>
          <Field label={t("meetings.participants")}>
            <MultiUserPicker
              value={form.participant_ids}
              onChange={(participant_ids) => setForm({ ...form, participant_ids })}
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

export function MeetingDetail({ meetingId }: { meetingId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const client = useQueryClient();
  const { can, user } = useSession();
  const canWrite = can("meetings.write");
  const [notes, setNotes] = React.useState<string | null>(null);
  const [itemTitle, setItemTitle] = React.useState("");
  const [itemAssignee, setItemAssignee] = React.useState<string | null>(null);
  const [decisionOpen, setDecisionOpen] = React.useState(false);

  const { data: meeting, isLoading } = useItem<Meeting>(`/meetings/${meetingId}`);
  const refresh = () => client.invalidateQueries({ queryKey: [`/meetings/${meetingId}`] });

  if (isLoading || !meeting) return <LoadingPanel />;

  const addActionItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!itemTitle.trim()) return;
    try {
      await api.post(`/meetings/${meetingId}/action-items`, {
        title: itemTitle,
        assignee_id: itemAssignee,
      });
      setItemTitle("");
      setItemAssignee(null);
      refresh();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const toTask = async (itemId: string) => {
    try {
      const task = await api.post<{ id: string; key: string }>(
        `/meetings/${meetingId}/action-items/${itemId}/to-task`,
      );
      toast.success(`Created ${task.key}`);
      refresh();
      client.invalidateQueries({ queryKey: ["/tasks"] });
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const myResponse = meeting.participants?.find((item) => item.user.id === user.id)?.response;

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: t("meetings.title"), href: "/meetings" }, { label: meeting.title }]}
        icon={<Calendar className="h-5 w-5 text-muted" />}
        title={meeting.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2 text-[12px]">
            <span>{formatDate(meeting.starts_at, locale, true)}</span>
            {meeting.location ? <span className="text-faint">· {meeting.location}</span> : null}
            {meeting.project_name ? (
              <Link href={`/projects/${meeting.project_id}`} className="text-accent hover:underline">
                · {meeting.project_name}
              </Link>
            ) : null}
          </span>
        }
        actions={
          <>
            <SimpleSelect
              value={myResponse ?? "pending"}
              onValueChange={async (response) => {
                await api.post(`/meetings/${meetingId}/respond`, undefined, { response });
                refresh();
              }}
              className="w-28"
              options={[
                { value: "yes", label: "Going" },
                { value: "maybe", label: "Maybe" },
                { value: "no", label: "Not going" },
                { value: "pending", label: "Pending" },
              ]}
            />
            {can("decisions.write") ? (
              <Button variant="secondary" onClick={() => setDecisionOpen(true)}>
                <Gavel className="h-3.5 w-3.5" />
                {t("meetings.createDecision")}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Section title={t("meetings.agenda")} contentClassName="p-0">
            {meeting.agenda?.length ? (
              <ol>
                {meeting.agenda.map((item, index) => (
                  <li
                    key={index}
                    className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-0"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-surface-2 text-[11px] text-muted">
                      {index + 1}
                    </span>
                    <span className="flex-1 text-[13px]">{item.title}</span>
                    {item.owner ? <span className="text-[11px] text-faint">{item.owner}</span> : null}
                    {item.minutes ? (
                      <span className="text-[11px] text-faint">{item.minutes}m</span>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="p-4 text-[13px] text-faint">{t("common.empty")}</p>
            )}
          </Section>

          <Section
            title={t("meetings.notes")}
            action={
              canWrite ? (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setNotes(notes === null ? meeting.notes ?? "" : null)}
                >
                  {notes === null ? t("action.edit") : t("action.cancel")}
                </Button>
              ) : null
            }
          >
            {notes === null ? (
              meeting.notes ? (
                <ReadOnlyHtml html={meeting.notes} />
              ) : (
                <p className="text-[13px] text-faint">{t("common.empty")}</p>
              )
            ) : (
              <div className="space-y-2">
                <RichEditor content={notes} onChange={setNotes} minHeight="200px" />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={async () => {
                      await api.patch(`/meetings/${meetingId}`, { notes });
                      setNotes(null);
                      refresh();
                    }}
                  >
                    {t("action.save")}
                  </Button>
                </div>
              </div>
            )}
          </Section>

          <Section title={t("meetings.actionItems")} contentClassName="p-0">
            <ul>
              {(meeting.action_items ?? []).map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-0"
                >
                  <CheckSquare className="h-3.5 w-3.5 shrink-0 text-faint" />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{item.title}</span>
                  {item.assignee ? (
                    <span className="flex items-center gap-1.5 text-[11px] text-muted">
                      <Avatar
                        name={item.assignee.full_name}
                        color={item.assignee.avatar_color}
                        size={18}
                      />
                      {item.assignee.full_name}
                    </span>
                  ) : null}
                  {item.task_id ? (
                    <Link
                      href={`/tasks/${item.task_id}`}
                      className="text-[11px] text-accent hover:underline"
                    >
                      {t("action.open")}
                    </Link>
                  ) : canWrite ? (
                    <Button size="xs" variant="secondary" onClick={() => toTask(item.id)}>
                      {t("meetings.createTask")}
                      <ArrowRight className="h-3 w-3 rtl:rotate-180" />
                    </Button>
                  ) : null}
                </li>
              ))}
              {!meeting.action_items?.length ? (
                <p className="px-4 py-3 text-[13px] text-faint">{t("common.empty")}</p>
              ) : null}
            </ul>
            {canWrite ? (
              <form onSubmit={addActionItem} className="flex items-center gap-2 border-t border-border p-3">
                <Input
                  value={itemTitle}
                  onChange={(event) => setItemTitle(event.target.value)}
                  placeholder={t("meetings.actionItems")}
                />
                <div className="w-44 shrink-0">
                  <UserPicker value={itemAssignee} onChange={setItemAssignee} />
                </div>
                <Button type="submit" variant="primary">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </form>
            ) : null}
          </Section>

          <Section title={t("common.comments")}>
            <Comments entityType="meeting" entityId={meetingId} />
          </Section>
        </div>

        <aside className="space-y-4">
          <Section title={t("meetings.participants")} contentClassName="p-3">
            <ul className="space-y-2">
              {(meeting.participants ?? []).map((participant) => (
                <li key={participant.id} className="flex items-center gap-2">
                  <Avatar
                    name={participant.user.full_name}
                    color={participant.user.avatar_color}
                    size={22}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {participant.user.full_name}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] uppercase tracking-wide",
                      participant.response === "yes"
                        ? "text-positive"
                        : participant.response === "no"
                          ? "text-danger"
                          : "text-faint",
                    )}
                  >
                    {participant.response}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title={t("common.details")} contentClassName="p-3">
            <div className="divide-y divide-border/60">
              <DetailRow label={t("common.status")}>
                <StatusBadge status={meeting.status} />
              </DetailRow>
              <DetailRow label="Organizer">{meeting.organizer?.full_name ?? "—"}</DetailRow>
              <DetailRow label="Starts">{formatDate(meeting.starts_at, locale, true)}</DetailRow>
              <DetailRow label="Ends">{formatDate(meeting.ends_at, locale, true)}</DetailRow>
            </div>
          </Section>

          <Section title={t("common.related")} contentClassName="p-2">
            <RelatedPanel entityType="meeting" entityId={meetingId} />
          </Section>
        </aside>
      </div>

      <DecisionDialog
        open={decisionOpen}
        onOpenChange={setDecisionOpen}
        meetingId={meetingId}
        projectId={meeting.project_id ?? undefined}
      />
    </div>
  );
}

/** Month calendar built from meetings + task due dates. */
export function CalendarView() {
  const t = useT();
  const { locale } = useI18n();
  const [cursor, setCursor] = React.useState(() => new Date());

  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

  const meetings = useList<Meeting>("/meetings", {
    start: start.toISOString(),
    end: new Date(end.getTime() + 86400000).toISOString(),
    page_size: 200,
  });

  const byDay = new Map<string, Meeting[]>();
  for (const meeting of meetings.data?.items ?? []) {
    const key = new Date(meeting.starts_at).toDateString();
    byDay.set(key, [...(byDay.get(key) ?? []), meeting]);
  }

  const firstWeekday = (start.getDay() + 6) % 7; // Monday-first
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: end.getDate() }, (_, index) =>
      new Date(cursor.getFullYear(), cursor.getMonth(), index + 1)),
  ];
  const today = new Date().toDateString();

  return (
    <div>
      <PageHeader
        title={t("nav.calendar")}
        subtitle={new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-GB", {
          month: "long",
          year: "numeric",
        }).format(cursor)}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            >
              ‹
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setCursor(new Date())}>
              {t("common.today")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            >
              ›
            </Button>
          </>
        }
      />

      <div className="panel overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border text-[11px] uppercase tracking-wide text-faint">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <div key={day} className="px-2 py-2 text-center">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date, index) => (
            <div
              key={index}
              className={cn(
                "min-h-[104px] border-b border-e border-border/60 p-1.5",
                !date && "bg-surface-2/40",
              )}
            >
              {date ? (
                <>
                  <span
                    className={cn(
                      "inline-flex h-5 w-5 items-center justify-center rounded text-[11px]",
                      date.toDateString() === today
                        ? "bg-accent-solid font-medium text-accent-fg"
                        : "text-muted",
                    )}
                  >
                    {date.getDate()}
                  </span>
                  <div className="mt-1 space-y-1">
                    {(byDay.get(date.toDateString()) ?? []).slice(0, 3).map((meeting) => (
                      <Link
                        key={meeting.id}
                        href={`/meetings/${meeting.id}`}
                        className="block truncate rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent hover:brightness-110"
                      >
                        {formatTime(meeting.starts_at, locale)} {meeting.title}
                      </Link>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
