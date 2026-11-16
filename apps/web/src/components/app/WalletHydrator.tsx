"use client";

import { useEffect } from "react";
import { useWalletStore } from "@/stores/wallet-store";

/**
 * Seeds the wallet store with the server-rendered balance. Renders
 * nothing. Components reading the store should also take the same
 * server value as a fallback for the first paint (see BalancePill).
 */
export function WalletHydrator({ balance }: { balance: number }) {
  useEffect(() => {
    useWalletStore.getState().setBalance(balance);
  }, [balance]);
  return null;
}
