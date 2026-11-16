export interface LedgerRow {
  id: string;
  type: string;
  action: string | null;
  credits: number;
  balanceAfter: number;
  note: string | null;
  /** Date from the server render, ISO string when loaded over tRPC. */
  createdAt: Date | string;
}

export interface CreditPack {
  id: string;
  pricePaise: number;
  credits: number;
  bonusCredits: number;
}

export interface Redemption {
  codeType: "coupon" | "referral";
  code: string | null;
  creditsToUser: number;
  createdAt: Date;
}
