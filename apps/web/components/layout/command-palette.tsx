"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CornerDownLeft, Loader2, Plus, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { NAV, QUICK_CREATE } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useUi } from "@/lib/store";
import { useSession } from "@/components/providers";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/misc";
import { ENTITY_ICONS } from "@/components/shared/entity";

type Hit = {
  type: string;
  label: string;
  id: string;
  title: string;
  subtitle?: string | null;
  url: string;
};

type Row = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: any;
  run: () => void;
};

export function CommandPalette() {
  const t = useT();
  const router = useRouter();
  const { can } = useSession();
  const { paletteOpen, setPaletteOpen } = useUi();
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);

  const debounced = useDebounced(query, 180);

  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api.get<{ hits: Hit[] }>("/search", { q: debounced, limit_per_type: 4 }),
    enabled: paletteOpen && debounced.trim().length >= 2,
  });

  const rows = React.useMemo<Row[]>(() => {
    const out: Row[] = [];
    const navRows = NAV.flatMap((group) => group.items)
      .filter((item) => !item.permission || can(item.permission))
      .filter((item) => t(item.labelKey).toLowerCase().includes(query.toLowerCase()))
      .map((item) => ({
        id: `nav:${item.href}`,
        group: t("palette.navigation"),
        label: t(item.labelKey),
        hint: item.shortcut ? `G then ${item.shortcut.toUpperCase()}` : undefined,
        icon: item.icon,
        run: () => {
          router.push(item.href);
          setPaletteOpen(false);
        },
      }));

    const createRows = QUICK_CREATE.filter((item) => can(item.permission))
      .filter((item) => t(item.labelKey).toLowerCase().includes(query.toLowerCase()))
      .map((item) => ({
        id: `create:${item.key}`,
        group: t("palette.create"),
        label: t(item.labelKey),
        icon: item.icon,
        run: () => {
          router.push(item.href);
          setPaletteOpen(false);
        },
      }));

    const hitRows = (data?.hits ?? []).map((hit) => ({
      id: `hit:${hit.type}:${hit.id}`,
      group: t("palette.results"),
      label: hit.title,
      hint: hit.label,
      icon: ENTITY_ICONS[hit.type] ?? Search,
      run: () => {
        router.push(hit.url);
        setPaletteOpen(false);
      },
    }));

    out.push(...hitRows, ...navRows.slice(0, query ? 6 : 8), ...createRows.slice(0, query ? 4 : 8));
    return out;
  }, [data, query, can, router, setPaletteOpen, t]);

  React.useEffect(() => setActive(0), [query, data]);

  React.useEffect(() => {
    if (!paletteOpen) setQuery("");
  }, [paletteOpen]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, rows.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      rows[active]?.run();
    }
  };

  let lastGroup = "";

  return (
    <Dialog open={paletteOpen} onOpenChange={setPaletteOpen}>
      <DialogContent size="lg" className="overflow-hidden p-0" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-2 border-b border-border px-3.5 py-3">
          <Search className="h-4 w-4 shrink-0 text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("palette.placeholder")}
            className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
          />
          {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin text-faint" /> : null}
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {rows.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-faint">{t("common.empty")}</p>
          ) : (
            rows.map((row, index) => {
              const showGroup = row.group !== lastGroup;
              lastGroup = row.group;
              return (
                <React.Fragment key={row.id}>
                  {showGroup ? (
                    <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
                      {row.group}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={row.run}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-start text-[13px] transition-colors",
                      index === active ? "bg-accent-soft text-text" : "text-muted hover:bg-surface-2",
                    )}
                  >
                    <row.icon className="h-4 w-4 shrink-0 text-faint" />
                    <span className="min-w-0 flex-1 truncate">{row.label}</span>
                    {row.hint ? (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-faint">
                        {row.hint}
                      </span>
                    ) : null}
                    {index === active ? (
                      <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-accent" />
                    ) : null}
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-border px-3.5 py-2 text-[11px] text-faint">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> {t("palette.hint")}
          </span>
          <span className="ms-auto flex items-center gap-1">
            <Kbd>esc</Kbd> {t("action.close")}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function QuickCreate() {
  const t = useT();
  const router = useRouter();
  const { can } = useSession();
  const { quickCreateOpen, setQuickCreateOpen } = useUi();
  const items = QUICK_CREATE.filter((item) => can(item.permission));

  return (
    <Dialog open={quickCreateOpen} onOpenChange={setQuickCreateOpen}>
      <DialogContent size="sm" className="p-0">
        <div className="flex items-center gap-2 border-b border-border px-3.5 py-3">
          <Plus className="h-4 w-4 text-accent" />
          <span className="text-[14px] font-semibold tracking-tight">{t("action.create")}</span>
        </div>
        <div className="grid grid-cols-2 gap-1 p-2">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setQuickCreateOpen(false);
                router.push(item.href);
              }}
              className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-2.5 text-start text-[13px] transition-colors hover:border-accent/40 hover:bg-accent-soft"
            >
              <item.icon className="h-4 w-4 shrink-0 text-accent" />
              <span className="truncate">{t(item.labelKey)}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
