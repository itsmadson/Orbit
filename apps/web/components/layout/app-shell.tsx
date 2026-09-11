"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { CommandPalette, QuickCreate } from "@/components/layout/command-palette";
import { Shortcuts } from "@/components/layout/shortcuts";
import { useSession } from "@/components/providers";

export function AppShell({ children }: { children: React.ReactNode }) {
  const session = useSession();
  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <Sidebar unread={session.unread_notifications} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto pb-[4.5rem] lg:pb-0">
          <div className="mx-auto w-full max-w-[1500px] px-4 py-5 md:px-6">{children}</div>
        </main>
      </div>
      <MobileNav />
      <CommandPalette />
      <QuickCreate />
      <Shortcuts />
    </div>
  );
}
