/**
 * MOCK DATA — development fixtures only, ported verbatim from
 * "Monark Intelligence.dc.html". One alert per detector class (12 detectors).
 * Alerts are read-only intelligence — they never change financial records.
 */
export type Severity = 'critical' | 'warning' | 'info';

export interface IntelAlert {
  id: string;
  kind: string;
  sev: Severity;
  title: string;
  impact: string;
  impactNote: string;
  conf: number;
  when: string;
  reason: string;
  data: Array<[string, string, string]>;
  action: string;
}

export const intelAlerts: IntelAlert[] = [
  { id: 'a1', kind: 'Labor increase', sev: 'critical', title: 'Midtown labor 4.0 pts over target', impact: '−$4,100/mo', impactNote: 'monthly run-rate vs 30% target', conf: 0.93, when: 'today 6:10 AM',
    reason: 'Labor is 34.0% of net sales MTD vs a 30% target. The variance concentrates in weekend dinner shifts: overtime hours are up 41% vs July while weekend covers are up only 6%.',
    data: [['Labor % MTD', 'payroll ÷ pos_sales · Aug 1–17', '34.0%'], ['Target', 'budget:MID-2026-08', '30.0%'], ['OT hours, weekends', 'gusto runs 0808/0815', '+41%'], ['Weekend covers', 'pos_sales Fri–Sun', '+6%']],
    action: 'Review Sat/Sun BOH scheduling with A. Petrov — the gap maps to two double-staffed stations. Rebalancing shifts saves ≈$950/week.' },
  { id: 'a2', kind: 'Vendor price increase', sev: 'warning', title: 'Hudson Valley Produce +12% on 14 items', impact: '−$1,840/mo', impactNote: 'at current volumes', conf: 0.87, when: 'today 6:10 AM',
    reason: 'Unit prices on 14 produce and dairy SKUs rose ~12% effective Aug 4, first appearing on invoice HVP-90102. Volume is unchanged, so this is price, not usage.',
    data: [['Affected SKUs', 'invoice_line_items · 14 items', '+12.1%'], ['First seen', 'inv:HVP-90102 · Aug 4', '—'], ['August impact so far', '9 invoices', '$1,012'], ['Food cost effect', 'if volumes hold', '+0.4 pts']],
    action: 'Request updated price list from HVP; get Baldor quotes for the 8 highest-impact SKUs. Contract review date is Sep 1.' },
  { id: 'a3', kind: 'Food cost increase', sev: 'warning', title: 'Food cost 33.9% vs 30% target', impact: '−$3,400/mo', impactNote: 'vs target at current revenue', conf: 0.91, when: 'today 6:10 AM',
    reason: 'Group food cost is 3.9 pts over target. Decomposition: 1.1 pts vendor pricing (HVP), 1.6 pts Midtown portioning/waste, 1.2 pts menu-mix shift toward lower-margin entrées.',
    data: [['Food cost MTD', 'COGS food ÷ food revenue', '33.9%'], ['Vendor pricing', 'HVP increase', '+1.1 pts'], ['Midtown waste', 'variance vs theoretical', '+1.6 pts'], ['Menu mix', 'entrée share +8%', '+1.2 pts']],
    action: 'Waste audit at Midtown this week (largest controllable slice); revisit pricing on the 3 entrées driving the mix shift.' },
  { id: 'a4', kind: 'Cash-flow risk', sev: 'critical', title: 'Sep 1–2 cash dip near payroll floor', impact: '$121K low', impactNote: 'projected low point', conf: 0.84, when: 'today 6:05 AM',
    reason: 'September rent ($14.5K wire Sep 1) lands two days before the Sep 3 payroll funding sweep. Projected balance dips to $121K — 1.8× the payroll requirement, below your 2.5× comfort floor.',
    data: [['Rent wire Sep 1', 'pay:WIRE-0901-SOHO', '−$14,500'], ['HVP ACH Sep 3', 'pay:ACH sched', '−$5,000'], ['Payroll sweep Sep 3', 'est. from run 0815', '−$21,900'], ['Projected low', 'forecast v2.3 · Sep 2', '$121,000']],
    action: 'Shift the HVP payment from Sep 3 to Sep 5 (within Net 15 terms) or draw $10K from reserve …1177 for the window.' },
  { id: 'a5', kind: 'Duplicate invoice', sev: 'warning', title: 'Sysco INV-88412 possible duplicate held', impact: '$2,340 at risk', impactNote: 'blocked from AP', conf: 0.98, when: 'Aug 15',
    reason: 'A re-issued PDF matches an existing Aug 9 invoice on vendor, number and total. Held at the duplicate gate — it cannot become a second expense without human confirmation.',
    data: [['Original', 'inv:INV-88412 · Aug 9', '$2,340.00'], ['New document', 'sysco-inv-88412.pdf · Aug 15', '$2,340.00'], ['Hash comparison', 'sha256 differs (re-issue)', '—'], ['Number+vendor match', 'unique constraint', 'exact']],
    action: 'Confirm duplicate and discard in AI Processing → duplicates. If Sysco insists it’s new, request a corrected invoice number.' },
  { id: 'a6', kind: 'POS reconciliation', sev: 'warning', title: 'Soho card batch short $482', impact: '−$482', impactNote: 'processor receivable', conf: 0.91, when: 'Aug 16',
    reason: 'Aug 14 Toast batch expected $6,214, bank received $5,732. Pattern matches a held chargeback; sales are unaffected — this is cash in transit.',
    data: [['Expected', 'pos_deposits · batch 250814', '$6,214.00'], ['Received', 'bt-1049 · Aug 16', '$5,732.00'], ['Variance', 'receivable, not sales adj.', '−$482.00'], ['Pattern', '3 similar cases, all chargebacks', '0.91']],
    action: 'Pull the dispute report in the Toast portal; if a chargeback, attach evidence within the 7-day window (expires Aug 21).' },
  { id: 'a7', kind: 'Unclassified transactions', sev: 'info', title: '3 bank transactions unclassified > 48h', impact: '$795 unbooked', impactNote: 'not yet in P&L', conf: 0.99, when: 'today 6:00 AM',
    reason: 'Three debits are past the 48-hour classification SLA, so August expenses are understated by up to $795 until they’re booked.',
    data: [['SQ *BLUE BOTTLE COFF', 'bt-1029 · Aug 11', '$64.90'], ['NYC WATER BOARD PMT', 'bt-1038 · Aug 14', '$418.22'], ['WEBSTAURANT STORE', 'bt-1036 · Aug 13', '$312.40']],
    action: 'Clear the classification queue — AI suggestions are ready for all three (one tap each in Bank Classification).' },
  { id: 'a8', kind: 'Large upcoming payment', sev: 'info', title: '$14.5K rent wire in 15 days', impact: '−$14,500', impactNote: 'Sep 1 · largest single outflow', conf: 1.0, when: 'today 6:00 AM',
    reason: 'Recurring Soho rent wire is the largest single outflow in the next 30 days and coincides with the Sep 1–2 cash dip (see cash-flow risk alert).',
    data: [['Payment', 'pay:WIRE-0901-SOHO', '$14,500.00'], ['Funding account', 'Chase …4821', '—'], ['Approved by', 'R. Vela · Aug 10', '—']],
    action: 'No action needed if the Sep 3 HVP payment moves to Sep 5; otherwise pre-fund from reserve by Aug 29.' },
  { id: 'a9', kind: 'Budget variance', sev: 'warning', title: 'Midtown OpEx tracking 9% over budget', impact: '−$2,230/mo', impactNote: 'projected month-end overage', conf: 0.86, when: 'today 6:10 AM',
    reason: 'MTD OpEx is $24,780 vs a pro-rated budget of $22,740. Drivers: emergency walk-in repair ($1,140) and disputed linen billing ($460).',
    data: [['OpEx MTD', 'invoices + card + direct', '$24,780'], ['Budget pro-rata', 'budget:MID-2026-08', '$22,740'], ['Walk-in repair', 'inv:CoolTech CT-2210', '$1,140'], ['Disputed linen', 'inv:IL-8842 · held', '$460']],
    action: 'Approve or contest the repair reclass; resolve the linen dispute (credit memo requested Aug 14).' },
  { id: 'a10', kind: 'Unusual expense', sev: 'warning', title: 'First-ever $1,200 cleaning invoice — rejected, watch for resubmit', impact: '$1,200 avoided', impactNote: 'unauthorized work', conf: 0.88, when: 'Aug 12',
    reason: 'Sparkle Commercial Cleaning invoiced $1,200 with no PO and no service agreement — 4.2σ above any prior cleaning spend at Brooklyn. Rejected by Controller; detector stays armed for a resubmission under a different number.',
    data: [['Invoice', 'inv:SCC-2201 · rejected', '$1,200.00'], ['Prior cleaning avg', 'BKN · 12 months', '$285/mo'], ['PO on file', 'none', '—'], ['Deviation', 'vs category baseline', '4.2σ']],
    action: 'No action needed now. If Sparkle resubmits, require a PO first — the vendor has been flagged.' },
  { id: 'a11', kind: 'Sales decline', sev: 'warning', title: 'Midtown lunch covers down 11% for 3 weeks', impact: '−$5,200/mo', impactNote: 'if trend holds', conf: 0.82, when: 'today 6:10 AM',
    reason: 'Weekday lunch covers at Midtown have declined 3 consecutive weeks (−11% vs July baseline) while dinner is flat. Avg check is stable, so it’s traffic, not spend. Two nearby office towers began summer closures Jul 28.',
    data: [['Lunch covers, 3-wk trend', 'pos_sales 11a–3p', '−11%'], ['Dinner covers', 'same period', '−0.8%'], ['Avg lunch check', 'stable', '$28.40'], ['Baseline', 'JUL weekday lunch', '142/day']],
    action: 'Treat as structural for August; consider a lunch prix fixe or delivery push. Re-baseline the September forecast to avoid over-ordering.' },
  { id: 'a12', kind: 'Margin deterioration', sev: 'info', title: 'Brooklyn margin −1.8 pts over 6 weeks', impact: '−$1,550/mo', impactNote: 'gradual erosion', conf: 0.79, when: 'today 6:10 AM',
    reason: 'Operating margin at Brooklyn slid from 21.4% to 19.6% over six weeks. No single driver: beverage cost +0.7 pts (spirits pricing), labor +0.6 pts, supplies +0.5 pts. Individually below alert thresholds — flagged because the trend compounds.',
    data: [['Margin, 6 wks ago', 'weekly P&L', '21.4%'], ['Margin, this week', 'weekly P&L', '19.6%'], ['Beverage cost drift', 'spirits invoices', '+0.7 pts'], ['Labor + supplies drift', '', '+1.1 pts']],
    action: 'Review the spirits order guide vs Southern Glazer’s new pricing; small corrections across all three drivers recover the margin.' },
];

export const sevMeta: Record<Severity, [string, string]> = {
  critical: ['#b3402e', '#faeeeb'],
  warning: ['#b07c1e', '#fdf6ec'],
  info: ['#4a6b8a', '#edf2f7'],
};
