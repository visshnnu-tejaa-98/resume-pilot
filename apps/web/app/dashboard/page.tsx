import { auth } from "@clerk/nextjs/server";
import { getWalletSummary } from "@resume-pilot/services";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { ensureUserSynced } from "@/server/ensure-user";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const user = await ensureUserSynced(userId);
  const wallet = await getWalletSummary(getDb(), user.id);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold">Dashboard</h1>
      <p>{user.email}</p>
      <p className="font-mono text-lg">
        Balance: <strong>{wallet.balance.toLocaleString()}</strong> credits
      </p>
      <p className="font-mono text-sm">Referral code: {wallet.referralCode}</p>
    </main>
  );
}
