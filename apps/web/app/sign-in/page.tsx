"use client";

import { useSignIn } from "@clerk/nextjs/legacy";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthHeading, FormError, LegalLinks, OAuthButtons, OrDivider, type OAuthStrategy } from "@/components/auth/AuthParts";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { clerkErrorMessage } from "@/lib/clerk-errors";
import { routes } from "@/lib/routes";
import { AFTER_SIGN_IN, signInCopy } from "@/content/auth";

type SecondFactor = "email_code" | "phone_code" | "totp";
type Step = "credentials" | "second-factor" | "reset-request" | "reset-verify";

const authInput = "h-[46px]";
const codeInput = "h-[46px] font-mono text-lg font-semibold tracking-[0.1em]";

/**
 * design/screens/SignIn.dc.html — fully custom UI on Clerk's headless
 * `useSignIn()` (custom-flow guide, email/password + MFA). Steps:
 *
 * - credentials → (needs_second_factor / needs_client_trust) → second-factor
 * - "Forgot password?" → reset-request → reset-verify (code + new password)
 *
 * `/sign-in/sso-callback` keeps Clerk's AuthenticateWithRedirectCallback,
 * which completes the OAuth handshake; it isn't UI.
 */
export default function SignInPage() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();

  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [factor, setFactor] = useState<SecondFactor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function goTo(next: Step) {
    setStep(next);
    setCode("");
    setError(null);
  }

  /** Wraps a Clerk call with the submitting/error bookkeeping. */
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

  async function finish(sessionId: string | null) {
    await setActive!({ session: sessionId });
    router.push(AFTER_SIGN_IN);
  }

  /** Clerk asks for a second step on a new device (client trust) or with MFA. */
  async function startSecondFactor(result: NonNullable<typeof signIn>) {
    const factors = (result.supportedSecondFactors ?? []) as Array<{
      strategy: string;
      emailAddressId?: string;
      phoneNumberId?: string;
    }>;
    const pick =
      factors.find((f) => f.strategy === "email_code") ??
      factors.find((f) => f.strategy === "totp") ??
      factors.find((f) => f.strategy === "phone_code");
    if (!pick) {
      setError("This account needs a verification method we don't support yet.");
      return;
    }
    if (pick.strategy === "email_code") {
      await signIn!.prepareSecondFactor({
        strategy: "email_code",
        emailAddressId: pick.emailAddressId,
      } as Parameters<NonNullable<typeof signIn>["prepareSecondFactor"]>[0]);
    } else if (pick.strategy === "phone_code") {
      await signIn!.prepareSecondFactor({
        strategy: "phone_code",
        phoneNumberId: pick.phoneNumberId,
      } as Parameters<NonNullable<typeof signIn>["prepareSecondFactor"]>[0]);
    }
    setFactor(pick.strategy as SecondFactor);
    goTo("second-factor");
  }

  function handleOAuth(strategy: OAuthStrategy) {
    void run(async () => {
      await signIn!.authenticateWithRedirect({
        strategy,
        redirectUrl: "/sign-in/sso-callback",
        redirectUrlComplete: AFTER_SIGN_IN,
      });
    });
  }

  function handleCredentials(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const result = await signIn!.create({ identifier: email, password });
      if (result.status === "complete") return finish(result.createdSessionId);
      if (result.status === "needs_second_factor" || (result.status as string) === "needs_client_trust") {
        return startSecondFactor(result);
      }
      setError("Additional verification is required for this account.");
    });
  }

  function handleSecondFactor(e: FormEvent) {
    e.preventDefault();
    if (!factor) return;
    void run(async () => {
      const result = await signIn!.attemptSecondFactor({ strategy: factor, code });
      if (result.status === "complete") return finish(result.createdSessionId);
      setError("Verification didn't complete. Please try again.");
    });
  }

  function handleResetRequest(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      await signIn!.create({ strategy: "reset_password_email_code", identifier: email });
      goTo("reset-verify");
    });
  }

  function handleResetVerify(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const result = await signIn!.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
        password: newPassword,
      });
      if (result.status === "complete") return finish(result.createdSessionId);
      if (result.status === "needs_second_factor") return startSecondFactor(result);
      setError("We couldn't reset your password. Please try again.");
    });
  }

  const backButton = (to: Step) => (
    <Button variant="outline" size="lg" block className="h-12 border-border-strong" onClick={() => goTo(to)}>
      Back
    </Button>
  );

  return (
    <AuthShell headline={signInCopy.headline} subtext={signInCopy.subtext}>
      {step === "credentials" ? (
        <>
          <AuthHeading title="Sign in">
            New to Resume Pilot?{" "}
            <Link href={routes.signUp} className="font-semibold text-link underline">
              Create an account
            </Link>
          </AuthHeading>
          <OAuthButtons onSelect={handleOAuth} disabled={!isLoaded} />
          <OrDivider />
          <form className="flex flex-col gap-4" onSubmit={handleCredentials}>
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
            <Field
              label="Password"
              labelAside={
                <button
                  type="button"
                  onClick={() => goTo("reset-request")}
                  className="cursor-pointer font-medium text-link underline"
                >
                  Forgot password?
                </button>
              }
            >
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={authInput}
              />
            </Field>
            <FormError>{error}</FormError>
            <Button type="submit" size="lg" block disabled={submitting || !isLoaded} className="h-12">
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <span className="text-[13px] leading-normal text-text-2">
            By continuing you agree to our <LegalLinks />.
          </span>
        </>
      ) : null}

      {step === "second-factor" ? (
        <form className="flex flex-col gap-4" onSubmit={handleSecondFactor}>
          <AuthHeading title="Verify it’s you">
            {factor === "email_code"
              ? `We sent a 6-digit code to ${email}.`
              : factor === "phone_code"
                ? "We sent a 6-digit code to your phone."
                : "Enter the 6-digit code from your authenticator app."}
          </AuthHeading>
          <Field label="Verification code">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              className={codeInput}
            />
          </Field>
          <FormError>{error}</FormError>
          <Button type="submit" size="lg" block disabled={submitting} className="h-12">
            {submitting ? "Verifying…" : "Verify and sign in"}
          </Button>
          {backButton("credentials")}
        </form>
      ) : null}

      {step === "reset-request" ? (
        <form className="flex flex-col gap-4" onSubmit={handleResetRequest}>
          <AuthHeading title="Reset your password">
            Enter your account email and we&apos;ll send you a code.
          </AuthHeading>
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
          <FormError>{error}</FormError>
          <Button type="submit" size="lg" block disabled={submitting} className="h-12">
            {submitting ? "Sending…" : "Send reset code"}
          </Button>
          {backButton("credentials")}
        </form>
      ) : null}

      {step === "reset-verify" ? (
        <form className="flex flex-col gap-4" onSubmit={handleResetVerify}>
          <AuthHeading title="Choose a new password">Enter the code we sent to {email}.</AuthHeading>
          <Field label="Reset code">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              className={codeInput}
            />
          </Field>
          <Field label="New password" help="At least 8 characters">
            <Input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={authInput}
            />
          </Field>
          <FormError>{error}</FormError>
          <Button type="submit" size="lg" block disabled={submitting} className="h-12">
            {submitting ? "Saving…" : "Reset password and sign in"}
          </Button>
          {backButton("reset-request")}
        </form>
      ) : null}
    </AuthShell>
  );
}
