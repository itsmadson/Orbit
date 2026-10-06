"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  Info,
  MessageSquare,
  Send,
  ShieldAlert,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useItem } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import { PageHeader, Section } from "@/components/shared/page";
import { OrbitLoader } from "@/components/ui/orbit-loader";
import { Avatar, Badge, TimeAgo } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { ENTITY_ICONS } from "@/components/shared/entity";
import { cn } from "@/lib/utils";

type Source = { type: string; id: string; label: string; url: string };
type Step = { tool: string; label: string; ok: boolean; detail?: string };
/** A write the assistant wants to make but may not without a yes. */
type Action = {
  id: string;
  method: string;
  path: string;
  body?: unknown;
  query?: Record<string, unknown> | null;
  summary: string;
  status: "pending" | "running" | "done" | "rejected" | "failed";
  result?: string | null;
};
type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  steps?: Step[];
  actions?: Action[];
  error?: boolean;
};
type Answer = {
  answer: string;
  conversation_id: string;
  sources: Source[];
  steps: Step[];
  actions: Action[];
  changed: boolean;
};
type Status = {
  provider: string;
  model?: string | null;
  generative: boolean;
  agent: boolean;
  engine?: string | null;
  daily_limit?: number | null;
  used_today: number;
  suggested_prompts: string[];
};

