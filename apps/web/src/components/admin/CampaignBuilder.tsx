"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";
import { adminRoutes } from "./nav";
import { AdminCard } from "./ui";

/** Audience rules (prd.md §13.4). All selected rules must match. */
type RuleId = "signedInWithin" | "inactiveFor" | "minTailored" | "neverToppedUp" | "toppedUp" | "usedCode" | "joinedAfter" | "joinedBefore" | "balanceBelow";
const RULES: { id: RuleId; label: string; input?: "number" | "date"; def?: string }[] = [
  { id: "signedInWithin", label: "Signed in within N days", input: "number", def: "60" },
  { id: "inactiveFor", label: "No sign-in for N days", input: "number", def: "30" },
  { id: "minTailored", label: "Tailored N or more resumes", input: "number", def: "1" },
  { id: "neverToppedUp", label: "Never topped up" },
  { id: "toppedUp", label: "Topped up at least once" },
  { id: "usedCode", label: "Has used a code" },
  { id: "joinedAfter", label: "Joined after", input: "date" },
  { id: "joinedBefore", label: "Joined before", input: "date" },
  { id: "balanceBelow", label: "Balance below N credits", input: "number", def: "500" },
];

interface Feature {
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
}
const APP = typeof window === "undefined" ? "" : window.location.origin;
const BLANK: Feature = { title: "", body: "", ctaLabel: "Try it", ctaUrl: `${APP}/dashboard` };

function Step({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <AdminCard className="flex flex-col gap-3.5 p-5">
      <strong className="flex items-center gap-2.5 font-display text-lg">
        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-text-2">{n}</span>
        {title}
      </strong>
      {children}
    </AdminCard>
  );
}

/** IST wall-clock date + time → UTC Date. */
const istToDate = (date: string, time: string) => (date && time ? new Date(`${date}T${time}:00+05:30`) : null);

/**
 * Campaign composer (design/screens/AdminCampaign.dc.html, prd.md §13.4).
 * "New features" only (promo code is postponed). Exclusions — no consent,
 * unsubscribed, suppressed, suspended — are always applied server-side,
 * at audience freeze and again per send.
 */
