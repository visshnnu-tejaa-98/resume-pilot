import { z } from "zod";

/** Wallet history page request — prd.md §3.5. */
export const walletHistoryInputSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(20),
    /** `nextCursor` from the previous page. */
    cursor: z.uuid().nullish(),
  })
  .default({ limit: 20 });

export type WalletHistoryInput = z.infer<typeof walletHistoryInputSchema>;
