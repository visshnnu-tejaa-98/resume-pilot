import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ThemeMode = "system" | "light" | "dark";

/** localStorage key — also read by the pre-hydration script in app/layout.tsx. */
export const THEME_STORAGE_KEY = "rp-theme";

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

/**
 * Light / dark / follow-the-OS preference. The store only holds the choice;
 * <ThemeSync /> applies it as `data-theme` on <html>, which globals.css
 * keys the token swap off.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: "system",
      setMode: (mode) => set({ mode }),
    }),
    {
      name: THEME_STORAGE_KEY,
      version: 1,
      // Private windows / blocked storage throw — fall back to in-memory.
      storage: createJSONStorage(() => {
        try {
          return window.localStorage;
        } catch {
          return undefined as unknown as Storage;
        }
      }),
    },
  ),
);

/** Inline script run before paint so a forced theme never flashes. */
export const themeBootScript = `(function(){try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})||"null");var m=s&&s.state&&s.state.mode;if(m==="light"||m==="dark")document.documentElement.dataset.theme=m;}catch(e){}})();`;
