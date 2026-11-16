"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { adminRoutes } from "./nav";
import { AdminCard, NotWiredNote } from "./ui";

type Audience = "active" | "inactive" | "never_paid" | "joined_recent";

const AUDIENCE: { id: Audience; label: string }[] = [
  { id: "active", label: "Signed in within the last 60 days" },
  { id: "inactive", label: "No sign-in for 30+ days" },
  { id: "never_paid", label: "Never topped up the wallet" },
  { id: "joined_recent", label: "Joined in the last 30 days" },
];

const FEATURE_LINES = ["Five ATS-friendly templates", "Side-by-side score comparison", "Faster PDF downloads"];

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

/**
 * Campaign composer (design/screens/AdminCampaign.dc.html). The
 * promo-code template is postponed in the PRD, so only "New features" is
 * offered. Sending needs the campaign worker (tasks/todo/m11-email):
 * until then the form is a draft preview and Send is disabled.
 */
export function CampaignBuilder() {
  const [audience, setAudience] = useState<Set<Audience>>(new Set(["active"]));
  const [subject, setSubject] = useState("Three new ways to get your resume interview-ready");
  const [preheader, setPreheader] = useState("New templates, score comparison and faster downloads.");
  const [when, setWhen] = useState<"now" | "later">("now");

  const toggle = (id: Audience) =>
    setAudience((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

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
          <span className="text-[13px] text-text-2">All selected rules must match. Users who opted out of marketing are always left out.</span>
          {AUDIENCE.map((a) => {
            const on = audience.has(a.id);
            return (
              <label key={a.id} className={cn("flex cursor-pointer items-center gap-3 rounded-lg p-3 text-sm", on ? "border-2 border-accent bg-accent-tint" : "border border-border")}>
                <input type="checkbox" checked={on} onChange={() => toggle(a.id)} className="size-4 accent-[var(--rp-accent)]" />
                <span className="flex-1">{a.label}</span>
              </label>
            );
          })}
          <span className="text-[13px] text-text-2">Recipient counts appear here once audience queries are built.</span>
        </Step>

        <Step n="03" title="Message">
          <Field label="Subject">
            <Input value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field label="Preheader">
            <Input value={preheader} maxLength={160} onChange={(e) => setPreheader(e.target.value)} />
          </Field>
          <span className="text-[13px] text-text-2">
            Merge fields: <code className="font-mono text-xs">{"{first_name}"}</code>
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
                className={cn(
                  "h-10 cursor-pointer rounded-md border px-4 text-sm font-semibold",
                  when === w ? "border-text bg-text text-surface" : "border-border-strong bg-transparent text-text",
                )}
              >
                {w === "now" ? "Send now" : "Schedule"}
              </button>
            ))}
          </div>
          {when === "later" ? (
            <div className="grid max-w-[420px] grid-cols-2 gap-3">
              <Field label="Date">
                <Input type="date" />
              </Field>
              <Field label="Time (IST)">
                <Input type="time" />
              </Field>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2.5 border-t border-border pt-4">
            <Button variant="outline" className="h-10 px-4 text-sm" disabled>
              Send test to me
            </Button>
            <Button className="h-10 px-4 text-sm" disabled>
              {when === "now" ? "Review and send" : "Review and schedule"}
            </Button>
          </div>
          <NotWiredNote>
            Campaign sending arrives with the email work (m11). When it does, sending asks for confirmation and is written to the audit log
            under your name.
          </NotWiredNote>
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
          <strong className="truncate text-sm">{subject || "(no subject)"}</strong>
          <span className="truncate text-xs text-text-2">{preheader}</span>
        </div>
        <div className="-mt-3 flex flex-col gap-3 rounded-b-xl border border-border bg-white p-5 text-[#1A1A1A]">
          <span className="font-display text-base font-bold">
            Resume<span className="text-[#FF9900]">Pilot</span>
          </span>
          <span className="font-display text-lg leading-snug font-bold">Three new ways to get your resume interview-ready</span>
          {FEATURE_LINES.map((l) => (
            <span key={l} className="text-sm">
              • {l}
            </span>
          ))}
          <span className="self-start rounded-md bg-[#FF9900] px-4 py-2.5 text-sm font-bold text-[#0F1B2A]">Try them now</span>
        </div>
        <span className="text-xs text-text-2">Shown with a sample user.</span>
      </aside>
    </div>
  );
}
