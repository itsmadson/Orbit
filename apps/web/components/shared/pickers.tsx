"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, X } from "lucide-react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/misc";
import { Input } from "@/components/ui/input";

export type Person = {
  id: string;
  full_name: string;
  email?: string | null;
  title?: string | null;
  avatar_color?: string | null;
};

export function useDirectory() {
  return useQuery({
    queryKey: ["directory"],
    queryFn: () => api.get<Person[]>("/users/directory"),
    staleTime: 5 * 60_000,
  });
}

export function useProjects() {
  return useQuery({
    queryKey: ["projects", "picker"],
    queryFn: () =>
      api.get<{ items: { id: string; name: string; key: string; color: string; icon: string }[] }>(
        "/projects",
        { page_size: 100 },
      ),
    staleTime: 60_000,
  });
}

function PopoverList({
  trigger,
  children,
  open,
  onOpenChange,
  align = "start",
  className,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  align?: "start" | "end" | "center";
  className?: string;
}) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={align}
          sideOffset={6}
          className={cn(
            "z-50 w-64 overflow-hidden rounded-lg border border-border bg-elevated p-1 shadow-xl",
            className,
          )}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export function UserPicker({
  value,
  onChange,
  placeholder,
  allowClear = true,
  className,
}: {
  value?: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const { data } = useDirectory();
  const people = (data ?? []).filter((person) =>
    person.full_name.toLowerCase().includes(query.toLowerCase()),
  );
  const selected = data?.find((person) => person.id === value);

  return (
    <PopoverList
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          className={cn(
            "flex h-8 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface-2 px-2.5 text-[13px] transition-colors hover:border-border-strong",
            className,
          )}
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <Avatar name={selected.full_name} color={selected.avatar_color} size={18} />
              <span className="truncate">{selected.full_name}</span>
            </span>
          ) : (
            <span className="text-faint">{placeholder ?? t("common.unassigned")}</span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
      }
    >
      <div className="p-1">
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("action.search")}
          className="h-7"
        />
      </div>
      <div className="max-h-64 overflow-y-auto p-1">
        {allowClear ? (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-[13px] text-muted hover:bg-surface-2"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            <X className="h-3.5 w-3.5" />
            {t("common.unassigned")}
          </button>
        ) : null}
        {people.map((person) => (
          <button
            key={person.id}
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-[13px] hover:bg-surface-2"
            onClick={() => {
              onChange(person.id);
              setOpen(false);
            }}
          >
            <Avatar name={person.full_name} color={person.avatar_color} size={20} />
            <span className="min-w-0 flex-1 truncate">
              {person.full_name}
              {person.title ? <span className="ms-1 text-[11px] text-faint">{person.title}</span> : null}
            </span>
            {person.id === value ? <Check className="h-3.5 w-3.5 text-accent" /> : null}
          </button>
        ))}
      </div>
    </PopoverList>
  );
}

export function MultiUserPicker({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const { data } = useDirectory();
  const people = (data ?? []).filter((person) =>
    person.full_name.toLowerCase().includes(query.toLowerCase()),
  );

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);

  return (
    <PopoverList
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          className="flex min-h-8 w-full flex-wrap items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-[13px] transition-colors hover:border-border-strong"
        >
          {value.length === 0 ? (
            <span className="text-faint">{placeholder ?? t("common.members")}</span>
          ) : (
            (data ?? [])
              .filter((person) => value.includes(person.id))
              .map((person) => (
                <span
                  key={person.id}
                  className="flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-[11px]"
                >
                  <Avatar name={person.full_name} color={person.avatar_color} size={14} />
                  {person.full_name}
                </span>
              ))
          )}
        </button>
      }
    >
      <div className="p-1">
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("action.search")}
          className="h-7"
        />
      </div>
      <div className="max-h-64 overflow-y-auto p-1">
        {people.map((person) => (
          <button
            key={person.id}
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-[13px] hover:bg-surface-2"
            onClick={() => toggle(person.id)}
          >
            <Avatar name={person.full_name} color={person.avatar_color} size={20} />
            <span className="min-w-0 flex-1 truncate">{person.full_name}</span>
            {value.includes(person.id) ? <Check className="h-3.5 w-3.5 text-accent" /> : null}
          </button>
        ))}
      </div>
    </PopoverList>
  );
}

export function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = React.useState("");
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1">
      {value.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-[11px] text-muted"
        >
          {tag}
          <button type="button" onClick={() => onChange(value.filter((item) => item !== tag))}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === ",") && draft.trim()) {
            event.preventDefault();
            if (!value.includes(draft.trim())) onChange([...value, draft.trim()]);
            setDraft("");
          }
          if (event.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        placeholder={placeholder}
        className="min-w-24 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint"
      />
    </div>
  );
}
