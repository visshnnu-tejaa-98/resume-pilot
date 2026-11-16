import type { Metadata } from "next";
import { AppSidebar } from "@/components/app/AppSidebar";
import { AppTopBar } from "@/components/app/AppTopBar";
import { SuspendedNotice } from "@/components/app/SuspendedNotice";
import { WalletHydrator } from "@/components/app/WalletHydrator";
import { getAppWallet, requireAppUser } from "@/server/session";

export const metadata: Metadata = { robots: { index: false } };

/**
 * Shell for every signed-in screen: top bar + sidebar + page. Auth is
 * resolved here and again in each page via the cached requireAppUser(),
 * so a page can never render without a session. Suspended accounts see
 * only the on-hold notice (prd.md §12.2).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, fullName } = await requireAppUser();
  if (user.status === "suspended") return <SuspendedNotice />;
  const wallet = await getAppWallet(user.id);

  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <WalletHydrator balance={wallet.balance} />
      <AppTopBar name={fullName ?? user.email} initialBalance={wallet.balance} />
      <div className="flex flex-1">
        <AppSidebar isAdmin={user.role === "admin"} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