export function AiView() {
  const { t, n } = useI18n();
  const { user } = useSession();
  const client = useQueryClient();
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [deciding, setDeciding] = React.useState<string | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  const status = useItem<Status>("/ai/status");
  const insights = useItem<any>("/ai/insights");
  const conversations = useItem<{ id: string; title: string; updated_at: string }[]>(
    "/ai/conversations",
  );

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  /** The assistant changed something: every list on screen may now be stale. */
  const afterAnswer = (answer: Answer) => {
    setConversationId(answer.conversation_id);
    client.invalidateQueries({ queryKey: ["/ai/conversations"] });
    client.invalidateQueries({ queryKey: ["/ai/status"] });
    if (answer.changed) {
      client.invalidateQueries({
        predicate: (query) => !String(query.queryKey[0] ?? "").startsWith("/ai/"),
      });
    }
  };

  const ask = async (question: string) => {
    if (!question.trim() || pending) return;
    setMessages((current) => [...current, { role: "user", content: question }]);
    setInput("");
    setPending(true);
    try {
      const answer = await api.post<Answer>("/ai/ask", {
        question,
        conversation_id: conversationId,
      });
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: answer.answer,
          sources: answer.sources,
          steps: answer.steps,
          actions: answer.actions,
        },
      ]);
      afterAnswer(answer);
    } catch (error: any) {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: error?.message ?? t("common.requestFailed"), error: true },
      ]);
    } finally {
      setPending(false);
    }
  };

  const decide = async (action: Action, decision: "approve" | "reject") => {
    if (!conversationId || deciding) return;
    setDeciding(action.id);
    const mark = (status: Action["status"]) =>
      setMessages((current) =>
        current.map((message) => ({
          ...message,
          actions: message.actions?.map((item) => (item.id === action.id ? { ...item, status } : item)),
        })),
      );
    mark(decision === "approve" ? "running" : "rejected");
    try {
      const answer = await api.post<Answer>(
        `/ai/conversations/${conversationId}/actions/${action.id}`,
        { decision },
      );
      // The server is the authority on how the action ended.
      const reloaded = await api.get<{ messages: Message[] }>(`/ai/conversations/${conversationId}`);
      setMessages(reloaded.messages);
      afterAnswer(answer);
    } catch (error: any) {
      mark("pending");
      setMessages((current) => [
        ...current,
        { role: "assistant", content: error?.message ?? t("common.requestFailed"), error: true },
      ]);
    } finally {
      setDeciding(null);
    }
  };

  const open = async (id: string) => {
    try {
      const conversation = await api.get<{ messages: Message[] }>(`/ai/conversations/${id}`);
      setMessages(conversation.messages);
      setConversationId(id);
    } catch {
      /* a deleted conversation simply stays closed */
    }
  };

  const data = status.data;

  return (
    <div>
      <PageHeader
        title={t("ai.title")}
        icon={<Bot className="h-5 w-5 text-accent" />}
        subtitle={
          data ? (
            <span className="flex flex-wrap items-center gap-2 text-[12px]">
              <Badge
                className={
                  data.generative ? "border-positive/30 bg-positive/10 text-positive" : "border-border"
                }
              >
                <span dir="ltr">
                  {data.provider}
                  {data.model ? ` · ${data.model}` : ""}
                </span>
              </Badge>
              {data.agent ? (
                <Badge className="border-accent/30 bg-accent-soft text-accent">
                  <Wrench className="h-3 w-3" />
                  {t("ai.agentMode")}
                </Badge>
              ) : null}
              <span className="text-faint">{t(data.agent ? "ai.agentNote" : "ai.permissionNote")}</span>
            </span>
          ) : undefined
        }
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              setMessages([]);
              setConversationId(null);
            }}
          >
            {t("ai.newChat")}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Section contentClassName="flex h-[calc(100dvh-260px)] min-h-[420px] flex-col p-0">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {!messages.length ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <div className="rounded-xl border border-border bg-surface-2 p-3">
                  <Sparkles className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-[14px] font-medium">{t("ai.title")}</p>
                  <p className="mt-1 max-w-sm text-[12px] text-muted">
                    {t(data?.agent ? "ai.introAgent" : "ai.intro")}
                  </p>
                </div>
                <div className="flex max-w-lg flex-wrap justify-center gap-1.5">
                  {(data?.suggested_prompts ?? []).map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => ask(prompt)}
                      className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-muted transition-colors hover:border-accent/40 hover:text-text"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message, index) => (
                <div key={index} className="flex gap-3">
                  {message.role === "user" ? (
                    <Avatar name={user.full_name} color={user.avatar_color} size={26} />
                  ) : (
                    <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                      <Bot className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 text-[11px] font-medium text-faint">
                      {message.role === "user" ? user.full_name : t("ai.name")}
                    </p>
                    {message.steps?.length ? <Steps steps={message.steps} /> : null}
                    <div
                      dir="auto"
                      className={cn(
                        "whitespace-pre-wrap text-[13px] leading-relaxed",
                        message.error && "text-danger",
                      )}
                    >
                      {message.content}
                    </div>
                    {message.actions?.map((action) => (
                      <ActionCard
                        key={action.id}
                        action={action}
                        busy={deciding === action.id}
                        disabled={Boolean(deciding) || pending}
                        onDecide={(decision) => decide(action, decision)}
                      />
                    ))}
                    {message.sources?.length ? (
                      <div className="mt-2">
                        <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-faint">
                          {t("ai.sources")}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {message.sources.map((source) => {
                            const Icon = ENTITY_ICONS[source.type] ?? Info;
                            return (
                              <Link
                                key={`${source.type}-${source.id}`}
                                href={source.url}
                                className="flex items-center gap-1 rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:border-accent/40 hover:text-accent"
                              >
                                <Icon className="h-3 w-3" />
                                {source.label}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
            {pending ? (
              <div className="flex items-center gap-3">
                <OrbitLoader size={26} />
                <span className="text-[12px] text-muted">
                  {t(data?.agent ? "ai.working" : "ai.thinking")}
                </span>
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              ask(input);
            }}
            className="flex items-end gap-2 border-t border-border p-3"
          >
            <Textarea
              dir="auto"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  ask(input);
                }
              }}
              placeholder={t(data?.agent ? "ai.placeholderAgent" : "ai.placeholder")}
              className="min-h-[44px] flex-1 resize-none"
            />
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={pending}
              disabled={!input.trim()}
              aria-label={t("ai.send")}
            >
              <Send className="h-4 w-4 rtl:-scale-x-100" />
            </Button>
          </form>
        </Section>

        <aside className="space-y-4">
          {data && !data.generative ? (
            <div className="rounded-lg border border-warning/25 bg-warning/[0.06] p-3">
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-warning">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t("ai.noModel")}
              </p>
              <p className="mt-1 text-[12px] text-muted">{t("ai.notConfigured")}</p>
              <code dir="ltr" className="mt-2 block rounded bg-surface-2 px-2 py-1 text-[11px] text-muted">
                GAPGPT_API_KEY=sk-…
              </code>
            </div>
          ) : null}

          {data?.agent && data.daily_limit ? (
            <p className="px-1 text-[11px] text-faint">
              {t("ai.usage", { used: n(data.used_today), limit: n(data.daily_limit) })}
              {data.engine ? (
                <span dir="ltr" className="ms-1">
                  · {data.engine}
                </span>
              ) : null}
            </p>
          ) : null}

          {(conversations.data ?? []).length ? (
            <Section title={t("ai.history")} contentClassName="p-1.5">
              <ul className="max-h-48 overflow-y-auto">
                {(conversations.data ?? []).slice(0, 12).map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => open(conversation.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-[12px] transition-colors hover:bg-surface-2",
                        conversation.id === conversationId ? "text-accent" : "text-muted",
                      )}
                    >
                      <MessageSquare className="h-3 w-3 shrink-0" />
                      <span dir="auto" className="min-w-0 flex-1 truncate">
                        {conversation.title}
                      </span>
                      <span className="shrink-0 text-[10px] text-faint">
                        <TimeAgo value={conversation.updated_at} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title={t("dashboard.aiInsights")} contentClassName="p-3">
            <ul className="space-y-2">
              {(insights.data?.insights ?? []).map((insight: any, index: number) => (
                <li key={index}>
                  <Link
                    href={insight.url ?? "#"}
                    className="block rounded-lg border border-border bg-surface-2 p-2.5 transition-colors hover:border-accent/40"
                  >
                    <p dir="auto" className="text-[12px] font-medium">
                      {insight.title}
                    </p>
                    {insight.body ? (
                      <p dir="auto" className="mt-0.5 text-[11px] text-muted">
                        {insight.body}
                      </p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>

          <Section title={t("ai.suggested")} contentClassName="p-3">
            <div className="flex flex-wrap gap-1.5">
              {(data?.suggested_prompts ?? []).map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => ask(prompt)}
                  className="rounded-md border border-border bg-surface-2 px-2 py-1 text-start text-[11px] text-muted transition-colors hover:border-accent/40 hover:text-text"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </Section>
        </aside>
      </div>
    </div>
  );
}

/** What the assistant did to reach its answer. Collapsed: it is evidence, not the point. */
function Steps({ steps }: { steps: Step[] }) {
  const { t, n } = useI18n();
  const [open, setOpen] = React.useState(false);
  const failed = steps.filter((step) => !step.ok).length;
  return (
    <div className="mb-1.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1 rounded text-[11px] text-faint transition-colors hover:text-muted"
      >
        <Wrench className="h-3 w-3" />
        {t("ai.steps", { count: n(steps.length) })}
        {failed ? <span className="text-warning">· {t("ai.stepsFailed", { count: n(failed) })}</span> : null}
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <ol className="mt-1 space-y-0.5 border-s border-border ps-2.5">
          {steps.map((step, index) => (
            <li key={index} className="flex items-center gap-1.5 text-[11px]">
              {step.ok ? (
                <Check className="h-3 w-3 shrink-0 text-positive" />
              ) : (
                <X className="h-3 w-3 shrink-0 text-danger" />
              )}
              <code dir="ltr" className="min-w-0 truncate text-muted">
                {step.label}
              </code>
              {step.detail ? (
                <span dir="ltr" className="shrink-0 text-faint">
                  {step.detail}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function ActionCard({
  action,
  busy,
  disabled,
  onDecide,
}: {
  action: Action;
  busy: boolean;
  disabled: boolean;
  onDecide: (decision: "approve" | "reject") => void;
}) {
  const { t } = useI18n();
  const destructive = action.method === "DELETE";
  const body =
    action.body && typeof action.body === "object" && Object.keys(action.body).length
      ? JSON.stringify(action.body, null, 2)
      : null;
  return (
    <div
      className={cn(
        "mt-2 rounded-lg border p-3",
        action.status === "pending" || action.status === "running"
          ? "border-warning/40 bg-warning/[0.06]"
          : "border-border bg-surface-2",
      )}
    >
      <p className="flex items-center gap-1.5 text-[12px] font-medium">
        <ShieldAlert className={cn("h-3.5 w-3.5", destructive ? "text-danger" : "text-warning")} />
        {t(`ai.action.${action.status}`)}
      </p>
      <code dir="ltr" className="mt-1.5 block break-all text-[12px]">
        <span className={cn("font-semibold", destructive ? "text-danger" : "text-accent")}>
          {action.method}
        </span>{" "}
        {action.path}
      </code>
      {body ? (
        <pre
          dir="ltr"
          className="mt-1.5 max-h-40 overflow-auto rounded bg-surface px-2 py-1.5 text-start text-[11px] text-muted"
        >
          {body}
        </pre>
      ) : null}
      {action.status === "failed" && action.result ? (
        <p dir="ltr" className="mt-1.5 break-all text-[11px] text-danger">
          {action.result.slice(0, 300)}
        </p>
      ) : null}
      {action.status === "pending" || action.status === "running" ? (
        <div className="mt-2.5 flex items-center gap-2">
          <Button
            size="sm"
            variant={destructive ? "danger" : "primary"}
            loading={busy && action.status === "running"}
            disabled={disabled}
            onClick={() => onDecide("approve")}
          >
            {t("ai.approve")}
          </Button>
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onDecide("reject")}>
            {t("ai.reject")}
          </Button>
          <span className="text-[11px] text-faint">{t("ai.approveHint")}</span>
        </div>
      ) : null}
    </div>
  );
}
