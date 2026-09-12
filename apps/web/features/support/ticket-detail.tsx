"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, Send, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useItem } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import { PageHeader, Section } from "@/components/shared/page";
import { Attachments, DetailRow, RelatedPanel } from "@/components/shared/entity";
import { Avatar, Badge, StatusBadge, TimeAgo } from "@/components/ui/misc";
import { OrbitLoading } from "@/components/ui/orbit-loader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { UserPicker } from "@/components/shared/pickers";
import { SlaPill, type Ticket } from "@/features/support/tickets";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  body: string;
  is_internal: boolean;
  is_from_customer: boolean;
  author?: { full_name: string; avatar_color?: string | null } | null;
  created_at: string;
};

export function TicketDetail({ ticketId }: { ticketId: string }) {
  const t = useT();
  const client = useQueryClient();
  const { can, user } = useSession();
  const ticket = useItem<Ticket>(`/tickets/${ticketId}`);
  const messages = useItem<Message[]>(`/tickets/${ticketId}/messages`);
  const [body, setBody] = React.useState("");
  const [internal, setInternal] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const data = ticket.data;
  if (ticket.isLoading || !data) return <OrbitLoading />;

  const isStaff = user.role !== "customer";
  const refresh = () => {
    client.invalidateQueries({ queryKey: [`/tickets/${ticketId}`] });
    client.invalidateQueries({ queryKey: [`/tickets/${ticketId}/messages`] });
    client.invalidateQueries({ queryKey: ["/tickets"] });
    client.invalidateQueries({ queryKey: ["/tickets/stats"] });
  };

  async function patch(changes: Record<string, unknown>) {
    setBusy(true);
    try {
      await api.patch(`/tickets/${ticketId}`, changes);
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.post(`/tickets/${ticketId}/messages`, { body, is_internal: internal });
      setBody("");
      setInternal(false);
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function toTask() {
    try {
      const result = await api.post<{ key: string }>(`/tickets/${ticketId}/to-task`);
      toast.success(result.key);
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed");
    }
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { label: t("support.title"), href: isStaff ? "/tickets" : "/portal/tickets" },
          { label: data.number },
        ]}
        title={data.subject}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono tnum">{data.number}</span>
            {data.customer ? (
              <>
                <span className="text-faint">·</span>
                <span>{data.customer.name}</span>
              </>
            ) : null}
            <span className="text-faint">·</span>
            <TimeAgo value={data.created_at} />
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SlaPill ticket={data} />
            {isStaff && can("tasks.write") && !data.task_id ? (
              <Button size="sm" variant="secondary" onClick={toTask}>
                <Wrench className="h-3.5 w-3.5" />
                {t("support.toTask")}
              </Button>
            ) : null}
            {!isStaff && data.status !== "closed" ? (
              <Button size="sm" variant="secondary" loading={busy}
                      onClick={() => patch({ status: "closed" })}>
                {t("support.close")}
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Section title={t("support.conversation")} contentClassName="p-0">
            <div className="space-y-0 divide-y divide-border">
              {data.body ? (
                <div className="p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <Avatar name={data.requester?.full_name ?? "?"} size={24} />
                    <span className="text-[13px] font-medium">
                      {data.requester?.full_name ?? t("support.customer")}
                    </span>
                    <TimeAgo value={data.created_at} className="text-[11px] text-faint" />
                  </div>
                  <p className="whitespace-pre-wrap text-[13px] text-muted">{data.body}</p>
                </div>
              ) : null}

              {(messages.data ?? []).map((message) => (
                <div
                  key={message.id}
                  className={cn("p-4", message.is_internal && "bg-warning/[0.05]")}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <Avatar
                      name={message.author?.full_name}
                      color={message.author?.avatar_color}
                      size={24}
                    />
                    <span className="text-[13px] font-medium">
                      {message.author?.full_name ?? "—"}
                    </span>
                    {message.is_internal ? (
                      <Badge tone="at_risk">
                        <Lock className="h-2.5 w-2.5" />
                        {t("support.internal")}
                      </Badge>
                    ) : null}
                    {message.is_from_customer ? (
                      <Badge>{t("support.customer")}</Badge>
                    ) : null}
                    <TimeAgo value={message.created_at} className="ms-auto text-[11px] text-faint" />
                  </div>
                  <p className="whitespace-pre-wrap text-[13px] text-muted">{message.body}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2 border-t border-border p-4">
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={3}
                placeholder={internal ? t("support.internalHint") : t("support.replyHint")}
                className={cn(internal && "border-warning/40")}
              />
              <div className="flex items-center gap-2">
                {isStaff ? (
                  <label className="flex items-center gap-1.5 text-[12px] text-muted">
                    <input
                      type="checkbox"
                      checked={internal}
                      onChange={(event) => setInternal(event.target.checked)}
                      className="h-3.5 w-3.5 accent-[var(--warning)]"
                    />
                    {t("support.internalNote")}
                  </label>
                ) : null}
                <Button
                  size="sm"
                  variant="primary"
                  className="ms-auto"
                  loading={busy}
                  disabled={!body.trim()}
                  onClick={send}
                >
                  <Send className="h-3.5 w-3.5" />
                  {t("action.send")}
                </Button>
              </div>
            </div>
          </Section>
        </div>

        <div className="space-y-4">
          <Section title={t("common.details")}>
            <div className="space-y-1">
              <DetailRow label={t("common.status")}>
                {isStaff ? (
                  <SimpleSelect
                    value={data.status}
                    onValueChange={(status) => patch({ status })}
                    className="h-7 w-40"
                    options={["new", "open", "pending_customer", "resolved", "closed"].map(
                      (value) => ({
                        value,
                        label: t(`status.${value}`) === `status.${value}`
                          ? value
                          : t(`status.${value}`),
                      }),
                    )}
                  />
                ) : (
                  <StatusBadge status={data.status} />
                )}
              </DetailRow>
              <DetailRow label={t("common.priority")}>
                {isStaff ? (
                  <SimpleSelect
                    value={data.priority}
                    onValueChange={(priority) => patch({ priority })}
                    className="h-7 w-32"
                    options={["urgent", "high", "normal", "low"].map((value) => ({
                      value,
                      label: value,
                    }))}
                  />
                ) : (
                  <span className="text-[12px]">{data.priority}</span>
                )}
              </DetailRow>
              {isStaff ? (
                <DetailRow label={t("common.assignee")}>
                  <UserPicker
                    value={data.assignee?.id ?? null}
                    onChange={(assignee_id) => patch({ assignee_id })}
                  />
                </DetailRow>
              ) : null}
              {data.category ? (
                <DetailRow label={t("common.type")}>{data.category}</DetailRow>
              ) : null}
              <DetailRow label={t("support.source")}>{data.source}</DetailRow>
              {data.first_response_at ? (
                <DetailRow label={t("support.firstResponse")}>
                  <TimeAgo value={data.first_response_at} />
                </DetailRow>
              ) : null}
            </div>
          </Section>

          <Section title={t("attachments.title")}>
            {/* A customer may add files but not remove staff uploads. */}
            <Attachments entityType="ticket" entityId={data.id} canDelete={isStaff} />
          </Section>

          {isStaff ? <RelatedPanel entityType="ticket" entityId={data.id} /> : null}
        </div>
      </div>
    </div>
  );
}
