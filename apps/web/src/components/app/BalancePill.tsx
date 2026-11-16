"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { useWalletStore } from "@/stores/wallet-store";

/** Orange-dot credit balance pill on the navy app bar. */
export function BalancePill({
  href,
  initialBalance,
  className,
}: {
  href?: string;
  /** Server-rendered balance, used until the store is seeded. */
  initialBalance?: number;
  className?: string;
}) {
  const balance = useWalletStore((s) => s.balance) ?? initialBalance ?? null;
  const content = (
    <>
      <span className="size-2 rounded-full bg-brand" />
      {balance === null ? "—" : balance.toLocaleString("en-IN")} credits
    </>
  );
  const cls = cn(
    "flex h-9 items-center gap-2 rounded-full border border-hero-line bg-hero-chip px-3.5 font-mono text-sm font-semibold text-on-hero no-underline",
    className,
  );
  return href ? (
    <Link href={href} aria-label="Wallet balance" className={cls}>
      {content}
    </Link>
  ) : (
    <span aria-label="Wallet balance" className={cls}>
      {content}
    </span>
  );
}
