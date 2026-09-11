"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bot, Info, Send, Sparkles, User } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n, useT } from "@/lib/i18n";
import { useItem } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import { PageHeader, Section } from "@/components/shared/page";
import { OrbitLoader } from "@/components/ui/orbit-loader";
import { Avatar, Badge, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { ENTITY_ICONS } from "@/components/shared/entity";
import { cn, relativeTime } from "@/lib/utils";

type Source = { type: string; id: string; label: string; url: string };
type Message = { role: "user" | "assistant"; content: string; sources?: Source[] };

export function AiView() {
  const t = useT();
  const { locale } = useI18n();
  const { user } = useSession();
  const client = useQueryClient();
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  const status = useItem<any>("/ai/status");
  const insights = useItem<any>("/ai/insights");

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  const ask = async (question: string) => {
    if (!question.trim() || pending) return;
    setMessages((current) => [...current, { role: "user", content: question }]);
    setInput("");
    setPending(true);
    try {
      const answer = await api.post<any>("/ai/ask", {
        question,
        conversation_id: conversationId,
      });
      setConversationId(answer.conversation_id);
      setMessages((current) => [
        ...current,
        { role: "assistant", content: answer.answer, sources: answer.sources },
      ]);
      client.invalidateQueries({ queryKey: ["/ai/conversations"] });
    } catch (error: any) {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: error.message ?? "Request failed" },
      ]);
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t("ai.title")}
        icon={<Bot className="h-5 w-5 text-accent" />}
        subtitle={
          status.data ? (
            <span className="flex flex-wrap items-center gap-2 text-[12px]">
              <Badge
                className={
                  status.data.generative
                    ? "border-positive/30 bg-positive/10 text-positive"
                    : "border-border"
                }
              >
                {t("ai.provider")}: {status.data.provider}
                {status.data.model ? ` · ${status.data.model}` : ""}
              </Badge>
              <span className="text-faint">
                Answers respect your permissions — nothing you cannot open is retrieved.
              </span>
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
                    Ask about projects, finance, people, R&D or decisions. Orbit AI retrieves the
                    records you are allowed to see and answers from them.
                  </p>
                </div>
                <div className="flex max-w-lg flex-wrap justify-center gap-1.5">
                  {(status.data?.suggested_prompts ?? []).map((prompt: string) => (
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
                      {message.role === "user" ? user.full_name : "Orbit AI"}
                    </p>
                    <div className="whitespace-pre-wrap text-[13px] leading-relaxed">
                      {message.content}
                    </div>
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
                <span className="text-[12px] text-muted">{t("ai.thinking")}</span>
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
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  ask(input);
                }
              }}
              placeholder={t("ai.placeholder")}
              className="min-h-[44px] flex-1 resize-none"
            />
            <Button type="submit" variant="primary" size="lg" loading={pending} disabled={!input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </Section>

        <aside className="space-y-4">
          {!status.data?.generative ? (
            <div className="rounded-lg border border-warning/25 bg-warning/[0.06] p-3">
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-warning">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t("ai.provider")}: deterministic
              </p>
              <p className="mt-1 text-[12px] text-muted">{t("ai.notConfigured")}</p>
              <code className="mt-2 block rounded bg-surface-2 px-2 py-1 text-[11px] text-muted">
                AI_PROVIDER=openai
              </code>
            </div>
          ) : null}

          <Section title={t("dashboard.aiInsights")} contentClassName="p-3">
            <ul className="space-y-2">
              {(insights.data?.insights ?? []).map((insight: any, index: number) => (
                <li key={index}>
                  <Link
                    href={insight.url ?? "#"}
                    className="block rounded-lg border border-border bg-surface-2 p-2.5 transition-colors hover:border-accent/40"
                  >
                    <p className="text-[12px] font-medium">{insight.title}</p>
                    {insight.body ? (
                      <p className="mt-0.5 text-[11px] text-muted">{insight.body}</p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>

          <Section title={t("ai.suggested")} contentClassName="p-3">
            <div className="flex flex-wrap gap-1.5">
              {(status.data?.suggested_prompts ?? []).map((prompt: string) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => ask(prompt)}
                  className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent/40 hover:text-text"
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
