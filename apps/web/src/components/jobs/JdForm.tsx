"use client";

import { JD_TEXT_MAX, JD_TEXT_MIN, jdInputSchema } from "@resume-pilot/validators";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { appRoutes, routes } from "@/lib/routes";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";

export interface JdFormValues {
  text: string;
  companyName: string;
  jobTitle: string;
  postingUrl: string;
}

const EMPTY: JdFormValues = { text: "", companyName: "", jobTitle: "", postingUrl: "" };

/**
 * New / edit job description (design/screens/JobNew.dc.html, prd.md §7.1).
 * The 200–30,000 limit is checked with the same schema the server uses;
 * the server and DB check again. Editing saves a new JD (`jds.revise`)
 * so versions built from the old one keep it.
 */
export function JdForm({ jdId, initial }: { jdId?: string; initial?: JdFormValues }) {
  const router = useRouter();
  const [v, setV] = useState<JdFormValues>(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<null | "save" | "tailor">(null);

  const len = v.text.trim().length;
  const over = len > JD_TEXT_MAX;
  const short = len < JD_TEXT_MIN;
  const hint = over
    ? `Too long. Trim it to ${JD_TEXT_MAX.toLocaleString("en-IN")} characters or fewer.`
    : short
      ? `Add at least ${JD_TEXT_MIN} characters${len > 0 ? ` (${JD_TEXT_MIN - len} more)` : ""}.`
      : "Looks good. Include requirements and responsibilities.";

  async function save(intent: "save" | "tailor") {
    setError(null);
    const parsed = jdInputSchema.safeParse(v);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the form.");
      return;
    }
    setSaving(intent);
    try {
      const saved = jdId ? await trpc.jds.revise.mutate({ jdId, ...v }) : await trpc.jds.create.mutate(v);
      router.push(intent === "tailor" ? `${routes.generate}?jd=${saved.id}` : appRoutes.job(saved.id));
      router.refresh();
    } catch (err) {
      setError(trpcErrorMessage(err, "Couldn't save. Please try again."));
      setSaving(null);
    }
  }

  const set = (k: keyof JdFormValues) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void save("save");
      }}
      className="flex min-w-0 flex-[999_1_520px] flex-col gap-[18px] rounded-xl border border-border bg-surface p-6 max-sm:p-4"
    >
      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}>
        <Field label="Company" hint="(optional)">
          <Input value={v.companyName} onChange={set("companyName")} maxLength={200} />
        </Field>
        <Field label="Job title" hint="(optional)">
          <Input value={v.jobTitle} onChange={set("jobTitle")} maxLength={200} />
        </Field>
      </div>
      <Field label="Posting link" hint="(optional, saved for your reference)">
        <Input type="url" value={v.postingUrl} onChange={set("postingUrl")} placeholder="https://" maxLength={2000} />
      </Field>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Job description
        <Textarea
          rows={12}
          value={v.text}
          onChange={set("text")}
          invalid={over}
          placeholder="Paste the whole posting: responsibilities, requirements and nice-to-haves."
          className="resize-y leading-[1.6]"
          aria-describedby="jd-count"
        />
        <span id="jd-count" className="flex justify-between gap-3 text-[13px] font-normal">
          <span className={over ? "text-crit" : "text-text-2"}>{hint}</span>
          <span className={cn("font-mono whitespace-nowrap", over ? "text-crit" : "text-text-2")}>
            {len.toLocaleString("en-IN")} / {JD_TEXT_MAX.toLocaleString("en-IN")}
          </span>
        </span>
      </label>
      {jdId ? (
        <span className="text-[13px] text-text-2">
          Saving changes creates a new job description. Resumes already tailored to this one keep it.
        </span>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 text-sm text-crit">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2.5 border-t border-border pt-[18px]">
        <Button type="submit" variant="outline" className="h-11 px-[18px]" disabled={!!saving || over || short}>
          {saving === "save" ? "Saving…" : jdId ? "Save as new job" : "Save job"}
        </Button>
        <Button className="h-11 px-5" disabled={!!saving || over || short} onClick={() => void save("tailor")}>
          {saving === "tailor" ? "Saving…" : "Save and tailor resume"}
        </Button>
      </div>
    </form>
  );
}

/** Right-hand tips column next to the form. */
export function JdFormAside() {
  const tips = [
    "Include the requirements and nice-to-haves",
    "Keep the responsibilities section",
    "Remove unrelated text like cookie notices",
  ];
  return (
    <aside className="flex flex-[1_1_260px] flex-col gap-3.5">
      <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-[18px]">
        <strong className="text-[15px]">For the best match</strong>
        {tips.map((t) => (
          <span key={t} className="flex gap-2 text-sm leading-normal text-text-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true" className="mt-[3px] flex-none text-good">
              <path d="M5 12l5 5 9-10" />
            </svg>
            {t}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-1.5 rounded-xl border border-info-line bg-info-bg p-[18px]">
        <strong className="text-sm">When does this cost credits?</strong>
        <span className="text-sm leading-[1.55] text-text-2">
          Saving is free. The job is analysed the first time you tailor or score against it, after you confirm the estimate.
        </span>
      </div>
    </aside>
  );
}
