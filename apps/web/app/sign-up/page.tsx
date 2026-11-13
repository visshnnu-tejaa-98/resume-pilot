"use client";

import { useSignUp } from "@clerk/nextjs/legacy";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthHero } from "@/components/AuthHero";
import * as styles from "@/components/auth-styles";
import { GoogleIcon, LinkedInIcon } from "@/components/BrandIcons";

const STEPS = [
  { title: "Create your account", body: "Free. Your wallet starts at 0 credits." },
  { title: "Apply a code", body: "EARLYBIRD or a friend's referral adds credits." },
  { title: "Upload your resume", body: "PDF, DOCX, LaTeX or a photo. Always free." },
  { title: "Tailor it to a job", body: "See the cost first, pay only what's used." },
];

/**
 * Fully custom UI against Clerk's headless `useSignUp()` — same
 * pattern as /sign-in. Email/password sign-up needs a second step
 * (email code verification) before the session is created, so this
 * is a small two-step state machine rather than a single form.
 *
 * The referral/coupon code field is collected and stashed in
 * `unsafeMetadata` at signup time — redemption itself isn't built yet
 * (tasks/todo/m2-credits/04-coupons-referrals.md). Per prd.md §2.1,
 * codes can also be applied later from the Wallet page, so nothing
 * is lost if that metadata sits unread until M2 lands.
 */
export default function SignUpPage() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();

  const [step, setStep] = useState<"form" | "verify">("form");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleOAuth(strategy: "oauth_google" | "oauth_linkedin_oidc") {
    if (!isLoaded) return;
    setError(null);
    try {
      await signUp.authenticateWithRedirect({
        strategy,
        redirectUrl: "/sign-up/sso-callback",
        redirectUrlComplete: "/dashboard",
      });
    } catch (err) {
      setError(messageFor(err));
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    if (!agreed) {
      setError("Please agree to the Terms and Privacy policy to continue.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const [firstName, ...rest] = fullName.trim().split(/\s+/);
      await signUp.create({
        emailAddress: email,
        password,
        firstName,
        lastName: rest.join(" ") || undefined,
        unsafeMetadata: referralCode ? { referralCodeAtSignup: referralCode } : undefined,
      });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setStep("verify");
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push("/dashboard");
      } else {
        setError("Verification incomplete — check the code and try again.");
      }
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-wrap" style={{ background: "var(--color-background)" }}>
      <AuthHero headline="Plot your first route in minutes." steps={STEPS} />
      <main className="flex flex-1 basis-[520px] items-center justify-center p-6 sm:p-12">
        <div className="flex w-full max-w-[440px] flex-col gap-[22px]">
          {step === "form" ? (
            <>
              <div className="flex flex-col gap-2">
                <h2
                  style={{
                    margin: 0,
                    fontFamily: "'Space Grotesk', Inter, sans-serif",
                    fontSize: 30,
                    letterSpacing: "-0.01em",
                  }}
                >
                  Create your account
                </h2>
                <span style={{ fontSize: 15, color: "var(--color-text-secondary)" }}>
                  Already have one?{" "}
                  <Link href="/sign-in" style={{ color: "var(--color-link)", fontWeight: 600 }}>
                    Sign in
                  </Link>
                </span>
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-2.5">
                <button
                  type="button"
                  style={styles.oauthButton}
                  onClick={() => handleOAuth("oauth_google")}
                >
                  <GoogleIcon /> Google
                </button>
                <button
                  type="button"
                  style={styles.oauthButton}
                  onClick={() => handleOAuth("oauth_linkedin_oidc")}
                >
                  <LinkedInIcon /> LinkedIn
                </button>
              </div>

              {/* <div
                className="flex items-center gap-3 text-[13px]"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <span className="h-px flex-1" style={{ background: "var(--color-border)" }} />
                or with email
                <span className="h-px flex-1" style={{ background: "var(--color-border)" }} />
              </div> */}

              <form className="flex flex-col gap-4" onSubmit={handleCreate}>
                <label style={styles.label}>
                  Full name
                  <input
                    type="text"
                    autoComplete="name"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    style={styles.input}
                  />
                </label>
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
                  Password
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={styles.input}
                  />
                  <span
                    style={{ fontSize: 13, fontWeight: 400, color: "var(--color-text-secondary)" }}
                  >
                    At least 8 characters
                  </span>
                </label>

                <div
                  className="flex flex-col gap-1.5 rounded-[10px] border border-dashed p-4"
                  style={{
                    borderColor: "var(--color-accent-line)",
                    background: "var(--color-accent-tint)",
                  }}
                >
                  <label htmlFor="su-code" style={{ fontSize: 14, fontWeight: 600 }}>
                    Coupon or referral code{" "}
                    <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>
                      (optional)
                    </span>
                  </label>
                  <input
                    id="su-code"
                    type="text"
                    placeholder="EARLYBIRD"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value)}
                    style={{
                      ...styles.input,
                      font: "600 15px 'JetBrains Mono', monospace",
                      letterSpacing: "0.06em",
                      height: 44,
                    }}
                  />
                  <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                    Get free credits. One code per account.
                  </span>
                </div>

                <label className="flex items-start gap-2.5 text-sm" style={{ lineHeight: 1.5 }}>
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 h-[18px] w-[18px] flex-none"
                    style={{ accentColor: "var(--color-link)" }}
                  />
                  <span>
                    I agree to the{" "}
                    <Link href="/legal" style={{ color: "var(--color-link)" }}>
                      Terms
                    </Link>{" "}
                    and{" "}
                    <Link href="/legal" style={{ color: "var(--color-link)" }}>
                      Privacy policy
                    </Link>
                    , and consent to my resume being processed to provide the service.
                  </span>
                </label>
                <div id="clerk-captcha" />

                {error && <p style={styles.errorText}>{error}</p>}
                <button type="submit" disabled={submitting} style={styles.primaryButton}>
                  {submitting ? "Creating account…" : "Create account"}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <h2
                  style={{
                    margin: 0,
                    fontFamily: "'Space Grotesk', Inter, sans-serif",
                    fontSize: 30,
                    letterSpacing: "-0.01em",
                  }}
                >
                  Check your email
                </h2>
                <span style={{ fontSize: 15, color: "var(--color-text-secondary)" }}>
                  Enter the code we sent to {email}.
                </span>
              </div>
              <form className="flex flex-col gap-4" onSubmit={handleVerify}>
                <label style={styles.label}>
                  Verification code
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    style={{
                      ...styles.input,
                      font: "600 18px 'JetBrains Mono', monospace",
                      letterSpacing: "0.1em",
                    }}
                  />
                </label>
                {error && <p style={styles.errorText}>{error}</p>}
                <button type="submit" disabled={submitting} style={styles.primaryButton}>
                  {submitting ? "Verifying…" : "Verify and continue"}
                </button>
              </form>
            </>
          )}
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
