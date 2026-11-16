import type { ChipTone } from "@/components/ui/Chip";

/** Upload pipeline states (packages/database resume_status enum). */
export type ResumeStatus = "uploaded" | "processing" | "processed" | "failed" | "structuring" | "ready";

export function resumeStatusChip(status: ResumeStatus): { label: string; tone: ChipTone } {
  switch (status) {
    case "ready":
      return { label: "Ready", tone: "good" };
    case "failed":
      return { label: "Couldn’t read", tone: "crit" };
    default:
      return { label: "Extracting", tone: "info" };
  }
}

export const isResumeInProgress = (s: ResumeStatus) => s !== "ready" && s !== "failed";

const ACTION_LABELS: Record<string, string> = {
  jd_analysis: "Job analysis",
  generation: "Generation",
  ats_scoring: "ATS score",
};

export const aiActionLabel = (action: string) => ACTION_LABELS[action] ?? action.replace(/_/g, " ");

/** Human label for a credit-ledger row (dashboard activity, wallet history). */
export function ledgerLabel(entry: { type: string; action: string | null; note: string | null }): string {
  const base = (() => {
    switch (entry.type) {
      case "purchase":
        return "Wallet top-up";
      case "capture":
        return entry.action ? aiActionLabel(entry.action) : "AI action";
      case "refund":
        return "Refund";
      case "admin_adjustment":
        return "Adjustment";
      case "coupon_credit":
        return "Coupon";
      case "referral_credit":
        return "Referral";
      default:
        return entry.type;
    }
  })();
  return entry.note ? `${base} · ${entry.note}` : base;
}

/** ATS score chip for a version: good ≥ 70, outdated = warn, unscored = neutral. */
export function scoreChip(score: number | null, outdated: boolean): { label: string; tone: ChipTone } {
  if (score === null) return { label: "Not scored", tone: "neutral" };
  if (outdated) return { label: `${score} · outdated`, tone: "warn" };
  return { label: String(score), tone: score >= 70 ? "good" : "warn" };
}

/** File-type tile text ("PDF", "DOCX", ...). */
export const formatTag = (format: string) => (format === "jpeg" ? "JPG" : format.toUpperCase());
