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
        "hidden shrink-0 flex-col border-e border-border bg-surface/60 transition-[width] duration-200 lg:flex",
        sidebarCollapsed ? "w-[56px]" : "w-[228px]",
      )}
    >
      <div className="flex h-12 items-center gap-2 px-3">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <OrbitMark />
          {!sidebarCollapsed ? (
            <span className="truncate text-[14px] font-semibold tracking-tight">ORBIT</span>
          ) : null}
        </Link>
      </div>

      {!sidebarCollapsed ? (
        <div className="px-3 pb-2">
          <Button
            variant="primary"
            size="sm"
            className="w-full justify-start"
            onClick={() => setQuickCreateOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("action.create")}
          </Button>
        </div>
      ) : (
        <div className="px-2 pb-2">
          <Button variant="primary" size="icon-sm" onClick={() => setQuickCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
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
                  className="flex w-full items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-faint transition-colors hover:text-muted"
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
                        className={cn(
                          "group flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                          active
                            ? "bg-accent-soft text-accent"
                            : "text-muted hover:bg-surface-2 hover:text-text",
                          sidebarCollapsed && "justify-center px-0",
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!sidebarCollapsed ? <span className="truncate">{label}</span> : null}
                        {!sidebarCollapsed && item.href === "/inbox" && unread > 0 ? (
                          <span className="ms-auto rounded-full bg-accent-solid px-1.5 text-[10px] font-medium text-accent-fg">
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

      <div className="border-t border-border p-2">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-text",
            sidebarCollapsed && "justify-center px-0",
          )}
        >
          <Settings className="h-4 w-4" />
          {!sidebarCollapsed ? t("nav.settings") : null}
        </Link>
        <button
          type="button"
          onClick={toggleSidebar}
          className={cn(
            "mt-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-faint transition-colors hover:bg-surface-2 hover:text-text",
            sidebarCollapsed && "justify-center px-0",
          )}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4" />
              <span className="truncate">{company.name}</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

export function OrbitMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
      <circle cx="12" cy="12" r="3.2" fill="var(--accent)" />
      <ellipse
        cx="12"
        cy="12"
        rx="10"
        ry="5"
        stroke="var(--accent)"
        strokeOpacity="0.55"
        strokeWidth="1.4"
        transform="rotate(-28 12 12)"
      />
      <ellipse
        cx="12"
        cy="12"
        rx="10"
        ry="5"
        stroke="var(--text)"
        strokeOpacity="0.28"
        strokeWidth="1.2"
        transform="rotate(38 12 12)"
      />
    </svg>
  );
}
