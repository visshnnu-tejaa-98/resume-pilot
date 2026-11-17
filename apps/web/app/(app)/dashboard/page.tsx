import { getWalletPage, listJobDescriptions, listResumes, listVersions } from "@resume-pilot/services";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { AppMain, PageHeader, SectionTitle } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import { ButtonLink, TextLink } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { cn } from "@/lib/cn";
import { formatTag, ledgerLabel, resumeStatusChip } from "@/lib/domain";
import { fmtCredits, fmtRelative, fmtSignedCredits, greeting } from "@/lib/format";
import { appRoutes, routes } from "@/lib/routes";
import { getDb } from "@/server/db";
import { getAppWallet, requireAppUser } from "@/server/session";
import { applySignupCodeOnce, type SignupCodeOutcome } from "@/server/signup-code";

export const metadata: Metadata = { title: "Dashboard" };

/** design/screens/Dashboard.dc.html */
export default async function DashboardPage() {
  const { user, clerkUserId, firstName } = await requireAppUser();
  const db = getDb();

  // OAuth sign-ups can skip /welcome; redeem a pending sign-up code here too.
  // applySignupCodeOnce is a no-op once the code has been tried.
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  let signupCode: SignupCodeOutcome = { status: "none" };
  try {
    signupCode = await applySignupCodeOnce({ userId: user.id, clerkUserId, ip });
  } catch (err) {
    console.error("[dashboard] failed to apply signup code:", err);
  }

  const [wallet, resumes, jobs, activity, versions] = await Promise.all([
    getAppWallet(user.id),
    listResumes(db, user.id),
    listJobDescriptions(db, user.id),
    getWalletPage(db, user.id, { limit: 5 }),
    listVersions(db, user.id),
  ]);
  const scored = versions.filter((v) => v.score !== null && !v.scoreOutdated).sort((a, b) => b.score! - a.score!);
  const best = scored[0];
  const failed = resumes.find((r) => r.status === "failed");
  const ready = resumes.filter((r) => r.status === "ready").length;

  return (
    <AppMain>
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ""}`}
        subtitle={
          resumes.length === 0
            ? "Upload your resume to get started. Uploading is free."
            : `You have ${resumes.length} uploaded resume${resumes.length === 1 ? "" : "s"} and ${jobs.length} saved job${jobs.length === 1 ? "" : "s"}.`
        }
        actions={
          <>
            <ButtonLink href={routes.upload} variant="outline" className="h-[42px] px-4 text-sm">
              Upload resume
            </ButtonLink>
            <ButtonLink href={routes.generate} className="h-[42px] px-[18px] text-sm">
              Tailor for a new job
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}>
        <StatCard hero label="Credit balance" value={fmtCredits(wallet.balance)} action={{ href: routes.wallet, label: "Add money" }} />
        <StatCard label="Resumes" value={resumes.length} sub={`${ready} ready to tailor`} />
        <StatCard
          label="Best ATS score"
          value={best ? best.score! : "—"}
          sub={best ? [best.companyName, best.jobTitle].filter(Boolean).join(" · ") || "Original resume" : "Score a version to see it here"}
        />
        <StatCard label="Saved jobs" value={jobs.length} sub="Reusable for new versions" />
      </div>

      {signupCode.status === "applied" ? (
        <Callout tone="good" role="status">
          Your sign-up code was applied: {fmtCredits(signupCode.credits)} credits added.
        </Callout>
      ) : null}
      {signupCode.status === "rejected" ? (
        <Callout tone="warn" role="status">
          Your sign-up code wasn&apos;t applied: {signupCode.message} You can try another code on the{" "}
          <TextLink href={routes.wallet}>Wallet</TextLink> page.
        </Callout>
      ) : null}
      {failed ? (
        <Callout tone="warn" role="status" className="items-center">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex-[1_1_300px] text-sm">
              <strong>{failed.fileName}</strong> couldn&apos;t be read. {failed.extractionError ?? "Try again or upload another copy."}
            </span>
            <TextLink href={routes.resumes} className="text-sm font-bold">
              Retry
            </TextLink>
          </div>
        </Callout>
      ) : null}

      <div className="grid items-start gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))" }}>
        <section className="flex flex-col gap-3.5 xl:col-span-2">
          <SectionTitle title="Recent resumes" action={<TextLink href={routes.resumes} className="text-sm">View all</TextLink>} />
          {resumes.length === 0 ? (
            <Card className="flex flex-col items-start gap-3 p-6">
              <strong className="font-display text-[17px]">No resumes yet</strong>
              <span className="text-sm text-text-2">Upload a PDF, DOCX, LaTeX file or a photo. We&apos;ll turn it into sections you can check.</span>
              <ButtonLink href={routes.upload} size="sm" className="h-10 text-sm">
                Upload resume
              </ButtonLink>
            </Card>
          ) : (
            <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))" }}>
              {resumes.slice(0, 4).map((r) => {
                const chip = resumeStatusChip(r.status);
                const href = r.status === "ready" ? appRoutes.review(r.id) : routes.resumes;
                return (
                  <Link
                    key={r.id}
                    href={href}
                    className="flex flex-col gap-3.5 rounded-xl border border-border bg-surface p-[18px] text-text no-underline shadow-card-sm hover:border-border-strong"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-col gap-[3px]">
                        <strong className="truncate font-display text-[17px]">{r.fileName}</strong>
                        <span className="text-[13px] text-text-2">Original · {formatTag(r.fileFormat)}</span>
                      </div>
                      <Chip tone={chip.tone} mono className="px-2 py-1">
                        {chip.label}
                      </Chip>
                    </div>
                    <div className="flex justify-between text-xs text-text-2">
                      <span>Uploaded</span>
                      <span>{fmtRelative(r.createdAt)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="flex flex-col rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-[18px] py-4">
            <h2 className="m-0 font-display text-lg font-bold">Credit activity</h2>
            <TextLink href={routes.wallet} className="text-[13px]">
              History
            </TextLink>
          </div>
          {activity.history.length === 0 ? (
            <p className="m-0 px-[18px] py-4 text-sm text-text-2">No credit activity yet.</p>
          ) : (
            activity.history.map((a, i) => (
              <div key={a.id} className={cn("flex justify-between gap-3 px-[18px] py-3", i > 0 && "border-t border-border")}>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm">{ledgerLabel(a)}</span>
                  <span className="text-xs text-text-2">{fmtRelative(a.createdAt)}</span>
                </div>
                <span className={cn("font-mono text-sm font-semibold whitespace-nowrap", a.credits > 0 ? "text-good" : "text-text")}>
                  {fmtSignedCredits(a.credits)}
                </span>
              </div>
            ))
          )}
        </section>
      </div>
    </AppMain>
  );
}
