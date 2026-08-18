/**
 * MOCK DATA — development fixtures only, ported verbatim from
 * "Monark Reconciliation.dc.html". Four match types, four statuses,
 * per-signal evidence (✓/✕/~), duplicate-match guards.
 */
export type MatchType = 'inv_pay' | 'pay_bank' | 'pos_bank' | 'transfer';
export type MatchStatus = 'Matched' | 'Possible Match' | 'Unmatched' | 'Exception';
export type EvidenceSym = '✓' | '✕' | '~';

export interface Evidence { sym: EvidenceSym; label: string; finding: string }

export interface MatchSide { kind: string; title: string; sub: string; amt: string }

export interface ReconItem {
  id: string;
  type: MatchType;
  title: string;
  status: MatchStatus;
  conf: number;
  canAct?: boolean;
  left: MatchSide;
  right: MatchSide;
  evidence: Evidence[];
  guard?: string;
  trail: Array<[string, string, string, string]>;
}

const ev = (sym: EvidenceSym, label: string, finding: string): Evidence => ({ sym, label, finding });

export const reconItems: ReconItem[] = [
  { id: 'm1', type: 'pay_bank', title: "Boar's Head · $900.00", status: 'Matched', conf: 0.99,
    left: { kind: 'PAYMENT', title: 'ACH to Boar’s Head Provisions', sub: 'ACH-0812-6610 · initiated Aug 12 · invoice BH-66104', amt: '−$900.00' },
    right: { kind: 'BANK TRANSACTION', title: 'ACH DEBIT BOARSHEAD PROV', sub: 'bt-1042 · Ops …4821 · posted Aug 13', amt: '−$900.00' },
    evidence: [ev('✓', 'Amount', 'Exact: $900.00 = $900.00'), ev('✓', 'Date', 'Posted Aug 13, 1 day after initiation — within ACH window'), ev('✓', 'Vendor', 'BOARSHEAD PROV → Boar’s Head Provisions (normalized)'), ev('✓', 'Reference', 'ACH trace 6610 embedded in descriptor'), ev('✓', 'Invoice #', 'Payment settles BH-66104 (JUL expense · AUG cash)')],
    trail: [['Match confirmed (auto)', 'Confidence 0.99 ≥ 0.95 auto-confirm floor. Payment → settled; invoice lifecycle → Bank Reconciled.', 'System (matcher v2.1)', 'Aug 13 · 6:15 AM'], ['Candidate proposed', '5/5 evidence signals matched', 'System', 'Aug 13 · 6:14 AM'], ['Bank txn imported', 'Plaid sync', 'System', 'Aug 13 · 6:00 AM']] },
  { id: 'm2', type: 'pay_bank', title: 'ConEdison · $2,288.00', status: 'Possible Match', conf: 0.87, canAct: true,
    left: { kind: 'PAYMENT', title: 'ACH to ConEdison', sub: 'ACH-0828-1108 · scheduled Aug 28 · invoice CE-2026-0812', amt: '−$2,288.00' },
    right: { kind: 'BANK TRANSACTION', title: 'CONED ELEC AUTOPAY', sub: 'bt-1051 · Ops …4821 · posted Aug 16', amt: '−$2,288.00' },
    evidence: [ev('✓', 'Amount', 'Exact: $2,288.00'), ev('✕', 'Date', 'Posted Aug 16 but payment scheduled Aug 28 — 12 days early. Vendor may have pulled autopay.'), ev('✓', 'Vendor', 'CONED → ConEdison'), ev('~', 'Reference', 'No trace ID in descriptor — autopay channel differs from scheduled ACH'), ev('✓', 'Invoice #', 'Amount unique to CE-2026-0812 among open invoices')],
    guard: 'If confirmed, the scheduled Aug 28 ACH will be cancelled automatically — confirming this match while leaving the schedule live would double-pay the invoice. One payment, one debit.',
    trail: [['Awaiting human decision', 'Confidence 0.87 < 0.95 floor: date conflict requires review', 'System (matcher v2.1)', 'Aug 16 · 6:05 AM'], ['Candidate proposed', 'Amount + vendor matched; date anomaly flagged', 'System', 'Aug 16 · 6:04 AM']] },
  { id: 'm3', type: 'pos_bank', title: 'Soho card batch · Aug 14', status: 'Exception', conf: 0.91, canAct: false,
    left: { kind: 'EXPECTED POS DEPOSIT', title: 'Card batch · Vela Soho', sub: 'covers Aug 14 · expected Aug 16 (T+2)', amt: '+$6,214.00' },
    right: { kind: 'BANK TRANSACTION', title: 'TOAST DEPOSIT 250814', sub: 'bt-1049 · Ops …4821 · posted Aug 16', amt: '+$5,732.00' },
    evidence: [ev('✓', 'Date', 'Posted on expected settlement day (T+2)'), ev('✓', 'Reference', 'Batch ID 250814 matches business date'), ev('✓', 'Description', 'TOAST DEPOSIT → Soho POS provider'), ev('✕', 'Amount', 'Short by $482.00 — expected $6,214.00, received $5,732.00'), ev('~', 'Vendor', 'Processor: Toast (correct for Soho)')],
    guard: 'Matched with a $482.00 variance. Revenue was already booked from POS sales — the variance is a receivable from the processor (likely a held chargeback), never a sales adjustment. An AI insight was raised.',
    trail: [['Exception recorded', 'Variance −$482.00 · deposit matched, variance ticket opened, AI insight raised (conf 0.91: held chargeback pattern)', 'System (matcher v2.1)', 'Aug 16 · 6:06 AM'], ['Candidate proposed', 'Batch reference exact; amount short', 'System', 'Aug 16 · 6:05 AM']] },
  { id: 'm4', type: 'transfer', title: 'Payroll transfer · $21,400.00', status: 'Matched', conf: 1.0,
    left: { kind: 'BANK TXN · OPS …4821', title: 'TRANSFER TO …9310 PAYROLL', sub: 'bt-1037 · posted Aug 14', amt: '−$21,400.00' },
    right: { kind: 'BANK TXN · PAYROLL …9310', title: 'TRANSFER FROM …4821', sub: 'bt-2019 · posted Aug 14', amt: '+$21,400.00' },
    evidence: [ev('✓', 'Amount', 'Mirror amounts: −$21,400.00 / +$21,400.00'), ev('✓', 'Date', 'Same posting day'), ev('✓', 'Description', 'Account masks cross-referenced in both descriptors'), ev('✓', 'Reference', 'Rule #1 "TRANSFER TO …9310" → internal transfer'), ev('✓', 'Treatment', 'Excluded from spend on both sides — internal moves are never expenses')],
    trail: [['Paired & excluded (auto)', 'Both legs linked and excluded from analytics. Neither leg can be matched to anything else.', 'System (rule #1)', 'Aug 14 · 6:04 AM'], ['Both legs imported', 'Plaid sync', 'System', 'Aug 14 · 6:00 AM']] },
  { id: 'm5', type: 'inv_pay', title: 'Hudson Valley · $5,000.00', status: 'Matched', conf: 1.0,
    left: { kind: 'INVOICE', title: 'HVP-90187 · Hudson Valley Produce', sub: 'expense AUG 2026 · due Aug 27', amt: '$5,000.00' },
    right: { kind: 'PAYMENT', title: 'ACH scheduled Sep 3', sub: 'from Chase …4821 · cash month SEP 2026', amt: '−$5,000.00' },
    evidence: [ev('✓', 'Amount', 'Full allocation: $5,000.00 of $5,000.00'), ev('✓', 'Invoice #', 'Payment created from this invoice — hard link'), ev('✓', 'Vendor', 'Same vendor record'), ev('✓', 'Date', 'Payment date Sep 3 within terms (Net 15 + float)'), ev('✓', 'Treatment', 'AUG expense + SEP cash — one event each, never a SEP expense')],
    trail: [['Allocation locked', 'payment_matches row: $5,000.00. Unique (payment, invoice) — a second allocation of this payment is structurally impossible.', 'System', 'Aug 16 · 2:10 PM'], ['Payment scheduled from invoice', 'Treasury action by M. Okafor', 'M. Okafor (Controller)', 'Aug 16 · 2:10 PM']] },
  { id: 'm6', type: 'pos_bank', title: 'Brooklyn cash deposit · Aug 12–13', status: 'Unmatched', conf: 0, canAct: false,
    left: { kind: 'EXPECTED POS DEPOSIT', title: 'Cash drop · Bar Vela Brooklyn', sub: 'covers Aug 12–13 · expected by Aug 15', amt: '+$1,840.00' },
    right: { kind: 'BANK TRANSACTION', title: '— none found —', sub: 'no candidate within window', amt: '' },
    evidence: [ev('✕', 'Amount', 'No deposit between $1,700–$1,980 found'), ev('✕', 'Date', 'Expected window Aug 14–16 elapsed'), ev('~', 'Description', 'No CASH DEP descriptor on Ops …4821 since Aug 11'), ev('✕', 'Reference', '—'), ev('~', 'History', 'BKN cash drops usually post within 2 days')],
    guard: 'Deposit overdue. Sales revenue is already booked; the missing item is cash in transit. Escalated to GM Brooklyn — deposit slip or safe count needed.',
    trail: [['Marked missing', 'Expected window elapsed with no candidate. Notification sent to J. Osei (GM Brooklyn) and Controller.', 'System (matcher v2.1)', 'Aug 16 · 6:07 AM'], ['Expectation created', 'From POS cash totals Aug 12–13', 'System', 'Aug 14 · 6:00 AM']] },
  { id: 'm7', type: 'pay_bank', title: 'Imperial Linen · $460.00', status: 'Possible Match', conf: 0.66, canAct: true,
    left: { kind: 'PAYMENT', title: 'Check #2231 to Imperial Linen', sub: 'CHK-2231 · mailed Aug 8 · invoice IL-8817', amt: '−$460.00' },
    right: { kind: 'BANK TRANSACTION', title: 'CHECK 2213 PRESENTED', sub: 'bt-1046 · Ops …4821 · posted Aug 15', amt: '−$460.00' },
    evidence: [ev('✓', 'Amount', 'Exact: $460.00'), ev('✕', 'Reference', 'Check number differs: presented 2213 vs issued 2231 — possible bank OCR transposition'), ev('✓', 'Date', 'Aug 15 within check-clearing window'), ev('~', 'Vendor', 'Descriptor has no payee name (check presentment)'), ev('~', 'Invoice #', 'Amount matches IL-8817 but also recurring weekly $460 linen charge')],
    guard: 'Check 2213 was also issued (to Sparkle Cleaning, $460.00, voided Jul 30). Confirm only if you can verify the presented image — matching the wrong check would mask the voided item.',
    trail: [['Awaiting human decision', 'Reference conflict + amount collision with a voided check. Confidence 0.66.', 'System (matcher v2.1)', 'Aug 15 · 6:03 AM']] },
];

export const statusMeta: Record<MatchStatus, [string, string]> = {
  Matched: ['#14584a', '#eaf3ee'],
  'Possible Match': ['#b07c1e', '#fdf6ec'],
  Unmatched: ['#5c6b64', '#f0efe9'],
  Exception: ['#b3402e', '#faeeeb'],
};

export const typeMeta: Record<MatchType, [string, string]> = {
  inv_pay: ['⇄', 'Invoice → Payment'],
  pay_bank: ['⏷', 'Payment → Bank'],
  pos_bank: ['▤', 'POS Deposit → Bank'],
  transfer: ['⇆', 'Internal Transfer'],
};
