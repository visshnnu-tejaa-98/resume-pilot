"use client";

import { useClerk } from "@clerk/nextjs";
import { LogoMark } from "@/components/brand/Logo";
import { Button, ButtonLink } from "@/components/ui/Button";
import { routes } from "@/lib/routes";

/** design/screens/Suspended.dc.html — replaces the whole app for suspended accounts. */
export function SuspendedNotice({ reason }: { reason?: string | null }) {
  const { signOut } = useClerk();
  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <header className="border-b border-bar-line bg-hero">
        <div className="flex h-16 items-center gap-2.5 px-5 text-on-hero">
          <LogoMark />
          <span className="font-display text-[19px] font-bold">
            Resume<span className="text-brand">Pilot</span>
          </span>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-[520px] flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-9 text-center max-sm:p-6">
          <span className="flex size-[60px] items-center justify-center rounded-full bg-warn-bg text-warn">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
          <h1 className="m-0 font-display text-[26px] font-bold">Your account is on hold</h1>
          <p className="m-0 text-[15px] leading-[1.6] text-text-2">
            We&apos;ve paused access while we look into something on your account. Your resumes and credits are safe and
            haven&apos;t been changed.
          </p>
          {reason ? <p className="m-0 text-sm leading-[1.6] text-text-2">Reason: {reason}</p> : null}
          <div className="mt-1 flex flex-wrap justify-center gap-2.5">
            <ButtonLink href={routes.contact} className="h-[46px]">
              Contact support
            </ButtonLink>
            <Button variant="outline" className="h-[46px]" onClick={() => signOut({ redirectUrl: routes.home })}>
              Sign out
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
