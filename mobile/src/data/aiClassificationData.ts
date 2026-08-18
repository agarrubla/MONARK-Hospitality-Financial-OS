/**
 * MOCK DATA — development fixtures only, ported verbatim from
 * "Monark AI Classification.dc.html". 7-signal evidence per suggestion;
 * auto-apply only at ≥ 0.90 with a rule, always reversible.
 */
export interface Suggestion {
  vendor: string;
  category: string;
  location: string;
  treatment: string;
}

export interface ClassTxn {
  id: string;
  desc: string;
  meta: string;
  amount: number;
  conf: number;
  autoRule?: string;
  auto?: boolean;
  suggest: Suggestion;
  reason: string;
  signals: Array<[string, string, number]>;
  confirmations: number;
  ruleQualify: boolean;
  rulePattern?: string;
}

export const classTxns: ClassTxn[] = [
  { id: 'bt-1038', desc: 'NYC WATER BOARD PMT', meta: 'Ops …4821 · Aug 14 · debit · no external match', amount: -418.22, conf: 0.72,
    suggest: { vendor: 'NYC Water Board', category: 'OpEx · Utilities · Water', location: 'Vela Trattoria Midtown', treatment: 'Direct expense (no invoice) · cash + expense both AUG 2026' },
    reason: 'Description matches "NYC WATER" utilities pattern; amount ($418) sits in the historical water-bill range for Midtown ($380–$460, 6 prior bills); no open invoice or scheduled payment within the ±3-day match window, so this is a direct expense, not a payment match.',
    signals: [
      ['Merchant', 'NYC WATER BOARD — known municipal utility; not in vendor DB as a connected vendor.', 0.8],
      ['Description', '"PMT" suffix + agency name → utility payment pattern.', 0.7],
      ['Amount', '$418.22 within Midtown water-bill band ($380–$460).', 0.6],
      ['History', '6 prior NYC Water debits, 5 categorized Utilities · Water by users.', 0.9],
      ['Vendor database', 'No AP vendor match — suggests direct-expense treatment.', 0.5],
      ['Rules', 'No matching rule. 2 more confirmations would qualify a rule offer.', 0.3],
      ['Location', 'Only Midtown has a water account paid from Ops; Soho/BKN are in landlord CAM.', 0.8],
    ],
    confirmations: 2, ruleQualify: true, rulePattern: '"NYC WATER*" on Ops …4821' },
  { id: 'bt-1036', desc: 'WEBSTAURANT STORE 8002', meta: 'Amex …3009 · Aug 13 · debit · first-seen merchant', amount: -312.40, conf: 0.81,
    suggest: { vendor: 'WebstaurantStore', category: 'OpEx · Supplies · Smallwares', location: 'Bar Vela Brooklyn', treatment: 'Card expense · accrues on card, cash at statement payment' },
    reason: 'Merchant name maps to a known restaurant-supply retailer; card was last used by BKN bar manager (cardholder J. Osei); amount too small for equipment capitalization threshold ($500).',
    signals: [
      ['Merchant', 'WEBSTAURANT → WebstaurantStore, restaurant supply (external registry).', 0.9],
      ['Description', 'Store code 8002 = online order.', 0.4],
      ['Amount', '$312.40 — below $500 capitalization threshold → OpEx, not asset.', 0.7],
      ['History', 'First transaction from this merchant — no history signal.', 0.1],
      ['Vendor database', 'No AP vendor; card-native merchant.', 0.4],
      ['Rules', 'No rule (first occurrence).', 0.1],
      ['Location', 'Cardholder J. Osei (GM Brooklyn) → BKN.', 0.8],
    ],
    confirmations: 0, ruleQualify: false },
  { id: 'bt-1029', desc: 'SQ *BLUE BOTTLE COFF', meta: 'Amex …3009 · Aug 11 · debit', amount: -64.90, conf: 0.58,
    suggest: { vendor: 'Blue Bottle Coffee', category: 'G&A · Meals & Meetings', location: 'Org — unassigned', treatment: 'Direct card expense' },
    reason: 'Square-processed retail coffee purchase. Could be staff meeting (G&A) or shift coffee (location OpEx) — history is split 3/2 between those, hence low confidence. Location unknowable from the data.',
    signals: [
      ['Merchant', 'SQ * prefix = Square retail; Blue Bottle Coffee.', 0.8],
      ['Description', 'Retail POS purchase, no invoice trail.', 0.5],
      ['Amount', '$64.90 — team-size order, ambiguous.', 0.3],
      ['History', '5 prior: 3× G&A Meals, 2× location OpEx — split signal.', 0.4],
      ['Vendor database', 'Not an AP vendor.', 0.2],
      ['Rules', 'No rule.', 0.1],
      ['Location', 'Card is shared; no cardholder-location signal.', 0.1],
    ],
    confirmations: 0, ruleQualify: false },
  { id: 'bt-1044', desc: 'ACH DEBIT HVALLEY PROD 90145', meta: 'Ops …4821 · Aug 16 · debit', amount: -2140.00, conf: 0.94, autoRule: 'Rule #2 "HVALLEY PROD*"', auto: true,
    suggest: { vendor: 'Hudson Valley Produce', category: 'Match to payment — invoice HVP-90145', location: 'Vela Soho', treatment: 'Cash side of existing payment · no new expense' },
    reason: 'Rule #2 ("HVALLEY PROD*" → vendor Hudson Valley Produce) pre-tagged the vendor at 0.94; a scheduled ACH of the same amount exists within the match window. Auto-applied because ≥ 0.90 with rule — reversible from the trail.',
    signals: [
      ['Rules', 'Rule #2 matched on description prefix — created from your 4 confirmations in July.', 1.0],
      ['Merchant', 'HVALLEY PROD → Hudson Valley Produce.', 0.9],
      ['Amount', 'Exact match to scheduled payment $2,140.00.', 1.0],
      ['History', '31 prior transactions, all this vendor.', 0.9],
      ['Vendor database', 'Active AP vendor with open invoices.', 0.9],
      ['Description', 'Invoice number 90145 embedded in descriptor.', 1.0],
      ['Location', 'Invoice HVP-90145 is a Soho invoice.', 0.9],
    ],
    confirmations: 99, ruleQualify: false },
];

export interface ClassRule {
  id: string;
  pattern: string;
  action: string;
  origin: string;
}

export const classRules: ClassRule[] = [
  { id: 'r1', pattern: 'TRANSFER TO …9310', action: 'Exclude — internal payroll transfer (both sides)', origin: 'Created by M. Okafor · Jul 2 · applied 14×' },
  { id: 'r2', pattern: 'HVALLEY PROD*', action: 'Vendor Hudson Valley Produce · match to payments', origin: 'From 4 confirmations · Jul 18 · applied 9×' },
  { id: 'r3', pattern: 'SYSCO*', action: 'Vendor Sysco · COGS · Food · match to payments', origin: 'From 5 confirmations · Jun 30 · applied 22×' },
  { id: 'r4', pattern: 'GUSTO PAYROLL*', action: 'Match to payroll run · Labor (cash side only)', origin: 'Created by M. Okafor · Jun 12 · applied 6×' },
];

export const AUTO_APPLY_FLOOR = 0.9;

export const signedMoney = (n: number): string => {
  const s = '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 });
  return n < 0 ? '−' + s : '+' + s;
};

export const confColor = (c: number): string => (c >= 0.9 ? '#14584a' : c >= 0.75 ? '#b07c1e' : '#b3402e');
