"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Avatar } from "@/components/ui/misc";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Person = {
  id: string;
  full_name: string;
  title?: string | null;
  avatar_color?: string | null;
};

/** The @token as typed, and where it sits, so it can be replaced on select. */
type Query = { text: string; start: number };

function activeQuery(value: string, caret: number): Query | null {
  const before = value.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  // An @ only opens the menu at a word boundary, so an email never triggers it.
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const text = before.slice(at + 1);
  if (/\s{2,}|\n/.test(text)) return null;
  return { text, start: at };
}

/**
 * A comment box that can actually mention someone.
 *
 * The server has always turned mentions into notifications; there was simply no
 * way to produce one, so the inbox's Mentions filter could never fill. Typing
 * `@` opens the directory, and picking a person records their id alongside the
 * text so the notification can be addressed.
 */
export function MentionInput({
  value,
  onChange,
  onMentionsChange,
  placeholder,
  className,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onMentionsChange: (ids: string[]) => void;
  placeholder?: string;
  className?: string;
  onSubmit?: () => void;
}) {
  const t = useT();
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = React.useState<Query | null>(null);
  const [highlight, setHighlight] = React.useState(0);
  /** name → id for everyone picked so far, resolved against the text on change. */
  const picked = React.useRef(new Map<string, string>());

  const { data: people } = useQuery({
    queryKey: ["directory"],
    queryFn: () => api.get<Person[]>("/users/directory"),
    staleTime: 5 * 60_000,
  });

  const matches = React.useMemo(() => {
    if (!query) return [];
    const needle = query.text.toLowerCase();
    return (people ?? [])
      .filter((person) => person.full_name.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [people, query]);

  /** Only people still named in the text count as mentioned. */
  const syncMentions = React.useCallback(
    (text: string) => {
      const ids: string[] = [];
      for (const [name, id] of picked.current) {
        if (text.includes(`@${name}`) && !ids.includes(id)) ids.push(id);
      }
      onMentionsChange(ids);
    },
    [onMentionsChange],
  );

  function update(text: string, caret: number) {
    onChange(text);
    syncMentions(text);
    setQuery(activeQuery(text, caret));
    setHighlight(0);
  }

  function choose(person: Person) {
    if (!query) return;
    const before = value.slice(0, query.start);
    const after = value.slice(query.start + 1 + query.text.length);
    const next = `${before}@${person.full_name} ${after}`;
    picked.current.set(person.full_name, person.id);
    onChange(next);
    syncMentions(next);
    setQuery(null);
    requestAnimationFrame(() => {
      const caret = before.length + person.full_name.length + 2;
      ref.current?.focus();
      ref.current?.setSelectionRange(caret, caret);
    });
  }

  return (
    <div className={cn("relative", className)}>
      <Textarea
        ref={ref}
        value={value}
        placeholder={placeholder}
        className="min-h-[64px]"
        onChange={(event) => update(event.target.value, event.target.selectionStart ?? 0)}
        onKeyDown={(event) => {
          if (query && matches.length) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setHighlight((index) => (index + 1) % matches.length);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlight((index) => (index - 1 + matches.length) % matches.length);
              return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              choose(matches[highlight]);
              return;
            }
            if (event.key === "Escape") {
              setQuery(null);
              return;
            }
          }
          // Submit without reaching for the mouse, the way chat works.
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onSubmit?.();
          }
        }}
        onBlur={() => setTimeout(() => setQuery(null), 120)}
      />

      {query && matches.length ? (
        <ul className="panel-elevated absolute bottom-full z-30 mb-1 max-h-64 w-72 overflow-y-auto p-1">
          {matches.map((person, index) => (
            <li key={person.id}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(person)}
                onMouseEnter={() => setHighlight(index)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start transition-colors",
                  index === highlight ? "bg-surface-2" : "hover:bg-surface-2",
                )}
              >
                <Avatar name={person.full_name} color={person.avatar_color} size={22} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-text">
                    {person.full_name}
                  </span>
                  {person.title ? (
                    <span className="block truncate text-[11px] text-muted">{person.title}</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-1 text-[11px] text-faint">{t("comments.mentionHint")}</p>
    </div>
  );
}

/** Renders a stored comment body with its @names picked out. */
export function CommentBody({ body, className }: { body: string; className?: string }) {
  const { data: people } = useQuery({
    queryKey: ["directory"],
    queryFn: () => api.get<Person[]>("/users/directory"),
    staleTime: 5 * 60_000,
  });
  const names = React.useMemo(
    () => (people ?? []).map((person) => person.full_name).sort((a, b) => b.length - a.length),
    [people],
  );

  const parts = React.useMemo(() => {
    if (!names.length) return [body];
    const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const pattern = new RegExp(`(@(?:${escaped.join("|")}))`, "g");
    return body.split(pattern);
  }, [body, names]);

  return (
    <p className={cn("whitespace-pre-wrap", className)}>
      {parts.map((part, index) =>
        part.startsWith("@") && names.includes(part.slice(1)) ? (
          <span key={index} className="rounded bg-accent-soft px-1 font-medium text-accent">
            {part}
          </span>
        ) : (
          <React.Fragment key={index}>{part}</React.Fragment>
        ),
      )}
    </p>
  );
}
