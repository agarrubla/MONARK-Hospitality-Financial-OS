/**
 * MOCK DATA — development fixtures only, ported verbatim from
 * "Monark Banking.dc.html". Unclassified-by-default rule: new transactions
 * enter Unclassified unless a rule classifies them at ≥ 0.90 confidence.
 */
export type MatchKind = 'payment' | 'deposit' | 'rule' | 'unclassified' | 'excluded';

export interface BankAccountFixture {
  id: string;
  name: string;
  meta: string;
  balance: number;
  initial: string;
  unclassified: number;
}

export interface BankTxnFixture {
  id: string;
  acct: string;
  txnDate: string;
  postDate: string;
  desc: string;
  amount: number;
  dir: 'debit' | 'credit';
  merchant: string;
  vendor: string;
  category: string;
  loc: string;
  status: 'Posted' | 'Pending';
  match: MatchKind;
  source: string;
  ext: string;
  matchNote: string;
  suggest?: [string, number, string];
  link?: [string, string];
  trail: Array<[string, string, string]>;
}

export const bankAccounts: BankAccountFixture[] = [
  { id: 'ops', name: 'Operating · Chase …4821', meta: 'Checking · org treasury · Plaid', balance: 121430.50, initial: 'C', unclassified: 2 },
  { id: 'pay', name: 'Payroll · Chase …9310', meta: 'Checking · payroll sweep · Plaid', balance: 35270.00, initial: 'C', unclassified: 0 },
  { id: 'sav', name: 'Reserve · Mercury …1177', meta: 'Savings · org reserve · Plaid', balance: 11750.00, initial: 'M', unclassified: 0 },
  { id: 'amex', name: 'Card · Amex …3009', meta: 'Credit card · shared expenses · Plaid', balance: -6420.18, initial: 'A', unclassified: 1 },
];

