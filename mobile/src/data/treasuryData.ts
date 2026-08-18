/**
 * MOCK DATA — development fixtures only, ported verbatim from
 * "Monark Treasury.dc.html".
 */
export type PaymentStatus = 'Ready' | 'Scheduled' | 'Paid' | 'Failed';
export type Priority = 'critical' | 'high' | 'normal';

export interface TreasuryPayment {
  id: string;
  vendor: string;
  invoice: string;
  amount: number;
  due: string;
  terms: string;
  prio: Priority;
  approvedBy: string;
  approvedDate: string;
  method: string;
  status: PaymentStatus;
  schedDate?: string;
  paidDate?: string;
  ref?: string;
  expM: string;
  payM: string;
  reconciled?: boolean;
  history: Array<[string, string, string, string]>;
}

export const treasuryPayments: TreasuryPayment[] = [
  { id: 'p1', vendor: 'Hudson Valley Produce', invoice: 'HVP-90187 · SOHO', amount: 5000.00, due: 'Aug 27', terms: 'Net 15', prio: 'high', approvedBy: 'J. Reyes → M. Okafor', approvedDate: 'Aug 14', method: 'ACH', status: 'Scheduled', schedDate: 'Sep 3', ref: 'ACH-0917-4421', expM: 'AUG', payM: 'SEP',
    history: [['Payment scheduled', 'ACH $5,000.00 · Sep 3 from Chase …4821 · cash month SEP 2026. Vendor prefers month-start settlement; due-date float used.', 'M. Okafor (Controller)', 'Aug 16 · 2:10 PM'], ['Entered Treasury queue', 'Chain complete (rule 2) · funding check passed', 'System', 'Aug 14 · 9:33 AM'], ['Approved · chain complete', 'GM Soho → Controller', 'M. Okafor (Controller)', 'Aug 14 · 9:32 AM']] },
  { id: 'p2', vendor: 'EcoLab', invoice: 'EL-55118 · BKN', amount: 660.00, due: 'Sep 3', terms: 'Net 30', prio: 'normal', approvedBy: 'J. Osei', approvedDate: 'Aug 6', method: '—', status: 'Ready', expM: 'AUG', payM: '—',
    history: [['Entered Treasury queue', 'Chain complete (rule 1, single step)', 'System', 'Aug 6 · 1:16 PM'], ['Approved', 'GM Brooklyn', 'J. Osei (GM Brooklyn)', 'Aug 6 · 1:15 PM']] },
  { id: 'p3', vendor: 'Pat LaFrieda Meats', invoice: 'PLF-30991 · SOHO', amount: 1900.00, due: 'Aug 23', terms: 'Net 7', prio: 'high', approvedBy: 'J. Reyes', approvedDate: 'Aug 16', method: '—', status: 'Ready', expM: 'AUG', payM: '—',
    history: [['Entered Treasury queue', 'Chain complete · short terms (Net 7) — flagged high priority by due date', 'System', 'Aug 16 · 11:20 AM'], ['Approved', 'GM Soho', 'J. Reyes (GM Soho)', 'Aug 16 · 11:18 AM']] },
  { id: 'p4', vendor: 'ConEdison', invoice: 'CE-2026-0812 · MID', amount: 2288.00, due: 'Aug 30', terms: 'Net 20', prio: 'normal', approvedBy: 'M. Okafor', approvedDate: 'Aug 13', method: 'ACH', status: 'Scheduled', schedDate: 'Aug 28', ref: 'ACH-0828-1108', expM: 'JUL', payM: 'AUG',
    history: [['Payment scheduled', 'ACH $2,288.00 · Aug 28 from Chase …4821 · cash month AUG. July expense unchanged.', 'M. Okafor (Controller)', 'Aug 13 · 10:02 AM'], ['Entered Treasury queue', 'Chain complete', 'System', 'Aug 13 · 10:01 AM'], ['Approved', 'Recurring utility, single step', 'M. Okafor (Controller)', 'Aug 13 · 10:01 AM']] },
  { id: 'p5', vendor: 'Rent — 400 W Broadway LLC', invoice: 'SEP-RENT-SOHO · SOHO', amount: 14500.00, due: 'Sep 1', terms: 'Due 1st', prio: 'critical', approvedBy: 'R. Vela', approvedDate: 'Aug 10', method: 'Wire', status: 'Scheduled', schedDate: 'Sep 1', ref: 'WIRE-0901-SOHO', expM: 'SEP', payM: 'SEP',
    history: [['Payment scheduled', 'Wire $14,500.00 · Sep 1 · recurring lease obligation', 'M. Okafor (Controller)', 'Aug 12 · 9:00 AM'], ['Approved', 'Owner approval (over $10K)', 'R. Vela (Owner)', 'Aug 10 · 5:30 PM']] },
  { id: 'p6', vendor: "Boar's Head Provisions", invoice: 'BH-66104 · MID', amount: 900.00, due: 'Aug 27', terms: 'Net 30', prio: 'normal', approvedBy: 'A. Petrov', approvedDate: 'Jul 30', method: 'ACH', status: 'Paid', paidDate: 'Aug 12', ref: 'ACH-0812-6610', expM: 'JUL', payM: 'AUG', reconciled: true,
    history: [['Bank reconciled', 'Debit −$900.00 matched on Chase …4821 (conf 0.99). Lifecycle closed.', 'System (bank match)', 'Aug 13 · 6:15 AM'], ['Payment settled', 'ACH cleared · cash month AUG 2026', 'System', 'Aug 13 · 6:00 AM'], ['Payment initiated', 'ACH trace ACH-0812-6610', 'M. Okafor (Controller)', 'Aug 12 · 10:30 AM'], ['Approved', 'GM Midtown', 'A. Petrov (GM Midtown)', 'Jul 30 · 2:12 PM']] },
  { id: 'p7', vendor: 'Imperial Linen', invoice: 'IL-8804 · MID', amount: 460.00, due: 'Jul 28', terms: 'Net 15', prio: 'normal', approvedBy: 'A. Petrov', approvedDate: 'Jul 15', method: 'Check', status: 'Paid', paidDate: 'Jul 24', ref: 'CHK-2214', expM: 'JUL', payM: 'JUL',
    history: [['Check cleared', 'CHK-2214 cleared · bank matched', 'System', 'Jul 29 · 6:10 AM'], ['Payment recorded', 'Check #2214 mailed', 'D. Kim (AP)', 'Jul 24 · 3:00 PM'], ['Approved', '', 'A. Petrov (GM Midtown)', 'Jul 15 · 1:40 PM']] },
  { id: 'p8', vendor: 'Sysco', invoice: 'INV-87200 · MID', amount: 3120.00, due: 'Aug 5', terms: 'Net 30', prio: 'normal', approvedBy: 'A. Petrov → M. Okafor', approvedDate: 'Jul 22', method: 'ACH', status: 'Failed', ref: 'ACH-0805-8720', expM: 'JUL', payM: '—',
    history: [['Payment failed', 'ACH returned R01 (insufficient funds at 6:00 AM sweep). No cash left the account — no cash event recorded. Re-queued for retry after payroll.', 'System', 'Aug 5 · 6:12 AM'], ['Payment initiated', 'ACH from Chase …4821', 'M. Okafor (Controller)', 'Aug 4 · 4:00 PM'], ['Approved · chain complete', '', 'M. Okafor (Controller)', 'Jul 22 · 11:00 AM']] },
];

/** Calendar day grid: [label, payroll?] — payments resolve by schedDate. */
export const calendarDays: Array<[string, boolean]> = [
  ['Tue Aug 19', false], ['Thu Aug 21', false], ['Fri Aug 22', false],
  ['Sat Aug 23', false], ['Thu Aug 28', false], ['Fri Aug 29', true],
  ['Mon Sep 1', false], ['Wed Sep 3', false], ['Fri Sep 12', true], ['Mon Sep 15', false],
];

export const PAYROLL_AMOUNT = 21400;

export const paymentBadgeColors: Record<PaymentStatus, [string, string]> = {
  Ready: ['#b07c1e', '#fdf6ec'],
  Scheduled: ['#14584a', '#eaf3ee'],
  Paid: ['#5c6b64', '#f0efe9'],
  Failed: ['#b3402e', '#faeeeb'],
};

export const money = (n: number): string =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2 });
