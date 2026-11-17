"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { Switch } from "@/components/ui/Switch";
import { Tabs } from "@/components/ui/Tabs";
import { cn } from "@/lib/cn";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";
import { routes, SUPPORT_EMAIL } from "@/lib/routes";
import { TEMPLATES, usePreferencesStore, type TemplateName } from "@/stores/preferences-store";
import { useThemeStore, type ThemeMode } from "@/stores/theme-store";
import { ProfileTab } from "./ProfileTab";

type Tab = "profile" | "prefs" | "privacy";

const THEMES: { mode: ThemeMode; name: string; swatch: string }[] = [
  { mode: "light", name: "Light", swatch: "#F4F6F8" },
  { mode: "dark", name: "Dark", swatch: "#0A1119" },
  { mode: "system", name: "Match system", swatch: "linear-gradient(90deg, #F4F6F8 50%, #0A1119 50%)" },
];

/** Always-on account emails (prd.md §13.1), listed so users know what they'll still get. */
const ALWAYS_ON = [
  { h: "Account and payment emails", p: "Receipts, failed or pending payments, codes applied, referral rewards" },
];

/** Marketing categories (prd.md §13.5): opt-in, saved server-side. */
const MARKETING = [
  { key: "reminders", h: "Reminders", p: "A nudge if you haven't signed in for 30 days, with your balance" },
  { key: "productUpdates", h: "Product updates", p: "New templates and features, a few times a year" },
] as const;

const card = "rounded-xl border border-border bg-surface";

/** design/screens/Settings.dc.html — tab mirrored in ?tab=. */
export function SettingsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = raw === "prefs" || raw === "privacy" ? raw : "profile";
  const setTab = (t: Tab) => router.replace(t === "profile" ? pathname : `${pathname}?tab=${t}`, { scroll: false });

  return (
    <>
      <h1 className="m-0 font-display text-[30px] font-bold">Settings</h1>
      <Tabs<Tab>
        label="Settings"
        value={tab}
        onChange={setTab}
        options={[
          { value: "profile", label: "Profile" },
          { value: "prefs", label: "Preferences" },
          { value: "privacy", label: "Privacy and data" },
        ]}
      />
      {tab === "profile" ? <ProfileTab /> : null}
      {tab === "prefs" ? <PreferencesTab /> : null}
      {tab === "privacy" ? <PrivacyTab /> : null}
    </>
  );
}

