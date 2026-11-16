"use client";

import { useSignUp } from "@clerk/nextjs/legacy";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthHeading, FormError, LegalLinks, OAuthButtons, OrDivider, type OAuthStrategy } from "@/components/auth/AuthParts";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { clerkErrorMessage } from "@/lib/clerk-errors";
import { routes } from "@/lib/routes";
import { AFTER_SIGN_UP, signUpCopy } from "@/content/auth";

const authInput = "h-[46px]";

/**
 * design/screens/SignUp.dc.html — custom UI on Clerk's headless
 * `useSignUp()`. Email sign-up is two steps (form → email code).
 *
 * The coupon/referral code is stashed in `unsafeMetadata` and redeemed
 * server-side on the next page load (src/server/signup-code.ts), where
 * the user's real IP is available for the referral abuse check.
 */
export default function SignUpPage() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();

  const [step, setStep] = useState<"form" | "verify">("form");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function run(fn: () => Promise<void>) {
    if (!isLoaded) return;
    setSubmitting(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleOAuth(strategy: OAuthStrategy) {
    void run(async () => {
      await signUp!.authenticateWithRedirect({
        strategy,
        redirectUrl: "/sign-up/sso-callback",
        redirectUrlComplete: AFTER_SIGN_UP,
        unsafeMetadata: referralCode.trim() ? { referralCodeAtSignup: referralCode.trim() } : undefined,
      });
    });
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!agreed) {
      setError("Please agree to the Terms and Privacy policy to continue.");
      return;
    }
    void run(async () => {
      const [firstName, ...rest] = fullName.trim().split(/\s+/);
      await signUp!.create({
        emailAddress: email,
        password,
        firstName,
        lastName: rest.join(" ") || undefined,
        unsafeMetadata: referralCode.trim() ? { referralCodeAtSignup: referralCode.trim() } : undefined,
      });
      await signUp!.prepareEmailAddressVerification({ strategy: "email_code" });
      setStep("verify");
    });
  }

  function handleVerify(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const result = await signUp!.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await setActive!({ session: result.createdSessionId });
        router.push(AFTER_SIGN_UP);
        return;
      }
      setError("Verification incomplete — check the code and try again.");
    });
  }

  return (
    <AuthShell headline={signUpCopy.headline} steps={signUpCopy.steps} formWidth={440}>
      {step === "form" ? (
        <>
          <AuthHeading title="Create your account">
            Already have one?{" "}
            <Link href={routes.signIn} className="font-semibold text-link underline">
              Sign in
            </Link>
          </AuthHeading>
          <OAuthButtons layout="grid" onSelect={handleOAuth} disabled={!isLoaded} />
          <OrDivider />
          <form className="flex flex-col gap-4" onSubmit={handleCreate}>
            <Field label="Full name">
              <Input
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={authInput}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={authInput}
              />
            </Field>
            <Field label="Password" help="At least 8 characters">
              <Input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={authInput}
              />
            </Field>

            <div className="flex flex-col gap-1.5 rounded-[10px] border border-dashed border-accent-line bg-accent-tint p-4">
              <label htmlFor="su-code" className="text-sm font-semibold">
                Coupon or referral code <span className="font-normal text-text-2">(optional)</span>
              </label>
              <Input
                id="su-code"
                placeholder="EARLYBIRD"
                autoCapitalize="characters"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
                className="font-mono font-semibold tracking-[0.06em]"
              />
              <span className="text-[13px] text-text-2">Get 500 free credits. One code per account.</span>
            </div>

            <label className="flex items-start gap-2.5 text-sm leading-normal">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 size-[18px] flex-none accent-link"
              />
              <span>
                I agree to the <LegalLinks />, and consent to my resume being processed to provide the service.
              </span>
            </label>
            {/* Clerk mounts its bot-protection widget here. */}
            <div id="clerk-captcha" />

            <FormError>{error}</FormError>
            <Button type="submit" size="lg" block disabled={submitting || !isLoaded} className="h-12">
              {submitting ? "Creating account…" : "Create account"}
            </Button>
          </form>
        </>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={handleVerify}>
          <AuthHeading title="Check your email">Enter the code we sent to {email}.</AuthHeading>
          <Field label="Verification code">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              className="h-[46px] font-mono text-lg font-semibold tracking-[0.1em]"
            />
          </Field>
          <FormError>{error}</FormError>
          <Button type="submit" size="lg" block disabled={submitting} className="h-12">
            {submitting ? "Verifying…" : "Verify and continue"}
          </Button>
          <Button
            variant="outline"
            size="lg"
            block
            className="h-12 border-border-strong"
            onClick={() => {
              setStep("form");
              setCode("");
              setError(null);
            }}
          >
            Back
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
