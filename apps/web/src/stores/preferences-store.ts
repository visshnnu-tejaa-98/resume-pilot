import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const TEMPLATES = ["Classic", "Modern", "Minimal", "Professional", "Technical"] as const;
export type TemplateName = (typeof TEMPLATES)[number];

interface PreferencesState {
  /** Pre-selected template for new tailored versions (Generate screen). */
  defaultTemplate: TemplateName;
  setDefaultTemplate: (t: TemplateName) => void;
}

/**
 * Per-device UI preferences. Nothing here is a business rule; it only
 * pre-fills choices the user can still change, so browser storage is fine.
 */
export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      defaultTemplate: "Classic",
      setDefaultTemplate: (defaultTemplate) => set({ defaultTemplate }),
    }),
    {
      name: "rp-preferences",
      version: 1,
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