export function CampaignBuilder() {
  const router = useRouter();
  const [rules, setRules] = useState<Partial<Record<RuleId, string>>>({ signedInWithin: "60" });
  const [subject, setSubject] = useState("Three new ways to get your resume interview-ready, {first_name}");
  const [preheader, setPreheader] = useState("New templates, score comparison and faster downloads.");
  const [headline, setHeadline] = useState("Your resume toolkit just got better");
  const [features, setFeatures] = useState<Feature[]>([{ ...BLANK, title: "Five ATS-friendly templates", body: "Pick the look; the content stays grounded in your own resume." }]);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [count, setCount] = useState<{ recipients: number; excluded: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const filters = useMemo(() => {
    const f: Record<string, unknown> = {};
    const n = (v?: string) => (v && Number(v) > 0 ? Math.floor(Number(v)) : undefined);
    if (rules.signedInWithin !== undefined) f.signedInWithinDays = n(rules.signedInWithin);
    if (rules.inactiveFor !== undefined) f.inactiveForDays = n(rules.inactiveFor);
    if (rules.minTailored !== undefined) f.minTailored = n(rules.minTailored);
    if (rules.neverToppedUp !== undefined) f.toppedUp = "never";
    if (rules.toppedUp !== undefined) f.toppedUp = "ever";
    if (rules.usedCode !== undefined) f.usedCode = true;
    if (rules.joinedAfter) f.joinedAfter = rules.joinedAfter;
    if (rules.joinedBefore) f.joinedBefore = rules.joinedBefore;
    if (rules.balanceBelow !== undefined) f.balanceBelow = n(rules.balanceBelow);
    return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined));
  }, [rules]);

  useEffect(() => {
    const t = setTimeout(() => {
      trpc.admin.emails.audienceCount
        .query({ filters })
        .then(setCount)
        .catch(() => setCount(null));
    }, 300);
    return () => clearTimeout(t);
  }, [filters]);

  const toggleRule = (r: (typeof RULES)[number]) =>
    setRules((s) => {
      const n = { ...s };
      if (r.id in n) delete n[r.id];
      else {
        n[r.id] = r.def ?? "";
        if (r.id === "neverToppedUp") delete n.toppedUp;
        if (r.id === "toppedUp") delete n.neverToppedUp;
      }
      return n;
    });

  const content = { headline, features };
  const scheduledAt = when === "later" ? istToDate(date, time) : null;
  const ready = subject.trim().length >= 3 && headline.trim().length >= 3 && features.every((f) => f.title.trim() && f.body.trim() && f.ctaLabel.trim() && /^https?:\/\//.test(f.ctaUrl)) && (when === "now" || !!scheduledAt);

  async function sendTest() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await trpc.admin.emails.sendTest.mutate({ subject, preheader, content });
      setMsg({ ok: true, text: `Test sent to ${r.to}.` });
    } catch (err) {
      setMsg({ ok: false, text: trpcErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await trpc.admin.emails.createCampaign.mutate({ subject, preheader, content, filters, scheduledAt });
      setConfirm(false);
      setMsg({ ok: true, text: r.status === "scheduled" ? "Campaign scheduled." : `Sending to ${r.recipients} recipients.` });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: trpcErrorMessage(err) });
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  const setFeature = (i: number, patch: Partial<Feature>) => setFeatures((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  return (
    <div className="flex flex-wrap items-start gap-5">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
        <Step n="01" title="Template">
          <div role="radiogroup" aria-label="Template" className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}>
            <div role="radio" aria-checked="true" className="flex flex-col gap-1 rounded-lg border-2 border-accent bg-accent-tint p-3.5">
              <strong className="text-[15px]">New features</strong>
              <span className="text-[13px] text-text-2">Product update with up to three highlights.</span>
            </div>
            <div role="radio" aria-checked="false" aria-disabled="true" className="flex flex-col gap-1 rounded-lg border border-border p-3.5 opacity-60">
              <strong className="text-[15px]">Promo code</strong>
              <span className="text-[13px] text-text-2">Postponed in the PRD.</span>
            </div>
          </div>
        </Step>

        <Step n="02" title="Audience">
          <span className="text-[13px] text-text-2">All selected rules must match. Users without consent for product updates, unsubscribed, suppressed or suspended are always left out.</span>
          {RULES.map((r) => {
            const on = r.id in rules;
            return (
              <div key={r.id} className={cn("flex flex-wrap items-center gap-3 rounded-lg p-3 text-sm", on ? "border-2 border-accent bg-accent-tint" : "border border-border")}>
                <label className="flex flex-1 cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={on} onChange={() => toggleRule(r)} className="size-4 accent-[var(--rp-accent)]" />
                  <span>{r.label}</span>
                </label>
                {on && r.input ? (
                  <Input
                    aria-label={r.label}
                    type={r.input}
                    inputMode={r.input === "number" ? "numeric" : undefined}
                    value={rules[r.id] ?? ""}
                    onChange={(e) => setRules((s) => ({ ...s, [r.id]: e.target.value }))}
                    className="h-9 w-[150px]"
                  />
                ) : null}
              </div>
            );
          })}
          <span className="text-sm" role="status">
            {count ? (
              <>
                <strong className="font-mono">{count.recipients.toLocaleString("en-IN")}</strong> recipients · {count.excluded.toLocaleString("en-IN")} left out by exclusions
              </>
            ) : (
              <span className="text-text-2">Counting…</span>
            )}
          </span>
        </Step>

        <Step n="03" title="Message">
          <Field label="Subject">
            <Input value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field label="Preheader">
            <Input value={preheader} maxLength={160} onChange={(e) => setPreheader(e.target.value)} />
          </Field>
          <Field label="Headline">
            <Input value={headline} maxLength={140} onChange={(e) => setHeadline(e.target.value)} />
          </Field>
          {features.map((f, i) => (
            <div key={i} className="flex flex-col gap-2.5 rounded-lg border border-border p-3.5">
              <div className="flex items-center justify-between">
                <strong className="text-sm">Feature {i + 1}</strong>
                {features.length > 1 ? (
                  <button type="button" className="text-[13px] font-semibold text-crit" onClick={() => setFeatures((fs) => fs.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                ) : null}
              </div>
              <Input aria-label="Title" placeholder="Title" value={f.title} maxLength={80} onChange={(e) => setFeature(i, { title: e.target.value })} />
              <Textarea aria-label="Body" placeholder="One or two sentences" rows={2} value={f.body} maxLength={400} onChange={(e) => setFeature(i, { body: e.target.value })} />
              <div className="grid grid-cols-[140px_1fr] gap-2.5 max-sm:grid-cols-1">
                <Input aria-label="Button label" value={f.ctaLabel} maxLength={30} onChange={(e) => setFeature(i, { ctaLabel: e.target.value })} />
                <Input aria-label="Button link" type="url" value={f.ctaUrl} onChange={(e) => setFeature(i, { ctaUrl: e.target.value })} />
              </div>
            </div>
          ))}
          {features.length < 3 ? (
            <Button variant="outline" className="h-9 self-start px-3 text-sm" onClick={() => setFeatures((fs) => [...fs, { ...BLANK }])}>
              Add a feature
            </Button>
          ) : null}
          <span className="text-[13px] text-text-2">
            Merge fields: <code className="font-mono text-xs">{"{first_name}"}</code> <code className="font-mono text-xs">{"{balance}"}</code>
          </span>
        </Step>

        <Step n="04" title="When">
          <div role="radiogroup" aria-label="When to send" className="flex gap-2">
            {(["now", "later"] as const).map((w) => (
              <button
                key={w}
                type="button"
                role="radio"
                aria-checked={when === w}
                onClick={() => setWhen(w)}
                className={cn("h-10 cursor-pointer rounded-md border px-4 text-sm font-semibold", when === w ? "border-text bg-text text-surface" : "border-border-strong bg-transparent text-text")}
              >
                {w === "now" ? "Send now" : "Schedule"}
              </button>
            ))}
          </div>
          {when === "later" ? (
            <div className="grid max-w-[420px] grid-cols-2 gap-3">
              <Field label="Date">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Time (IST)">
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </Field>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2.5 border-t border-border pt-4">
            <Button variant="outline" className="h-10 px-4 text-sm" disabled={!ready || busy} onClick={() => void sendTest()}>
              Send test to me
            </Button>
            <Button className="h-10 px-4 text-sm" disabled={!ready || busy || !count?.recipients} onClick={() => setConfirm(true)}>
              {when === "now" ? "Review and send" : "Review and schedule"}
            </Button>
          </div>
          {msg ? (
            <p role="status" className={cn("m-0 text-sm", msg.ok ? "text-good" : "text-crit")}>
              {msg.text}
            </p>
          ) : null}
        </Step>
      </div>

      <aside className="flex flex-[1_1_320px] flex-col gap-3 md:sticky md:top-24">
        <div className="flex items-center justify-between">
          <strong className="font-display text-base">Preview</strong>
          <Link href={adminRoutes.emails} className="text-[13px] font-semibold text-link">
            All templates
          </Link>
        </div>
        <div className="flex flex-col gap-1 rounded-t-xl border border-b-0 border-border bg-surface px-4 py-3">
          <strong className="truncate text-sm">{subject.replaceAll("{first_name}", "Asha") || "(no subject)"}</strong>
          <span className="truncate text-xs text-text-2">{preheader}</span>
        </div>
        <div className="-mt-3 flex flex-col gap-3 rounded-b-xl border border-border bg-white p-5 text-[#1A1A1A]">
          <span className="font-display text-base font-bold">
            Resume<span className="text-[#FF9900]">Pilot</span>
          </span>
          <span className="font-display text-lg leading-snug font-bold">{headline.replaceAll("{first_name}", "Asha")}</span>
          {features.map((f, i) => (
            <span key={i} className="flex flex-col gap-1 text-sm">
              <strong>{f.title || "Feature title"}</strong>
              <span>{f.body}</span>
              <span className="self-start rounded-md bg-[#FF9900] px-3 py-1.5 text-xs font-bold text-[#0F1B2A]">{f.ctaLabel}</span>
            </span>
          ))}
        </div>
        <span className="text-xs text-text-2">Shown with a sample user. Use “Send test to me” to see the real email.</span>
      </aside>

      <Dialog open={confirm} onClose={() => setConfirm(false)} title={when === "now" ? "Send this campaign?" : "Schedule this campaign?"} width={460}>
        <dl className="m-0 flex flex-col gap-2 text-sm">
          {[
            ["Template", "New features"],
            ["Subject", subject],
            ["Recipients", `${count?.recipients.toLocaleString("en-IN") ?? "?"} (frozen when sending starts)`],
            ["When", when === "now" ? "Now" : scheduledAt ? `${scheduledAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST` : "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-text-2">{k}</dt>
              <dd className="m-0 text-right">{v}</dd>
            </div>
          ))}
        </dl>
        <span className="text-[13px] text-text-2">This is written to the audit log under your name. Users who opt out while it sends are skipped.</span>
        <div className="flex justify-end gap-2.5 border-t border-border pt-4">
          <Button variant="ghost" className="h-11 px-4" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
          <Button className="h-11 px-5" disabled={busy} onClick={() => void send()}>
            {when === "now" ? "Send" : "Schedule"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
