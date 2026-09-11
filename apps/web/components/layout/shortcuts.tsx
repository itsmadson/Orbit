"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { NAV } from "@/lib/nav";
import { useUi } from "@/lib/store";

/**
 * Global keyboard layer: Cmd/Ctrl+K for the palette, C for quick create and
 * Linear-style "G then X" navigation chords.
 */
export function Shortcuts() {
  const router = useRouter();
  const { setPaletteOpen, setQuickCreateOpen } = useUi();
  const pending = React.useRef<string | null>(null);

  React.useEffect(() => {
    const targets = NAV.flatMap((group) => group.items).filter((item) => item.shortcut);

    const handler = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement | null;
      const typing =
        element &&
        (element.tagName === "INPUT" ||
          element.tagName === "TEXTAREA" ||
          element.isContentEditable);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      if (pending.current === "g") {
        pending.current = null;
        const match = targets.find((item) => item.shortcut === event.key.toLowerCase());
        if (match) {
          event.preventDefault();
          router.push(match.href);
        }
        return;
      }
      if (event.key.toLowerCase() === "g") {
        pending.current = "g";
        setTimeout(() => (pending.current = null), 1200);
        return;
      }
      if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        setQuickCreateOpen(true);
      }
      if (event.key === "/") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router, setPaletteOpen, setQuickCreateOpen]);

  return null;
}
