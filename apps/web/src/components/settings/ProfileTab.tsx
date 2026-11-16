"use client";

import { useUser } from "@clerk/nextjs";
import { useState, type FormEvent } from "react";
import { initialsOf } from "@/components/app/Avatar";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Field";
import { clerkErrorMessage } from "@/lib/clerk-errors";
import { fmtDate } from "@/lib/format";

const PROVIDERS = [
  { strategy: "oauth_google", provider: "google", name: "Google" },
  { strategy: "oauth_linkedin_oidc", provider: "linkedin_oidc", name: "LinkedIn" },
] as const;

/** Settings → Profile: name (Clerk), email (read-only), sign-in methods. */
export function ProfileTab() {
  const { isLoaded, user } = useUser();
  const [name, setName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);

  if (!isLoaded || !user) {
    return <div className="rounded-xl border border-border bg-surface p-6 text-sm text-text-2">Loading your profile…</div>;
  }

  const fullName = name ?? user.fullName ?? "";
  const email = user.primaryEmailAddress?.emailAddress ?? "";

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const [firstName = "", ...rest] = fullName.trim().split(/\s+/);
    setSaving(true);
    setMsg(null);
    try {
      await user!.update({ firstName, lastName: rest.join(" ") });
      setName(null);
      setMsg({ ok: true, text: "Saved." });
    } catch (err) {
      setMsg({ ok: false, text: clerkErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  async function connect(strategy: (typeof PROVIDERS)[number]["strategy"]) {
    setBusyProvider(strategy);
    try {
      const acct = await user!.createExternalAccount({ strategy, redirectUrl: window.location.href });
      const url = acct.verification?.externalVerificationRedirectURL;
      if (url) window.location.href = url.toString();
    } catch (err) {
      setMsg({ ok: false, text: clerkErrorMessage(err) });
      setBusyProvider(null);
    }
  }

  async function disconnect(id: string) {
    const acct = user!.externalAccounts.find((a) => a.id === id);
    if (!acct) return;
    setBusyProvider(id);
    try {
      await acct.destroy();
      await user!.reload();
    } catch (err) {
      setMsg({ ok: false, text: clerkErrorMessage(err) });
    } finally {
      setBusyProvider(null);
    }
  }

  const methodsCount = user.externalAccounts.length + (user.passwordEnabled ? 1 : 0);

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={saveName} className="flex flex-col gap-[18px] rounded-xl border border-border bg-surface p-6 max-sm:p-4">
        <div className="flex items-center gap-4">
          <span className="flex size-16 items-center justify-center rounded-full bg-surface-2 text-[22px] font-bold">{initialsOf(user.fullName ?? email)}</span>
          <div className="flex flex-col gap-0.5">
            <strong className="text-[17px]">{user.fullName || email}</strong>
            <span className="text-sm text-text-2">Member since {fmtDate(user.createdAt ?? new Date())}</span>
          </div>
        </div>
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))" }}>
          <Field label="Full name">
            <Input autoComplete="name" value={fullName} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email" help="Managed by your sign-in provider">
            <Input type="email" value={email} readOnly className="border-border bg-surface-2 text-text-2" />
          </Field>
        </div>
        <div className="flex items-center justify-end gap-3">
          {msg ? (
            <span role="status" className={msg.ok ? "text-sm text-good" : "text-sm text-crit"}>
              {msg.text}
            </span>
          ) : null}
          <Button type="submit" className="h-[42px] px-[18px] text-sm" disabled={saving || name === null || !fullName.trim()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>

      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <h2 className="m-0 px-6 py-[18px] font-display text-lg font-bold">Sign-in methods</h2>
        {PROVIDERS.map((p) => {
          const acct = user.externalAccounts.find((a) => a.provider === p.provider);
          return (
            <div key={p.provider} className="flex items-center justify-between gap-3 border-t border-border px-6 py-3.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <strong className="text-[15px]">{p.name}</strong>
                <span className="truncate text-[13px] text-text-2">{acct ? `Connected · ${acct.emailAddress}` : "Not connected"}</span>
              </div>
              {acct ? (
                <Button
                  variant="outline"
                  className="h-9 border-border-strong px-3.5 text-[13px]"
                  disabled={busyProvider === acct.id || methodsCount <= 1}
                  title={methodsCount <= 1 ? "Add another sign-in method first" : undefined}
                  onClick={() => void disconnect(acct.id)}
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="h-9 border-border-strong px-3.5 text-[13px] text-link"
                  disabled={busyProvider === p.strategy}
                  onClick={() => void connect(p.strategy)}
                >
                  Connect
                </Button>
              )}
            </div>
          );
        })}
        <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-3.5">
          <div className="flex flex-col gap-0.5">
            <strong className="text-[15px]">Email and password</strong>
            <span className="text-[13px] text-text-2">{user.passwordEnabled ? "Set up" : "No password set"}</span>
          </div>
          <Button variant="outline" className="h-9 border-border-strong px-3.5 text-[13px]" onClick={() => setPwOpen(true)}>
            {user.passwordEnabled ? "Change password" : "Set password"}
          </Button>
        </div>
      </section>

      <PasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} hasPassword={user.passwordEnabled} />
    </div>
  );
}

function PasswordDialog({ open, onClose, hasPassword }: { open: boolean; onClose: () => void; hasPassword: boolean }) {
  const { user } = useUser();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await user!.updatePassword({ currentPassword: hasPassword ? current : undefined, newPassword: next, signOutOfOtherSessions: true });
      setCurrent("");
      setNext("");
      onClose();
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={hasPassword ? "Change password" : "Set a password"}>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        {hasPassword ? (
          <Field label="Current password">
            <Input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
        ) : null}
        <Field label="New password" help="At least 8 characters. Other devices will be signed out.">
          <Input type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        {error ? <p role="alert" className="m-0 text-sm text-crit">{error}</p> : null}
        <div className="flex justify-end gap-2.5">
          <Button variant="ghost" className="h-11 px-4" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="h-11 px-5" disabled={busy || next.length < 8}>
            {busy ? "Saving…" : "Save password"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
