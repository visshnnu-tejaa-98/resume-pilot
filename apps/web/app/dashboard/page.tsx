import { auth } from "@clerk/nextjs/server";
import { getWalletSummary, listResumes } from "@resume-pilot/services";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { ensureUserSynced } from "@/server/ensure-user";
import { applySignupCodeOnce, type SignupCodeOutcome } from "@/server/signup-code";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const user = await ensureUserSynced(userId);

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  let signupCode: SignupCodeOutcome = { status: "none" };
  try {
    signupCode = await applySignupCodeOnce({ userId: user.id, clerkUserId: userId, ip });
  } catch (err) {
    // Never block the dashboard on this; the user can apply the code from the wallet.
    console.error("[dashboard] failed to apply signup code:", err);
  }

  const wallet = await getWalletSummary(getDb(), user.id);
  const myResumes = await listResumes(getDb(), user.id);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold">Dashboard</h1>
      <p>{user.email}</p>
      {signupCode.status === "applied" && (
        <p className="text-sm text-green-700">
          Your code was applied: {signupCode.credits.toLocaleString()} credits added.
        </p>
      )}
      {signupCode.status === "rejected" && (
        <p className="text-sm text-red-700">
          Your sign-up code wasn&apos;t applied: {signupCode.message}
        </p>
      )}
      <p className="font-mono text-lg">
        Balance: <strong>{wallet.balance.toLocaleString()}</strong> credits
      </p>
      <p className="font-mono text-sm">Referral code: {wallet.referralCode}</p>
      {myResumes.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {myResumes.map((r) => (
            <li key={r.id}>
              {r.fileName} · {r.status}
              {r.status === "ready" && (
                <>
                  {" · "}
                  <Link href={`/resumes/${r.id}/review`} style={{ color: "var(--color-link)" }}>
                    Review
                  </Link>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
