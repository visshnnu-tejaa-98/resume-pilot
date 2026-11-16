import { create } from "zustand";

interface AppShellState {
  /** Mobile/tablet: whether the sidebar drawer is open. Desktop always shows it. */
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
}

/** UI state shared by the app top bar (menu button) and sidebar (drawer). */
export const useAppShellStore = create<AppShellState>()((set) => ({
  sidebarOpen: false,
  openSidebar: () => set({ sidebarOpen: true }),
  closeSidebar: () => set({ sidebarOpen: false }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
