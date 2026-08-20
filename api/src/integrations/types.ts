/**
 * Integration layer contracts.
 *
 * Every provider (bank aggregator or POS) maps into these normalized shapes.
 * Downstream code — sync engine, matching, screens — never knows which
 * provider produced the data. New providers are new adapters, not new code
 * paths. Credentials never touch these modules: adapters receive them from
 * the vault reference at call time.
 */

export interface NormalizedBankAccount {
  externalAccountId: string;
  institutionName: string;
  accountName: string;
  mask: string; // last 4 only — full numbers are never stored
  accountType: 'checking' | 'savings' | 'credit_card' | 'money_market';
  currency: string;
  currentBalance: number;
}

export interface NormalizedBankTxn {
  externalTxnId: string;
  postedAt: string; // YYYY-MM-DD
  amount: number; // signed; negative = outflow
  descriptionRaw: string;
  counterparty?: string;
  pending?: boolean;
}

export interface BankSyncResult {
  accounts: NormalizedBankAccount[];
  transactions: Map<string, NormalizedBankTxn[]>; // externalAccountId → txns
  nextCursor: string | null;
}

/** A bank aggregator (Plaid, Belvo, …). */
export interface BankFeedAdapter {
  readonly provider: string;
  /** Incremental sync from a cursor; must be safe to replay (idempotent). */
  sync(credentials: Record<string, string>, cursor: string | null): Promise<BankSyncResult>;
}

export interface NormalizedPosDay {
  businessDate: string; // YYYY-MM-DD in the location's timezone
  grossSales: number;
  discounts: number;
  comps: number;
  taxCollected: number;
  tips: number;
  tender: { cash: number; card: number; gift_card: number; other: number };
  checkCount: number;
  externalBatchId?: string;
}

/** A POS provider (Clover, Toast, Square, Lightspeed, …). */
export interface PosAdapter {
  readonly provider: string;
  /** Full summary for one business day. Re-fetching the same day must return the same batch id. */
  fetchDay(credentials: Record<string, string>, merchantId: string, businessDate: string): Promise<NormalizedPosDay | null>;
}
