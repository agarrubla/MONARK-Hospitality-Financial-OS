/**
 * MOCK DATA — development fixtures only, ported verbatim from
 * "Monark AP.dc.html". Invoice shapes model the domain: six dates, the
 * expense-month/payment-month split, status lifecycle, audit trail.
 */
export type InvoiceStatus =
  | 'Received' | 'Processing' | 'Review Required' | 'Pending Approval'
  | 'Approved' | 'Scheduled' | 'Paid' | 'Rejected' | 'On Hold' | 'Disputed';

export interface APInvoice {
  id: string;
  vendor: string;
  number: string;
  po: string;
  loc: 'SOHO' | 'MID' | 'BKN';
  cat: string;
  terms: string;
  invDate: string;
  svcDate: string;
  expDate: string;
  expMonth: string;
  due: string;
  sub: number;
  tax: number;
  total: number;
  status: InvoiceStatus;
  payDate: string | null;
  payMonth: string;
  payStatus: string;
  crossDemo?: boolean;
  actionable?: boolean;
  lines: Array<[string, string, number]>;
  audit: Array<[string, string, string, string]>;
}

export const apInvoices: APInvoice[] = [
  { id: 'i1', vendor: 'Hudson Valley Produce', number: 'HVP-90187', po: 'PO-2214', loc: 'SOHO', cat: 'COGS · Food', terms: 'Net 15', invDate: 'Aug 12', svcDate: 'Aug 11', expDate: 'Aug 12', expMonth: 'AUG 2026', due: 'Aug 27', sub: 4630.84, tax: 369.16, total: 5000.00, status: 'Paid', payDate: 'Sep 3 (sched)', payMonth: 'SEP 2026', payStatus: 'Scheduled Sep 3', crossDemo: true,
    lines: [['Organic produce — weekly order', 'COGS · Food · Produce', 3980.84], ['Dairy — cream & butter', 'COGS · Food · Dairy', 650.00]],
    audit: [['Payment scheduled', 'Sep 3 ACH from Chase …4821 · payment month SEP 2026 — cash only, no new expense', 'M. Okafor (Controller)', 'Aug 16 · 2:10 PM'], ['Approved · step 2 of 2', 'Within policy · chain: GM → Controller', 'M. Okafor (Controller)', 'Aug 14 · 9:32 AM'], ['Approved · step 1 of 2', 'Quantities verified against delivery', 'J. Reyes (GM Soho)', 'Aug 13 · 4:18 PM'], ['Expense booked to AUG 2026', 'Expense date Aug 12 → P&L month August', 'System', 'Aug 12 · 11:04 AM'], ['Created from email capture', 'OCR conf 0.96 · duplicate guards passed', 'System', 'Aug 12 · 11:03 AM']] },
  { id: 'i2', vendor: 'Sysco', number: 'INV-88412', po: '—', loc: 'MID', cat: 'COGS · Food', terms: 'Net 30', invDate: 'Aug 9', svcDate: 'Aug 9', expDate: 'Aug 9', expMonth: 'AUG 2026', due: 'Sep 8', sub: 2166.67, tax: 173.33, total: 2340.00, status: 'On Hold', payDate: null, payMonth: '—', payStatus: 'Unpaid',
    lines: [['Dry goods & proteins', 'COGS · Food', 2166.67]],
    audit: [['Held — possible duplicate', 'Matches INV-88412 entered Aug 9 by amount + number. AI conf 0.98. Human review required before it can rejoin the queue.', 'System (AI duplicate guard)', 'Aug 15 · 7:40 AM'], ['Created from upload', 'Uploaded by AP clerk', 'D. Kim (AP)', 'Aug 15 · 7:39 AM']] },
  { id: 'i3', vendor: "Southern Glazer's", number: 'SG-44120', po: 'PO-2231', loc: 'BKN', cat: 'COGS · Beverage', terms: 'Net 30', invDate: 'Aug 14', svcDate: 'Aug 14', expDate: 'Aug 14', expMonth: 'AUG 2026', due: 'Sep 13', sub: 3425.93, tax: 274.07, total: 3700.00, status: 'Pending Approval', payDate: null, payMonth: '—', payStatus: 'Unpaid', actionable: true,
    lines: [['Wine — by-the-glass program', 'COGS · Beverage · Wine', 2280.93], ['Spirits restock', 'COGS · Beverage · Spirits', 1145.00]],
    audit: [['Sent for approval', 'Over $2,500 → 2-step chain: GM → Controller. Awaiting step 1.', 'System', 'Aug 14 · 3:22 PM'], ['Expense booked to AUG 2026', 'Expense date Aug 14', 'System', 'Aug 14 · 3:21 PM'], ['Created from vendor EDI', 'Integration: Southern Glazer’s', 'System', 'Aug 14 · 3:20 PM']] },
  { id: 'i4', vendor: 'Baldor Specialty Foods', number: 'BSF-77301', po: '—', loc: 'SOHO', cat: 'COGS · Food', terms: 'Net 15', invDate: 'Aug 15', svcDate: 'Aug 15', expDate: 'Aug 15', expMonth: 'AUG 2026', due: 'Aug 30', sub: 1203.70, tax: 96.30, total: 1300.00, status: 'Review Required', payDate: null, payMonth: '—', payStatus: 'Unpaid',
    lines: [['Specialty produce', 'COGS · Food · Produce', 1203.70]],
    audit: [['Flagged for review', 'OCR line total ($1,203.70) ≠ stated subtotal ($1,230.70) — transposition suspected. Needs human correction.', 'System (OCR validator)', 'Aug 15 · 8:12 AM'], ['Created from email capture', 'OCR conf 0.71 — below auto-accept threshold', 'System', 'Aug 15 · 8:11 AM']] },
  { id: 'i5', vendor: 'ConEdison', number: 'CE-2026-0812', po: '—', loc: 'MID', cat: 'OpEx · Utilities', terms: 'Net 20', invDate: 'Aug 10', svcDate: 'Jul 8–Aug 7', expDate: 'Jul 31', expMonth: 'JUL 2026', due: 'Aug 30', sub: 2118.52, tax: 169.48, total: 2288.00, status: 'Scheduled', payDate: 'Aug 28 (sched)', payMonth: 'AUG 2026', payStatus: 'Scheduled Aug 28', crossDemo: true,
    lines: [['Electricity — service period Jul 8–Aug 7', 'OpEx · Utilities', 2118.52]],
    audit: [['Payment scheduled', 'Aug 28 ACH · payment month AUG 2026', 'M. Okafor (Controller)', 'Aug 13 · 10:02 AM'], ['Approved', 'Recurring utility under threshold — single approver', 'M. Okafor (Controller)', 'Aug 13 · 10:01 AM'], ['Expense dated to service period', 'Service through Jul → expense date Jul 31, P&L month JULY. Cash will land in August — no July cash, no August expense.', 'D. Kim (AP)', 'Aug 12 · 3:45 PM'], ['Created from upload', '', 'D. Kim (AP)', 'Aug 12 · 3:44 PM']] },
  { id: 'i6', vendor: 'EcoLab', number: 'EL-55118', po: 'PO-2198', loc: 'BKN', cat: 'OpEx · Supplies', terms: 'Net 30', invDate: 'Aug 4', svcDate: 'Aug 4', expDate: 'Aug 4', expMonth: 'AUG 2026', due: 'Sep 3', sub: 611.11, tax: 48.89, total: 660.00, status: 'Approved', payDate: null, payMonth: '—', payStatus: 'Unpaid · not scheduled',
    lines: [['Chemicals & dish program', 'OpEx · Supplies', 611.11]],
    audit: [['Approved', 'Single-step — under $2,500', 'J. Osei (GM Brooklyn)', 'Aug 6 · 1:15 PM'], ['Expense booked to AUG 2026', '', 'System', 'Aug 4 · 5:30 PM'], ['Created from email capture', 'OCR conf 0.95', 'System', 'Aug 4 · 5:29 PM']] },
  { id: 'i7', vendor: 'Pat LaFrieda Meats', number: 'PLF-30991', po: 'PO-2242', loc: 'SOHO', cat: 'COGS · Food', terms: 'Net 7', invDate: 'Aug 16', svcDate: 'Aug 16', expDate: 'Aug 16', expMonth: 'AUG 2026', due: 'Aug 23', sub: 1759.26, tax: 140.74, total: 1900.00, status: 'Processing', payDate: null, payMonth: '—', payStatus: 'Unpaid',
    lines: [['Dry-aged beef program', 'COGS · Food · Meat', 1759.26]],
    audit: [['OCR extraction running', 'Line-item split pending', 'System', 'Aug 16 · 9:02 AM'], ['Created from upload', 'Photo capture via mobile', 'J. Reyes (GM Soho)', 'Aug 16 · 9:01 AM']] },
  { id: 'i8', vendor: 'Imperial Linen', number: 'IL-8842', po: '—', loc: 'MID', cat: 'OpEx · Supplies', terms: 'Net 15', invDate: 'Aug 13', svcDate: 'Aug 13', expDate: 'Aug 13', expMonth: 'AUG 2026', due: 'Aug 28', sub: 425.93, tax: 34.07, total: 460.00, status: 'Disputed', payDate: null, payMonth: '—', payStatus: 'Unpaid · disputed',
    lines: [['Weekly linen service', 'OpEx · Supplies · Linen', 425.93]],
    audit: [['Disputed with vendor', 'Billed 4 deliveries; received 3 (Aug 6 missed). Credit memo requested.', 'A. Petrov (GM Midtown)', 'Aug 14 · 11:20 AM'], ['Approved', '', 'A. Petrov (GM Midtown)', 'Aug 13 · 6:40 PM'], ['Created from email capture', '', 'System', 'Aug 13 · 6:38 PM']] },
  { id: 'i9', vendor: 'Sparkle Commercial Cleaning', number: 'SCC-2201', po: '—', loc: 'BKN', cat: 'OpEx · Services', terms: 'Due on receipt', invDate: 'Aug 11', svcDate: 'Aug 10', expDate: 'Aug 10', expMonth: 'AUG 2026', due: 'Aug 11', sub: 1200.00, tax: 0, total: 1200.00, status: 'Rejected', payDate: null, payMonth: '—', payStatus: 'Will not pay',
    lines: [['Deep clean — hood & kitchen', 'OpEx · Services', 1200.00]],
    audit: [['Rejected', 'Work not authorized — no PO, no service agreement on file. Vendor notified.', 'M. Okafor (Controller)', 'Aug 12 · 2:55 PM'], ['Sent for approval', '', 'System', 'Aug 11 · 4:12 PM'], ['Created from upload', '', 'D. Kim (AP)', 'Aug 11 · 4:10 PM']] },
  { id: 'i10', vendor: 'Hudson Valley Produce', number: 'HVP-90233', po: 'PO-2250', loc: 'SOHO', cat: 'COGS · Food', terms: 'Net 15', invDate: 'Aug 16', svcDate: 'Aug 16', expDate: 'Aug 16', expMonth: 'AUG 2026', due: 'Aug 31', sub: 2870.37, tax: 229.63, total: 3100.00, status: 'Received', payDate: null, payMonth: '—', payStatus: 'Unpaid',
    lines: [['Produce — weekend order', 'COGS · Food · Produce', 2870.37]],
    audit: [['Created from upload', 'Duplicate guards passed (vendor+number unique, doc hash new)', 'You', 'Aug 17 · 9:41 AM']] },
  { id: 'i11', vendor: 'Boar’s Head Provisions', number: 'BH-66104', po: '—', loc: 'MID', cat: 'COGS · Food', terms: 'Net 30', invDate: 'Jul 28', svcDate: 'Jul 28', expDate: 'Jul 28', expMonth: 'JUL 2026', due: 'Aug 27', sub: 833.33, tax: 66.67, total: 900.00, status: 'Paid', payDate: 'Aug 12', payMonth: 'AUG 2026', payStatus: 'Paid Aug 12', crossDemo: true,
    lines: [['Deli & charcuterie', 'COGS · Food', 833.33]],
    audit: [['Payment settled', 'ACH cleared · matched to bank debit Chase …4821 · cash month AUG 2026', 'System (bank match, conf 0.99)', 'Aug 13 · 6:15 AM'], ['Payment initiated', 'ACH $900.00 from Chase …4821', 'M. Okafor (Controller)', 'Aug 12 · 10:30 AM'], ['Approved', '', 'A. Petrov (GM Midtown)', 'Jul 30 · 2:12 PM'], ['Expense booked to JUL 2026', 'July expense · paid in August — July P&L, August cash', 'System', 'Jul 28 · 4:50 PM'], ['Created from email capture', '', 'System', 'Jul 28 · 4:49 PM']] },
];

