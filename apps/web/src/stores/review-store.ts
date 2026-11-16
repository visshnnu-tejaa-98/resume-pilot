import { collectIds, IdAllocator, type ExtractionMeta, type Resume } from "@resume-pilot/validators/resume";
import { create } from "zustand";

/**
 * Editor state for the original-resume review screen (prd.md §5.3, §8.6).
 *
 * - `flags` come from the server (extraction confidence per field path).
 * - A flag counts as handled once the field is edited (`touched`) or the
 *   user clicks "Looks right" (`marked`). `marked` paths are sent with the
 *   next save so the server records them as reviewed.
 * - The server is still the gate: `resumes.readiness` re-checks before
 *   the user can continue.
 */
interface ReviewState {
  resumeId: string | null;
  resume: Resume | null;
  flags: ExtractionMeta;
  marked: Set<string>;
  touched: Set<string>;
  dirty: boolean;
  savedAt: Date | null;
  alloc: IdAllocator | null;

  load: (resumeId: string, resume: Resume, flags: ExtractionMeta) => void;
  /** Apply an edit to a draft copy; `path` marks that field as reviewed-by-edit. */
  update: (mutate: (draft: Resume) => void, path?: string) => void;
  confirm: (path: string) => void;
  saved: (flags: ExtractionMeta) => void;
  reset: () => void;
}

const initial = {
  resumeId: null,
  resume: null,
  flags: {},
  marked: new Set<string>(),
  touched: new Set<string>(),
  dirty: false,
  savedAt: null,
  alloc: null,
};

export const useReviewStore = create<ReviewState>()((set) => ({
  ...initial,
  load: (resumeId, resume, flags) =>
    set({ ...initial, resumeId, resume, flags, alloc: new IdAllocator(collectIds(resume)), marked: new Set(), touched: new Set() }),
  update: (mutate, path) =>
    set((s) => {
      if (!s.resume) return s;
      const next = structuredClone(s.resume);
      mutate(next);
      return {
        resume: next,
        dirty: true,
        touched: path ? new Set(s.touched).add(path) : s.touched,
      };
    }),
  confirm: (path) => set((s) => ({ marked: new Set(s.marked).add(path) })),
  saved: (flags) => set({ flags, marked: new Set(), touched: new Set(), dirty: false, savedAt: new Date() }),
  reset: () => set({ ...initial, marked: new Set(), touched: new Set() }),
}));

/** A flag that still needs attention: not reviewed on the server, not edited or confirmed here. */
export function isFlagOpen(s: Pick<ReviewState, "flags" | "marked" | "touched">, path: string): boolean {
  const f = s.flags[path];
  return !!f && !f.reviewed && !s.marked.has(path) && !s.touched.has(path);
}

/** Open low-confidence flags — these block Continue. */
export function openLowPaths(s: Pick<ReviewState, "flags" | "marked" | "touched">): string[] {
  return Object.keys(s.flags).filter((p) => s.flags[p]!.confidence === "low" && isFlagOpen(s, p));
}

/** Selector hook: open low-confidence paths (re-computed when flags/edits change). */
export function useOpenLow(): string[] {
  const flags = useReviewStore((s) => s.flags);
  const marked = useReviewStore((s) => s.marked);
  const touched = useReviewStore((s) => s.touched);
  return openLowPaths({ flags, marked, touched });
}