export const bankTxns: BankTxnFixture[] = [
  { id: 'bt-1042', acct: 'ops', txnDate: 'Aug 13', postDate: 'Aug 13', desc: 'ACH DEBIT BOARSHEAD PROV', amount: -900.00, dir: 'debit', merchant: 'BOARSHEAD PROV', vendor: "Boar's Head Provisions", category: 'COGS · Food', loc: 'MID', status: 'Posted', match: 'payment', source: 'Plaid sync', ext: 'plaid_txn_8Kx2n4', matchNote: 'Matched to payment ACH-0812-6610 (conf 0.99)',
    link: ['MATCHED TO PAYMENT', 'Settles invoice BH-66104 ($900.00, expense JUL 2026). The expense was booked in July from the invoice — this debit records only the August cash movement. Category cleared from the transaction to prevent double-counting.'],
    trail: [['Matched to payment', 'Auto-match: amount + date + counterparty vs ACH-0812-6610. Category on transaction cleared (expense lives on invoice).', 'Aug 13 · 6:15 AM'], ['Imported via Plaid', 'Cursor sync · external id plaid_txn_8Kx2n4 · dedupe hash new', 'Aug 13 · 6:00 AM']] },
  { id: 'bt-1041', acct: 'ops', txnDate: 'Aug 15', postDate: 'Aug 16', desc: 'TOAST DEPOSIT 250814 VELA SOHO', amount: 6214.00, dir: 'credit', merchant: 'TOAST', vendor: '—', category: '—', loc: 'SOHO', status: 'Posted', match: 'deposit', source: 'Plaid sync', ext: 'plaid_txn_9Lm3p1', matchNote: 'Matched to POS card batch Aug 14 (window Aug 13–14)',
    link: ['MATCHED TO POS DEPOSIT', 'Card batch for business dates Aug 13–14, Vela Soho. Revenue was already booked from POS sales — this deposit records nothing new.'],
    trail: [['Matched to POS deposit', 'Expected $6,214.00 vs actual $6,214.00 · variance $0.00', 'Aug 16 · 6:10 AM'], ['Imported via Plaid', 'external id plaid_txn_9Lm3p1', 'Aug 16 · 6:00 AM']] },
  { id: 'bt-1040', acct: 'ops', txnDate: 'Aug 14', postDate: 'Aug 15', desc: 'TOAST DEPOSIT 250813 BAR VELA BKN', amount: 5732.00, dir: 'credit', merchant: 'TOAST', vendor: '—', category: '—', loc: 'BKN', status: 'Posted', match: 'deposit', source: 'Plaid sync', ext: 'plaid_txn_2Qr8s7', matchNote: 'Variance −$482.00 vs expected — flagged',
    link: ['DEPOSIT VARIANCE', 'Expected $6,214.00 for the Aug 14 Brooklyn batch; received $5,732.00. Variance −$482.00 raised an AI insight (likely held chargeback). Revenue stays as booked; the variance is tracked until resolved.'],
    trail: [['Variance flagged', '−$482.00 vs expected · AI insight created (conf 0.91)', 'Aug 15 · 6:12 AM'], ['Matched to POS deposit window', 'Aug 13–14 · Bar Vela Brooklyn', 'Aug 15 · 6:10 AM'], ['Imported via Plaid', 'external id plaid_txn_2Qr8s7', 'Aug 15 · 6:00 AM']] },
  { id: 'bt-1039', acct: 'ops', txnDate: 'Aug 15', postDate: 'Aug 15', desc: 'SYSCO EPAY 88291', amount: -1840.00, dir: 'debit', merchant: 'SYSCO', vendor: 'Sysco', category: 'COGS · Food', loc: 'MID', status: 'Posted', match: 'payment', source: 'Plaid sync', ext: 'plaid_txn_5Tv1w9', matchNote: 'Matched to payment for INV-87455 (conf 0.97)',
    link: ['MATCHED TO PAYMENT', 'Settles invoice INV-87455 (expense AUG 2026). Cash month AUG.'],
    trail: [['Matched to payment', 'Rule "SYSCO*" pre-tagged vendor; matcher confirmed against scheduled ACH.', 'Aug 15 · 6:08 AM'], ['Imported via Plaid', '', 'Aug 15 · 6:00 AM']] },
  { id: 'bt-1038', acct: 'ops', txnDate: 'Aug 14', postDate: 'Aug 14', desc: 'NYC WATER BOARD PMT', amount: -418.22, dir: 'debit', merchant: 'NYC WATER BOARD', vendor: '—', category: 'Unclassified', loc: '—', status: 'Posted', match: 'unclassified', source: 'Plaid sync', ext: 'plaid_txn_7Ye4u2', matchNote: 'No rule matched · no payment matched', suggest: ['OpEx · Utilities · Water', 0.72, 'MID (only location without a water bill this cycle)'],
    trail: [['Entered Unclassified', 'No categorization rule ≥ confidence floor; no scheduled payment within match window. Suggestion: OpEx · Utilities (conf 0.72) — below 0.90 auto-apply floor, so a human decides.', 'Aug 14 · 6:05 AM'], ['Imported via Plaid', 'external id plaid_txn_7Ye4u2', 'Aug 14 · 6:00 AM']] },
  { id: 'bt-1037', acct: 'ops', txnDate: 'Aug 14', postDate: 'Aug 14', desc: 'TRANSFER TO …9310 PAYROLL', amount: -21400.00, dir: 'debit', merchant: '—', vendor: '—', category: 'Excluded · internal transfer', loc: '—', status: 'Posted', match: 'excluded', source: 'Plaid sync', ext: 'plaid_txn_3Za6b8', matchNote: 'Rule: internal transfers excluded',
    link: ['EXCLUDED — INTERNAL TRANSFER', 'Mirror credit on Payroll …9310 the same day. Excluded from spend analytics on both sides — an internal move is never an expense.'],
    trail: [['Excluded by rule', 'Rule #1 "TRANSFER TO …9310" → auto-exclude (internal transfer). Mirror transaction linked.', 'Aug 14 · 6:04 AM'], ['Imported via Plaid', '', 'Aug 14 · 6:00 AM']] },
  { id: 'bt-1036', acct: 'amex', txnDate: 'Aug 13', postDate: 'Aug 14', desc: 'WEBSTAURANT STORE 8002', amount: -312.40, dir: 'debit', merchant: 'WEBSTAURANT', vendor: '—', category: 'Unclassified', loc: '—', status: 'Posted', match: 'unclassified', source: 'Plaid sync', ext: 'plaid_txn_6Cd9e3', matchNote: 'New merchant — no rule yet', suggest: ['OpEx · Supplies · Smallwares', 0.81, 'SOHO (card holder J. Reyes)'],
    trail: [['Entered Unclassified', 'First transaction from this merchant. Suggestion OpEx · Supplies (conf 0.81) awaits human accept.', 'Aug 14 · 6:03 AM'], ['Imported via Plaid', '', 'Aug 14 · 6:00 AM']] },
  { id: 'bt-1035', acct: 'pay', txnDate: 'Aug 14', postDate: 'Aug 14', desc: 'GUSTO PAYROLL 250814', amount: -21400.00, dir: 'debit', merchant: 'GUSTO', vendor: 'Gusto (payroll)', category: 'Labor · Payroll', loc: 'ALL', status: 'Posted', match: 'payment', source: 'Plaid sync', ext: 'plaid_txn_1Fg2h5', matchNote: 'Matched to payroll run PR-2026-33',
    link: ['MATCHED TO PAYROLL RUN', 'Payroll expense entered via the payroll integration (labor categories, per location). This debit is the cash side only.'],
    trail: [['Matched to payroll run', 'PR-2026-33 · amounts reconcile to the cent', 'Aug 14 · 6:06 AM'], ['Imported via Plaid', '', 'Aug 14 · 6:00 AM']] },
  { id: 'bt-1034', acct: 'sav', txnDate: 'Aug 12', postDate: 'Aug 12', desc: 'INTEREST PAYMENT', amount: 4.83, dir: 'credit', merchant: '—', vendor: '—', category: 'Other income · Interest', loc: '—', status: 'Posted', match: 'rule', source: 'Plaid sync', ext: 'plaid_txn_4Jk7m0', matchNote: 'Auto-classified by rule (conf 1.00)',
    trail: [['Classified by rule', 'Rule #6 "INTEREST PAYMENT on …1177" → Other income · Interest. Deterministic, conf 1.00 ≥ 0.90 floor.', 'Aug 12 · 6:02 AM'], ['Imported via Plaid', '', 'Aug 12 · 6:00 AM']] },
  { id: 'bt-1033', acct: 'ops', txnDate: 'Aug 16', postDate: '—', desc: 'CARD 4821 PENDING — US FOODS', amount: -264.90, dir: 'debit', merchant: 'US FOODS', vendor: 'US Foods', category: 'COGS · Food (pending)', loc: 'SOHO', status: 'Pending', match: 'rule', source: 'Plaid sync', ext: 'plaid_txn_0Np5q6', matchNote: 'Pending — will re-evaluate at posting',
    trail: [['Pre-classified (pending)', 'Rule "US FOODS*" → COGS · Food, conf 0.95. Final classification re-runs when the transaction posts.', 'Aug 16 · 6:01 AM'], ['Imported via Plaid (pending feed)', '', 'Aug 16 · 6:00 AM']] },
];

export const securityNotes = [
  'Bank logins are never stored — connections use Plaid OAuth; Monark holds only a revocable access token in an encrypted vault (KMS).',
  'Automatic sync every morning 6:00 AM + intraday webhooks; cursor-based, so a re-sync can never import a transaction twice.',
  'Read-only scope: Monark can read balances and transactions; it cannot move money through this connection.',
  'New transactions enter Unclassified unless a rule classifies them at ≥ 0.90 confidence.',
];

export const matchBadges: Record<MatchKind, [string, string, string]> = {
  payment: ['MATCHED · PAYMENT', '#14584a', '#eaf3ee'],
  deposit: ['MATCHED · DEPOSIT', '#14584a', '#eaf3ee'],
  rule: ['CLASSIFIED · RULE', '#4a6b8a', '#edf2f7'],
  unclassified: ['UNCLASSIFIED', '#b07c1e', '#fdf6ec'],
  excluded: ['EXCLUDED', '#5c6b64', '#f0efe9'],
};

/** Signed money: −$1,840.00 / +$6,214.00 (exact prototype formatting). */
export const signedMoney = (n: number): string => {
  const s = '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 });
  return n < 0 ? '−' + s : '+' + s;
};
