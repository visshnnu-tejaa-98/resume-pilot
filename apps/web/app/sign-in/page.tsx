"use client";

import { useSignIn } from "@clerk/nextjs/legacy";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthHero } from "@/components/AuthHero";
import * as styles from "@/components/auth-styles";
import { GoogleIcon, LinkedInIcon } from "@/components/BrandIcons";

/**
 * Fully custom UI, no Clerk-rendered components for the form itself —
 * built against Clerk's headless `useSignIn()` per
 * https://clerk.com/docs/guides/development/custom-flows/authentication/legacy/email-password-mfa.
 * `/sign-in/sso-callback` still uses Clerk's `AuthenticateWithRedirectCallback`,
 * which the same guide says to keep even in a custom flow — it
 * completes the OAuth handshake, it isn't UI.
 */
export default function SignInPage() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Second step: Clerk asks for a code on a new device (client trust) or MFA.
  const [factor, setFactor] = useState<"email_code" | "phone_code" | "totp" | null>(null);
  const [code, setCode] = useState("");

  async function handleOAuth(strategy: "oauth_google" | "oauth_linkedin_oidc") {
    if (!isLoaded) return;
    setError(null);
    try {
      await signIn.authenticateWithRedirect({
        strategy,
        redirectUrl: "/sign-in/sso-callback",
        redirectUrlComplete: "/dashboard",
      });
    } catch (err) {
      setError(messageFor(err));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push("/dashboard");
      } else if (
        result.status === "needs_second_factor" ||
        (result.status as string) === "needs_client_trust"
      ) {
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
          await signIn.prepareSecondFactor({
            strategy: "email_code",
            emailAddressId: pick.emailAddressId,
          } as Parameters<typeof signIn.prepareSecondFactor>[0]);
        } else if (pick.strategy === "phone_code") {
          await signIn.prepareSecondFactor({
            strategy: "phone_code",
            phoneNumberId: pick.phoneNumberId,
          } as Parameters<typeof signIn.prepareSecondFactor>[0]);
        }
        setFactor(pick.strategy as "email_code" | "phone_code" | "totp");
      } else {
        setError("Additional verification is required for this account.");
      }
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    if (!isLoaded || !factor) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await signIn.attemptSecondFactor({ strategy: factor, code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push("/dashboard");
      } else {
        setError("Verification didn't complete. Please try again.");
      }
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (factor) {
    const hint =
      factor === "email_code"
        ? `We sent a 6-digit code to ${email}.`
        : factor === "phone_code"
          ? "We sent a 6-digit code to your phone."
          : "Enter the 6-digit code from your authenticator app.";
    return (
      <div className="flex min-h-screen flex-wrap" style={{ background: "var(--color-background)" }}>
        <AuthHero
          headline="Pick up right where you left off."
          subtext="Your resumes, tailored versions, scores and credits are waiting."
        />
        <main className="flex flex-1 basis-[520px] items-center justify-center p-6 sm:p-12">
          <form className="flex w-full max-w-[420px] flex-col gap-4" onSubmit={handleVerify}>
            <h2
              style={{
                margin: 0,
                fontFamily: "'Space Grotesk', Inter, sans-serif",
                fontSize: 30,
                letterSpacing: "-0.01em",
              }}
            >
              Verify it's you
            </h2>
            <span style={{ fontSize: 15, color: "var(--color-text-secondary)" }}>{hint}</span>
            <label style={styles.label}>
              Verification code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.trim())}
                style={styles.input}
              />
            </label>
            {error && <p style={styles.errorText}>{error}</p>}
            <button type="submit" disabled={submitting} style={styles.primaryButton}>
              {submitting ? "Verifying…" : "Verify and sign in"}
            </button>
            <button
              type="button"
              onClick={() => {
                setFactor(null);
                setCode("");
                setError(null);
              }}
              style={{ ...styles.oauthButton }}
            >
              Back
            </button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-wrap" style={{ background: "var(--color-background)" }}>
      <AuthHero
        headline="Pick up right where you left off."
        subtext="Your resumes, tailored versions, scores and credits are waiting."
      />
      <main className="flex flex-1 basis-[520px] items-center justify-center p-6 sm:p-12">
        <div className="flex w-full max-w-[420px] flex-col gap-[22px]">
          <div className="flex flex-col gap-2">
            <h2
              style={{
                margin: 0,
                fontFamily: "'Space Grotesk', Inter, sans-serif",
                fontSize: 30,
                letterSpacing: "-0.01em",
              }}
            >
              Sign in
            </h2>
            <span style={{ fontSize: 15, color: "var(--color-text-secondary)" }}>
              New to Resume Pilot?{" "}
              <Link href="/sign-up" style={{ color: "var(--color-link)", fontWeight: 600 }}>
                Create an account
              </Link>
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              style={styles.oauthButton}
              onClick={() => handleOAuth("oauth_google")}
            >
              <GoogleIcon /> Continue with Google
            </button>
            <button
              type="button"
              style={styles.oauthButton}
              onClick={() => handleOAuth("oauth_linkedin_oidc")}
            >
              <LinkedInIcon /> Continue with LinkedIn
            </button>
          </div>

          <div
            className="flex items-center gap-3 text-[13px]"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <span className="h-px flex-1" style={{ background: "var(--color-border)" }} />
            or with email
            <span className="h-px flex-1" style={{ background: "var(--color-border)" }} />
          </div>

          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <label style={styles.label}>
              Email
              <input
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={styles.input}
              />
            </label>
            <label style={styles.label}>
              <span className="flex justify-between">
                Password
                <Link href="#" style={{ fontWeight: 500, color: "var(--color-link)" }}>
                  Forgot password?
                </Link>
              </span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
              />
            </label>
            {error && <p style={styles.errorText}>{error}</p>}
            <button type="submit" disabled={submitting} style={styles.primaryButton}>
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--color-text-secondary)" }}>
            By continuing you agree to our{" "}
            <Link href="/legal" style={{ color: "var(--color-link)" }}>
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/legal" style={{ color: "var(--color-link)" }}>
              Privacy policy
            </Link>
            .
          </span>
        </div>
      </main>
    </div>
  );
}

function messageFor(err: unknown): string {
  if (err && typeof err === "object" && "errors" in err) {
    const errors = (err as { errors?: Array<{ longMessage?: string; message?: string }> }).errors;
    const first = errors?.[0];
    if (first) return first.longMessage ?? first.message ?? "Something went wrong.";
  }
  return "Something went wrong. Please try again.";
}
