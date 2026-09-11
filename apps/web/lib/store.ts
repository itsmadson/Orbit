"use client";

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
    },
  ),
);
