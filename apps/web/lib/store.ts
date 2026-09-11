"use client";

import * as React from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

type UiState = {
  paletteOpen: boolean;
  quickCreateOpen: boolean;
  sidebarCollapsed: boolean;
  collapsedGroups: string[];
  setPaletteOpen: (open: boolean) => void;
  setQuickCreateOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  toggleGroup: (group: string) => void;
};

export const useUi = create<UiState>()(
  persist(
    (set, get) => ({
      paletteOpen: false,
      quickCreateOpen: false,
      sidebarCollapsed: false,
      collapsedGroups: [],
      setPaletteOpen: (open) => set({ paletteOpen: open }),
      setQuickCreateOpen: (open) => set({ quickCreateOpen: open }),
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      toggleGroup: (group) =>
        set({
          collapsedGroups: get().collapsedGroups.includes(group)
            ? get().collapsedGroups.filter((item) => item !== group)
            : [...get().collapsedGroups, group],
        }),
    }),
    {
      name: "orbit-ui",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        collapsedGroups: state.collapsedGroups,
      }),
      // Without this, persist reads localStorage during the first client render
      // while the server rendered the defaults — so once anyone collapsed the
      // sidebar, every page load afterwards failed hydration. Rehydration is
      // deferred to useHydrateUi(), after mount.
      skipHydration: true,
    },
  ),
);

/**
 * Applies the stored sidebar state once the client has mounted.
 *
 * Mount it once, at the shell. Before it runs the UI shows its defaults, which
 * is exactly what the server rendered — so hydration matches.
 */
export function useHydrateUi() {
  React.useEffect(() => {
    void useUi.persist.rehydrate();
  }, []);
}
