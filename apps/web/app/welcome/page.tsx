import { auth, currentUser } from "@clerk/nextjs/server";
import { getWalletSummary } from "@resume-pilot/services";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/app/Avatar";
import { BalancePill } from "@/components/app/BalancePill";
import { WalletHydrator } from "@/components/app/WalletHydrator";
import { Logo } from "@/components/brand/Logo";
import { Heading, MonoKicker } from "@/components/ui/Typography";
import { ClaimCreditsCard, type InitialClaim } from "@/components/welcome/ClaimCreditsCard";
import { UploadStepCard } from "@/components/welcome/UploadStepCard";
import { routes } from "@/lib/routes";
import { getDb } from "@/server/db";
import { ensureUserSynced } from "@/server/ensure-user";
import { applySignupCodeOnce } from "@/server/signup-code";

export const metadata: Metadata = { title: "Welcome" };

/** design/screens/Welcome.dc.html — first stop after creating an account. */
export default async function WelcomePage() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) redirect(routes.signIn);

  const user = await ensureUserSynced(clerkUserId);
  const clerkUser = await currentUser();
  const pendingCode = clerkUser?.unsafeMetadata?.referralCodeAtSignup;

  // Redeem the code typed on the sign-up form, if any (one try, server-side
  // so the referral abuse check sees the real IP).
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  let initial: InitialClaim = { status: "none" };
  try {
    const outcome = await applySignupCodeOnce({ userId: user.id, clerkUserId, ip });
    if (outcome.status === "applied") {
      initial = {
        status: "applied",
        code: typeof pendingCode === "string" ? pendingCode.trim().toUpperCase() : null,
        credits: outcome.credits,
      };
    } else if (outcome.status === "rejected") {
      initial = { status: "rejected", message: `Your sign-up code wasn't applied: ${outcome.message}` };
    }
  } catch (err) {
    // Never block onboarding on this; the code can be re-entered below.
    console.error("[welcome] failed to apply signup code:", err);
  }

  const wallet = await getWalletSummary(getDb(), user.id);
  const firstName = clerkUser?.firstName?.trim();
  const fullName = clerkUser?.fullName ?? user.email;

  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <WalletHydrator balance={wallet.balance} />
      <header className="border-b border-bar-line bg-hero text-on-hero">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-4 px-6">
          <Logo href={routes.dashboard} label="Resume Pilot dashboard" />
          <span className="flex items-center gap-3">
            <BalancePill initialBalance={wallet.balance} className="h-[34px]" />
            <Avatar name={fullName} size={34} />
          </span>
        </div>
      </header>

      <main className="mx-auto box-border flex w-full max-w-[880px] flex-1 flex-col gap-7 px-6 pt-16 pb-20">
        <div className="flex flex-col gap-2.5">
          <MonoKicker>ACCOUNT CREATED</MonoKicker>
          <Heading as="h1" className="text-[clamp(32px,4.5vw,46px)] leading-[1.08] tracking-[-0.02em]">
            {firstName ? `You're in, ${firstName}.` : "You're in."} Let&apos;s get you airborne.
          </Heading>
          <p className="m-0 text-[17px] leading-[1.6] text-text-2">
            Two quick steps and you&apos;re ready to tailor your first resume.
          </p>
        </div>
        <ClaimCreditsCard initial={initial} />
        <UploadStepCard />
      </main>
    </div>
  );
}
