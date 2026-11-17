import { getMyRedemption, getWalletPage, listActiveCreditPackages } from "@resume-pilot/services";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AppMain } from "@/components/app/PageHeader";
import { WalletView } from "@/components/wallet/WalletView";
import { getDb } from "@/server/db";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Wallet" };

/** design/screens/Wallet.dc.html — always the caller's own wallet. */
export default async function WalletPage() {
  const { user } = await requireAppUser();
  const db = getDb();
  const [wallet, packs, redemption] = await Promise.all([
    getWalletPage(db, user.id, { limit: 50 }),
    listActiveCreditPackages(db),
    getMyRedemption(db, user.id),
  ]);

  return (
    <AppMain className="gap-6">
      <Suspense>
        <WalletView
          balance={wallet.balance}
          held={wallet.held}
          available={wallet.available}
          holds={wallet.activeHolds}
          history={wallet.history}
          nextCursor={wallet.nextCursor}
          packs={packs}
          redemption={redemption}
          paymentsEnabled={Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)}
        />
      </Suspense>
    </AppMain>
  );
}
