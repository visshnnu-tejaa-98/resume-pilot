"use client";

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@resume-pilot/trpc";
import { JD_TEXT_MAX, JD_TEXT_MIN, jdInputSchema } from "@resume-pilot/validators";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import * as styles from "@/components/auth-styles";

const client = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: "/api/trpc" })] });
const CRIT = "var(--color-error, #B42318)";

export interface JdFormValues {
  text: string;
  companyName: string;
  jobTitle: string;
  postingUrl: string;
}

/**
 * New / edit job description — prd.md §7.1. The 200–30,000 limit (after
 * trimming) is checked here with the same schema the server uses; the
 * server and the DB check again. Editing saves a new JD (`jds.revise`).
 */
export function JdForm({ jdId, initial }: { jdId?: string; initial?: JdFormValues }) {
  const router = useRouter();
  const [v, setV] = useState<JdFormValues>(
    initial ?? { text: "", companyName: "", jobTitle: "", postingUrl: "" },
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const len = v.text.trim().length;
  const over = len > JD_TEXT_MAX;
  const short = len < JD_TEXT_MIN;
  const hint = over
    ? `Over the limit by ${(len - JD_TEXT_MAX).toLocaleString("en-IN")} characters. Remove boilerplate like benefits or company history.`
    : short
      ? `At least ${JD_TEXT_MIN} characters needed (${JD_TEXT_MIN - len} more).`
      : "Looks good.";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = jdInputSchema.safeParse(v);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the form.");
      return;
    }
    setSaving(true);
    try {
      const saved = jdId
        ? await client.jds.revise.mutate({ jdId, ...v })
        : await client.jds.create.mutate(v);
      router.push(`/jobs/${saved.id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "Couldn't save. Please try again.");
      setSaving(false);
    }
  }

  const set = (k: keyof JdFormValues) => (e: { target: { value: string } }) =>
    setV((s) => ({ ...s, [k]: e.target.value }));

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <label style={styles.label}>
          Company (optional)
          <input value={v.companyName} onChange={set("companyName")} maxLength={200} style={styles.input} />
        </label>
        <label style={styles.label}>
          Job title (optional)
          <input value={v.jobTitle} onChange={set("jobTitle")} maxLength={200} style={styles.input} />
        </label>
      </div>
      <label style={styles.label}>
        Posting link (optional, saved for your reference)
        <input
          type="url"
          value={v.postingUrl}
          onChange={set("postingUrl")}
          placeholder="https://"
          maxLength={2000}
          style={styles.input}
        />
      </label>
      <label style={styles.label}>
        Job description
        <textarea
          value={v.text}
          onChange={set("text")}
          placeholder="Paste the whole posting: responsibilities, requirements and nice-to-haves."
          style={{
            ...styles.input,
            height: "auto",
            minHeight: 320,
            padding: 12,
            resize: "vertical",
            ...(over ? { border: `2px solid ${CRIT}` } : {}),
          }}
        />
        <span
          className="flex justify-between gap-3"
          style={{ fontSize: 13, fontWeight: 400, color: over ? CRIT : "var(--color-text-secondary)" }}
        >
          <span>{hint}</span>
          <span>
            {len.toLocaleString("en-IN")} / {JD_TEXT_MAX.toLocaleString("en-IN")}
          </span>
        </span>
      </label>
      {jdId && (
        <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
          Saving changes creates a new job description. Resumes already tailored to this one keep it.
        </span>
      )}
      {error && <p style={styles.errorText}>{error}</p>}
      <button type="submit" disabled={saving || over || short} style={{ ...styles.primaryButton, opacity: over || short ? 0.5 : 1 }}>
        {saving ? "Saving…" : jdId ? "Save changes" : "Save job"}
      </button>
    </form>
  );
}
