"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/Switch";

const ROWS = [
  { key: "reminders", title: "Reminders", body: "A nudge when you haven't signed in for a while, with your balance." },
  { key: "productUpdates", title: "Product updates", body: "New features, a few times a year." },
] as const;

type Prefs = { reminders: boolean; productUpdates: boolean };

/** Per-category switches on the public unsubscribe page; the signed token authorises the change. */
export function UnsubscribePrefs({ token, initial }: { token: string; initial: Prefs }) {
  const [prefs, setPrefs] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function set(key: keyof Prefs, value: boolean) {
    setError(null);
    setPrefs((p) => ({ ...p, [key]: value }));
    const res = await fetch("/api/email/unsubscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token, [key]: value }) }).catch(() => null);
    if (!res?.ok) {
      setPrefs((p) => ({ ...p, [key]: !value }));
      setError("Couldn't save that. Please try again.");
      return;
    }
    setPrefs((await res.json()) as Prefs);
  }

  return (
    <div className="flex w-full max-w-[520px] flex-col rounded-xl border border-border bg-surface text-left">
      {ROWS.map((r, i) => (
        <div key={r.key} className={`flex items-center justify-between gap-4 px-5 py-4 ${i ? "border-t border-border" : ""}`}>
          <span className="flex flex-col gap-0.5">
            <strong className="text-[15px]">{r.title}</strong>
            <span className="text-[13px] text-text-2">{r.body}</span>
          </span>
          <Switch checked={prefs[r.key]} label={r.title} onChange={() => void set(r.key, !prefs[r.key])} />
        </div>
      ))}
      <p className="m-0 border-t border-border px-5 py-3 text-xs text-text-2">Account and payment emails are always on.</p>
      {error ? (
        <p role="alert" className="m-0 px-5 pb-3 text-sm text-crit">
          {error}
        </p>
      ) : null}
    </div>
  );
}
