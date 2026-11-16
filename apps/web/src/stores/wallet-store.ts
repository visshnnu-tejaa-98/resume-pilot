import { create } from "zustand";

interface WalletState {
  /** Credit balance; null until a server component has seeded it. */
  balance: number | null;
  setBalance: (balance: number) => void;
}

/**
 * Client copy of the caller's credit balance, shown in the app chrome
 * (balance pill) and updated in place after actions that change it
 * (code redemption, top-ups, captures) so the header stays in sync
 * without a full refetch. The server remains the source of truth: pages
 * seed it via <WalletHydrator balance={...} /> on every render.
 */
export const useWalletStore = create<WalletState>()((set) => ({
  balance: null,
  setBalance: (balance) => set({ balance }),
}));