/** [text, background] per status — exact prototype values. */
export const statusColors: Record<InvoiceStatus, [string, string]> = {
  Received: ['#4a6b8a', '#edf2f7'],
  Processing: ['#4a6b8a', '#edf2f7'],
  'Review Required': ['#b07c1e', '#fdf6ec'],
  'Pending Approval': ['#b07c1e', '#fdf6ec'],
  Approved: ['#14584a', '#eaf3ee'],
  Scheduled: ['#14584a', '#eaf3ee'],
  Paid: ['#5c6b64', '#f0efe9'],
  Rejected: ['#b3402e', '#faeeeb'],
  'On Hold': ['#b3402e', '#faeeeb'],
  Disputed: ['#b3402e', '#faeeeb'],
};

export const approvalLabel: Record<InvoiceStatus, string> = {
  'Pending Approval': 'Awaiting step 1 of 2',
  Approved: 'Fully approved',
  Scheduled: 'Fully approved',
  Paid: 'Fully approved',
  Rejected: 'Rejected',
  'On Hold': 'Suspended — held',
  Disputed: 'Approved · payment blocked',
  'Review Required': 'Not yet routed',
  Received: 'Not yet routed',
  Processing: 'Not yet routed',
};

export const uploadFields: Array<[string, string, string]> = [
  ['Vendor', 'Hudson Valley Produce', '0.98'],
  ['Invoice #', 'HVP-90233', '0.97'],
  ['Invoice date', 'Aug 16, 2026', '0.96'],
  ['Service date', 'Aug 16, 2026', '0.92'],
  ['Expense date', 'Aug 16 → AUG 2026', 'derived'],
  ['Subtotal', '$2,870.37', '0.95'],
  ['Tax', '$229.63', '0.95'],
  ['Total', '$3,100.00', '0.99'],
  ['Suggested category', 'COGS · Food · Produce', '0.89'],
  ['Location', 'Vela Soho (from PO-2250)', '0.91'],
];

export const money = (n: number): string =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2 });
