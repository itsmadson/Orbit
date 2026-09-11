"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Plus, Settings } from "lucide-react";
import { NAV } from "@/lib/nav";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useUi } from "@/lib/store";
import { useSession } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/misc";

export function Sidebar({ unread }: { unread: number }) {
  const t = useT();
  const pathname = usePathname();
  const { can, company } = useSession();
  const { sidebarCollapsed, toggleSidebar, collapsedGroups, toggleGroup, setQuickCreateOpen } =
    useUi();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside
      className={cn(
        "rail hidden shrink-0 flex-col overflow-hidden transition-[width] duration-200 lg:flex",
        sidebarCollapsed ? "w-[64px]" : "w-[232px]",
      )}
    >
      <div className={cn("flex h-14 items-center gap-2.5 px-3.5", sidebarCollapsed && "justify-center px-0")}>
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <span className="tile h-8 w-8">
            <OrbitMark size={18} mono />
          </span>
          {!sidebarCollapsed ? (
            <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">ORBIT</span>
          ) : null}
        </Link>
      </div>

      {!sidebarCollapsed ? (
        <div className="px-3 pb-3">
          <Button
            variant="primary"
            size="sm"
            className="h-9 w-full justify-center rounded-xl"
            onClick={() => setQuickCreateOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("action.create")}
          </Button>
        </div>
      ) : (
        <div className="flex justify-center px-2 pb-3">
          <Button
            variant="primary"
            className="h-9 w-9 rounded-xl p-0"
            onClick={() => setQuickCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}

      <nav className="no-scrollbar flex-1 overflow-y-auto px-2 pb-4">
        {NAV.filter((group) => group.key !== "bottom").map((group) => {
          const items = group.items.filter((item) => !item.permission || can(item.permission));
          if (!items.length) return null;
          const collapsed = collapsedGroups.includes(group.key);
          return (
            <div key={group.key} className="mb-2">
              {group.labelKey && !sidebarCollapsed ? (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="mb-1 flex w-full items-center gap-1 rounded-lg px-2 py-1 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint transition-colors hover:bg-surface-2 hover:text-muted"
                >
                  <ChevronDown
                    className={cn("h-3 w-3 transition-transform", collapsed && "-rotate-90 rtl:rotate-90")}
                  />
                  {t(group.labelKey)}
                </button>
              ) : null}
              {!collapsed || sidebarCollapsed ? (
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const active = isActive(item.href);
                    const label = t(item.labelKey);
                    const link = (
                      <Link
                        href={item.href}
                        data-active={active}
                        className={cn(
                          "nav-row group flex items-center gap-2.5 rounded-xl px-1.5 py-1 text-[13px] transition-colors",
                          active
                            ? "bg-elevated font-medium text-text shadow-[var(--shadow-panel)]"
                            : "text-muted hover:bg-surface-2 hover:text-text",
                          sidebarCollapsed && "justify-center px-0",
                        )}
                      >
                        <span className="nav-tile">
                          <item.icon className="h-[15px] w-[15px] shrink-0" />
                        </span>
                        {!sidebarCollapsed ? <span className="truncate">{label}</span> : null}
                        {!sidebarCollapsed && item.href === "/inbox" && unread > 0 ? (
                          <span className="ms-auto rounded-full bg-accent-solid px-1.5 text-[10px] font-medium text-accent-fg tnum">
                            {unread}
                          </span>
                        ) : null}
                      </Link>
                    );
                    return (
                      <li key={item.href}>
                        {sidebarCollapsed ? (
                          <Tooltip content={label} side="right">
                            {link}
                          </Tooltip>
                        ) : (
                          link
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border p-2.5">
        <Link
          href="/settings"
          className={cn(
            "nav-row flex items-center gap-2.5 rounded-xl px-1.5 py-1 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-text",
            sidebarCollapsed && "justify-center px-0",
          )}
        >
          <span className="nav-tile">
            <Settings className="h-[15px] w-[15px]" />
          </span>
          {!sidebarCollapsed ? t("nav.settings") : null}
        </Link>
        <button
          type="button"
          onClick={toggleSidebar}
          className={cn(
            "nav-row mt-0.5 flex w-full items-center gap-2.5 rounded-xl px-1.5 py-1 text-[12px] text-faint transition-colors hover:bg-surface-2 hover:text-text",
            sidebarCollapsed && "justify-center px-0",
          )}
        >
          <span className="nav-tile">
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-[15px] w-[15px]" />
            ) : (
              <PanelLeftClose className="h-[15px] w-[15px]" />
            )}
          </span>
          {!sidebarCollapsed ? <span className="truncate">{company.name}</span> : null}
        </button>
      </div>
    </aside>
  );
}

/**
 * The product mark: a ringed planet with a moon on the ring.
 *
 * The ring is drawn in two halves around the planet so it reads as passing
 * behind and in front — which is what keeps the silhouette legible down to
 * favicon size, where a thin wire-frame orbit turns to mush.
 * `mono` renders it in the current text colour, for use on the accent tile.
 */
export function OrbitMark({ size = 22, mono = false }: { size?: number; mono?: boolean }) {
  const back = mono ? "currentColor" : "var(--accent)";
  const front = mono ? "currentColor" : "var(--accent-hot)";
  const body = mono ? "currentColor" : "var(--accent)";
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className="shrink-0">
      <g transform="rotate(-24 24 24)">
        <path
          d="M6.5 24A17.5 7.5 0 0 1 41.5 24"
          stroke={back}
          strokeOpacity={mono ? 0.5 : 0.45}
          strokeWidth="3"
        />
      </g>
      <circle cx="24" cy="24" r="10.5" fill={body} />
      <g transform="rotate(-24 24 24)">
        <path
          d="M41.5 24A17.5 7.5 0 0 1 6.5 24"
          stroke={front}
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeOpacity={mono ? 0.95 : 1}
        />
        <circle cx="41.5" cy="24" r="3.6" fill={front} />
      </g>
    </svg>
  );
}