function PreferencesTab() {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const template = usePreferencesStore((s) => s.defaultTemplate);
  const setTemplate = usePreferencesStore((s) => s.setDefaultTemplate);
  // Persisted values exist only client-side; avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="flex flex-col gap-5">
      <section className={cn(card, "flex flex-col gap-4 p-6 max-sm:p-4")}>
        <h2 className="m-0 font-display text-lg font-bold">Appearance</h2>
        <div role="radiogroup" aria-label="Theme" className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))" }}>
          {THEMES.map((t) => {
            const on = mounted && mode === t.mode;
            return (
              <label
                key={t.mode}
                className={cn("flex cursor-pointer flex-col gap-2.5 rounded-[10px] p-3", on ? "border-2 border-link" : "border border-border hover:border-border-strong")}
              >
                <span className="h-16 rounded-md border border-border" style={{ background: t.swatch }} />
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <input type="radio" name="theme" checked={on} onChange={() => setMode(t.mode)} className="accent-link" />
                  {t.name}
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section className={cn(card, "flex flex-col gap-4 p-6 max-sm:p-4")}>
        <h2 className="m-0 font-display text-lg font-bold">Resume defaults</h2>
        <label className="flex max-w-[320px] flex-col gap-1.5 text-sm font-semibold">
          Default template
          <Select value={mounted ? template : "Classic"} onChange={(e) => setTemplate(e.target.value as TemplateName)} className="font-medium">
            {TEMPLATES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
          <span className="text-xs font-normal text-text-2">Pre-selected when you tailor a new version. Saved on this device.</span>
        </label>
      </section>

      <section className={cn(card, "overflow-hidden")}>
        <h2 className="m-0 px-6 py-[18px] font-display text-lg font-bold">Email notifications</h2>
        <EmailPrefsRows />
      </section>
    </div>
  );
}

function PrivacyTab() {
  const retention = [
    "Uploaded files are deleted 30 days after upload.",
    "Your structured resume, versions and reports stay until you delete them.",
    "Your resume data is never used to train AI models.",
  ];
  const mail = (subject: string) => `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
  const hasEmail = SUPPORT_EMAIL.includes("@");
  return (
    <div className="flex flex-col gap-5">
      <section className={cn(card, "flex flex-col gap-3 p-6 max-sm:p-4")}>
        <h2 className="m-0 font-display text-lg font-bold">How we keep your data</h2>
        {retention.map((r) => (
          <span key={r} className="flex gap-2.5 text-sm leading-[1.55]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true" className="mt-0.5 flex-none text-good">
              <path d="M5 12l5 5 9-10" />
            </svg>
            {r}
          </span>
        ))}
      </section>
      <section className={cn(card, "flex flex-wrap items-center justify-between gap-4 p-6 max-sm:p-4")}>
        <div className="flex flex-col gap-1">
          <strong className="text-base">Download your data</strong>
          <span className="text-sm text-text-2">Resumes, versions, reports and credit history as a ZIP. Requests are handled by support.</span>
        </div>
        <ButtonLink href={hasEmail ? mail("Data download request") : routes.contact} variant="outline" className="h-[42px] px-4 text-sm">
          Request download
        </ButtonLink>
      </section>
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-crit-line bg-crit-bg p-6 max-sm:p-4">
        <div className="flex max-w-[520px] flex-col gap-1">
          <strong className="text-base text-crit">Delete account</strong>
          <span className="text-sm leading-[1.55] text-text">
            Permanently deletes your resumes, versions, reports and remaining credits. This can&apos;t be undone. Contact support and we&apos;ll
            confirm and complete it.
          </span>
        </div>
        <a
          href={hasEmail ? mail("Delete my account") : routes.contact}
          className="flex h-[42px] items-center rounded-md bg-crit px-4 text-sm font-bold text-white no-underline hover:brightness-105 dark:text-[#2A0B07]"
        >
          Delete account
        </a>
      </section>
    </div>
  );
}

function EmailPrefsRows() {
  const [prefs, setPrefs] = useState<{ reminders: boolean; productUpdates: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    trpc.emailPreferences.get
      .query()
      .then((p) => setPrefs({ reminders: p.reminders, productUpdates: p.productUpdates }))
      .catch(() => setError("Couldn't load your email choices."));
  }, []);

  async function toggle(key: "reminders" | "productUpdates") {
    if (!prefs) return;
    const value = !prefs[key];
    setPrefs({ ...prefs, [key]: value });
    setError(null);
    try {
      const p = await trpc.emailPreferences.set.mutate({ [key]: value });
      setPrefs({ reminders: p.reminders, productUpdates: p.productUpdates });
    } catch (err) {
      setPrefs((cur) => (cur ? { ...cur, [key]: !value } : cur));
      setError(trpcErrorMessage(err));
    }
  }

  return (
    <>
      {ALWAYS_ON.map((n) => (
        <div key={n.h} className="flex items-center justify-between gap-4 border-t border-border px-6 py-3.5">
          <span className="flex flex-col gap-0.5">
            <strong className="text-[15px]">{n.h}</strong>
            <span className="text-[13px] text-text-2">{n.p}</span>
          </span>
          <span className="text-[13px] font-semibold text-text-2">Always on</span>
        </div>
      ))}
      {MARKETING.map((n) => (
        <div key={n.key} className="flex items-center justify-between gap-4 border-t border-border px-6 py-3.5">
          <span className="flex flex-col gap-0.5">
            <strong className="text-[15px]">{n.h}</strong>
            <span className="text-[13px] text-text-2">{n.p}</span>
          </span>
          <Switch checked={prefs?.[n.key] ?? false} onChange={() => void toggle(n.key)} label={n.h} disabled={!prefs} />
        </div>
      ))}
      <p className="m-0 border-t border-border px-6 py-3 text-xs text-text-2" role={error ? "alert" : undefined}>
        {error ?? "Every marketing email also has a one-click unsubscribe link."}
      </p>
    </>
  );
}
