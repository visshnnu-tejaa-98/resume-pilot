import { REFERRAL_REWARD_CREDITS } from "@resume-pilot/credits";
import { listMyReferrals } from "@resume-pilot/services";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { initialsOf } from "@/components/app/Avatar";
import { AppMain, PageHeader } from "@/components/app/PageHeader";
import { ShareCode } from "@/components/referrals/ShareCode";
import { RouteCurve } from "@/components/site/RouteDecor";
import { Callout } from "@/components/ui/Callout";
import { Chip } from "@/components/ui/Chip";
import { fmtCredits, fmtDate } from "@/lib/format";
import { routes } from "@/lib/routes";
import { getDb } from "@/server/db";
import { getAppWallet, requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Referrals" };

/** design/screens/Referrals.dc.html */
export default async function ReferralsPage() {
  const { user } = await requireAppUser();
  const [wallet, friends, h] = await Promise.all([getAppWallet(user.id), listMyReferrals(getDb(), user.id), headers()]);
  const code = wallet.referralCode;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const link = code ? `${proto}://${host}${routes.signUp}?code=${encodeURIComponent(code)}` : "";
  const reward = fmtCredits(REFERRAL_REWARD_CREDITS);

  const steps = [
    { h: "Share your code", p: "Send your code or link to a friend who’s job hunting." },
    { h: "They sign up", p: `They enter ${code ?? "your code"} at sign-up or later in their wallet.` },
    { h: `They get ${reward} credits`, p: "One code per account, so it only works if they haven’t used another code." },
  ];

  return (
    <AppMain width="md" className="gap-6">
      <PageHeader title="Referrals" subtitle={`Friends who sign up with your code get ${reward} free credits.`} />

      <section className="relative flex flex-wrap items-center justify-between gap-6 overflow-hidden rounded-2xl bg-hero p-7 text-on-hero">
        <RouteCurve width={360} height={140} d="M0 130 C 110 130, 170 40, 260 44 S 350 18, 360 10" dash="7 9" className="-right-5 -bottom-5 opacity-45" />
        <div className="relative flex min-w-0 flex-col gap-2">
          <span className="text-sm text-on-hero-3">Your referral code</span>
          <span className="font-mono text-[38px] font-bold tracking-[0.08em] text-hero-accent max-sm:text-[28px]">{code ?? "—"}</span>
          {link ? <span className="truncate font-mono text-[13px] font-medium text-on-hero-2">{link.replace(/^https?:\/\//, "")}</span> : null}
        </div>
        {code ? <ShareCode code={code} link={link} /> : null}
      </section>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}>
        {steps.map((s, i) => (
          <div key={s.h} className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-5">
            <span className="flex size-8 items-center justify-center rounded-full bg-surface-2 font-mono text-[13px] font-semibold">{i + 1}</span>
            <strong className="text-base">{s.h}</strong>
            <span className="text-sm leading-[1.55] text-text-2">{s.p}</span>
          </div>
        ))}
      </div>

      <Callout tone="info" icon={<InfoIcon />}>
        When a friend joins with your code you also earn {reward} credits. New referrals may be reviewed before your credits are added.
      </Callout>

      <section className="overflow-hidden rounded-[14px] border border-border bg-surface">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="m-0 font-display text-lg font-bold">Friends who joined</h2>
          <span className="font-mono text-sm font-semibold text-text-2">{friends.length}</span>
        </div>
        {friends.length === 0 ? (
          <p className="m-0 border-t border-border px-5 py-4 text-sm text-text-2">No one has used your code yet.</p>
        ) : (
          friends.map((f) => (
            <div key={f.id} className="flex items-center gap-3.5 border-t border-border px-5 py-3.5">
              <span className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-[13px] font-semibold">
                {initialsOf(f.friend)}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold">{f.friend}</span>
                <span className="text-xs text-text-2">Joined {fmtDate(f.joinedAt)}</span>
              </div>
              <Chip tone={f.referrerStatus === "granted" ? "good" : f.referrerStatus === "held" ? "info" : "neutral"} pill className="px-[9px] py-[3px] text-xs font-semibold">
                {f.referrerStatus === "granted"
                  ? `You got ${fmtCredits(f.creditsToReferrer)} credits`
                  : f.referrerStatus === "held"
                    ? "Under review"
                    : `Got ${fmtCredits(f.creditsToFriend)} credits`}
              </Chip>
            </div>
          ))
        )}
      </section>
    </AppMain>
  );
}

function InfoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.01" />
    </svg>
  );
}
