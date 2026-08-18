/**
 * MOCK DATA — development fixtures only, ported verbatim from
 * "Monark AI Invoice Processing.dc.html".
 */
export interface ExtractedField {
  label: string;
  key: string;
  val: string;
  conf: number | null; // null = derived
}

export type DocStage = 'Ready to confirm' | 'Human review' | 'Duplicate check' | 'Processing';

export interface AIDoc {
  id: string;
  vendor: string;
  total: number;
  stage: DocStage;
  channel: string;
  channelIcon: string;
  file: string;
  source: string;
  overall: number;
  docNote?: string;
  dupe?: boolean;
  dupeConf?: string;
  dupeNote?: string;
  processing?: boolean;
  fields: ExtractedField[];
  lines: Array<[string, string, string]>;
  lineConf: string;
  sumOk: boolean;
}

const F = (label: string, key: string, val: string, conf: number | null): ExtractedField => ({ label, key, val, conf });

export const aiDocs: AIDoc[] = [
  { id: 'd1', vendor: 'Pat LaFrieda Meats', total: 1900.00, stage: 'Ready to confirm', channel: 'upload', channelIcon: '↑', file: 'plf-30991.jpg', source: 'Manual upload · photo · J. Reyes · 9:01 AM', overall: 0.94,
    docNote: 'Single-page invoice photo. Deskewed and OCR’d; layout matched to Pat LaFrieda template learned from 22 prior invoices.',
    fields: [F('Vendor', 'vendor', 'Pat LaFrieda Meats', 0.98), F('Invoice #', 'number', 'PLF-30991', 0.97), F('Invoice date', 'invDate', 'Aug 16, 2026', 0.96), F('Expense date', 'expDate', 'Aug 16 → AUG 2026', null), F('Due date', 'due', 'Aug 23, 2026', 0.93), F('Subtotal', 'sub', '$1,759.26', 0.95), F('Tax', 'tax', '$140.74', 0.94), F('Total', 'total', '$1,900.00', 0.99), F('Category', 'cat', 'COGS · Food · Meat', 0.92), F('Location', 'loc', 'Vela Soho (PO-2242)', 0.95)],
    lines: [['Dry-aged ribeye — 24 lb', 'COGS · Food · Meat', '$1,214.26'], ['Burger blend — 30 lb', 'COGS · Food · Meat', '$545.00']], lineConf: 'CONF 0.93', sumOk: true },
  { id: 'd2', vendor: 'City Wide Fire Safety', total: 840.00, stage: 'Human review', channel: 'email', channelIcon: '✉', file: 'cwfs-inspection.pdf', source: 'Email capture · ap@velagroup.monark.app · 7:12 AM', overall: 0.63,
    docNote: 'New vendor — no learned template. Two candidate totals found on the page; date format ambiguous (08/09 vs 09/08).',
    fields: [F('Vendor', 'vendor', 'City Wide Fire Safety', 0.88), F('Invoice #', 'number', 'CW-1108', 0.81), F('Invoice date', 'invDate', 'Aug 9, 2026', 0.54), F('Expense date', 'expDate', 'Aug 9 → AUG 2026', null), F('Due date', 'due', 'Sep 8, 2026', 0.58), F('Subtotal', 'sub', '$840.00', 0.62), F('Tax', 'tax', '$0.00', 0.51), F('Total', 'total', '$840.00', 0.67), F('Category', 'cat', 'OpEx · Repairs & Maintenance', 0.49), F('Location', 'loc', 'Unknown — no PO match', 0.31)],
    lines: [['Annual hood suppression inspection', 'OpEx · R&M', '$840.00']], lineConf: 'CONF 0.60', sumOk: true },
  { id: 'd3', vendor: 'Sysco', total: 2340.00, stage: 'Duplicate check', channel: 'portal', channelIcon: '▣', file: 'sysco-inv-88412.pdf', source: 'Vendor portal · Sysco account · Aug 15', overall: 0.96, dupe: true, dupeConf: '0.98',
    dupeNote: 'INV-88412 matches an existing invoice from Aug 9: same vendor, same number, same total ($2,340.00). Document hash differs (re-issued PDF). Held from AP — it cannot become a second expense unless a human confirms it is genuinely new.',
    fields: [F('Vendor', 'vendor', 'Sysco', 0.99), F('Invoice #', 'number', 'INV-88412', 0.99), F('Invoice date', 'invDate', 'Aug 9, 2026', 0.97), F('Expense date', 'expDate', 'Aug 9 → AUG 2026', null), F('Due date', 'due', 'Sep 8, 2026', 0.96), F('Subtotal', 'sub', '$2,166.67', 0.97), F('Tax', 'tax', '$173.33', 0.97), F('Total', 'total', '$2,340.00', 0.99), F('Category', 'cat', 'COGS · Food', 0.94), F('Location', 'loc', 'Vela Trattoria Midtown', 0.93)],
    lines: [['Dry goods & proteins', 'COGS · Food', '$2,166.67']], lineConf: 'CONF 0.95', sumOk: true },
  { id: 'd4', vendor: 'Hudson Valley Produce', total: 3100.00, stage: 'Processing', channel: 'api', channelIcon: '⇄', file: 'hvp-90233 (EDI)', source: 'API · EDI 810 · Hudson Valley Produce · 9:40 AM', overall: 0.90, processing: true,
    docNote: 'Structured EDI document — field extraction is deterministic; category and location mapping still ML-scored.',
    fields: [F('Vendor', 'vendor', 'Hudson Valley Produce', 0.99), F('Invoice #', 'number', 'HVP-90233', 0.99), F('Invoice date', 'invDate', 'Aug 16, 2026', 0.99), F('Expense date', 'expDate', 'Aug 16 → AUG 2026', null), F('Due date', 'due', 'Aug 31, 2026', 0.99), F('Subtotal', 'sub', '$2,870.37', 0.99), F('Tax', 'tax', '$229.63', 0.99), F('Total', 'total', '$3,100.00', 0.99), F('Category', 'cat', 'COGS · Food · Produce', 0.89), F('Location', 'loc', 'Vela Soho (PO-2250)', 0.91)],
    lines: [['Produce — weekend order', 'COGS · Food · Produce', '$2,870.37']], lineConf: 'CONF 0.97', sumOk: true },
  { id: 'd5', vendor: 'Baldor Specialty Foods', total: 1300.00, stage: 'Human review', channel: 'email', channelIcon: '✉', file: 'bsf-77301.pdf', source: 'Email capture · Aug 15 · 8:11 AM', overall: 0.71,
    docNote: 'Line total ($1,203.70) disagrees with stated subtotal ($1,230.70) — transposition suspected. Math check failed, so the invoice cannot proceed without correction.',
    fields: [F('Vendor', 'vendor', 'Baldor Specialty Foods', 0.96), F('Invoice #', 'number', 'BSF-77301', 0.94), F('Invoice date', 'invDate', 'Aug 15, 2026', 0.92), F('Expense date', 'expDate', 'Aug 15 → AUG 2026', null), F('Due date', 'due', 'Aug 30, 2026', 0.91), F('Subtotal', 'sub', '$1,230.70', 0.55), F('Tax', 'tax', '$96.30', 0.88), F('Total', 'total', '$1,300.00', 0.90), F('Category', 'cat', 'COGS · Food · Produce', 0.93), F('Location', 'loc', 'Vela Soho', 0.90)],
    lines: [['Specialty produce', 'COGS · Food · Produce', '$1,203.70']], lineConf: 'CONF 0.86', sumOk: false },
];

export const intakeChannels = [
  { icon: '↑', label: 'Manual upload', count: '14', sub: 'photo & PDF' },
  { icon: '✉', label: 'Invoice email', count: '31', sub: 'ap@velagroup.monark.app' },
  { icon: '▣', label: 'Vendor portal', count: '8', sub: '3 vendors connected' },
  { icon: '⇄', label: 'API / EDI', count: '22', sub: 'Sysco, HVP, Baldor' },
];

export const aiGuardrails = [
  'AI never approves an invoice — approval chains are always human.',
  'AI never initiates or schedules a payment.',
  'Overall confidence below 0.75, any failed math check, or a duplicate signal forces Human Review.',
  'Every extraction, correction and decision is written to the audit log.',
];

export const stageBadges: Record<DocStage, [string, string]> = {
  'Ready to confirm': ['#14584a', '#eaf3ee'],
  'Human review': ['#b07c1e', '#fdf6ec'],
  'Duplicate check': ['#b3402e', '#faeeeb'],
  Processing: ['#4a6b8a', '#edf2f7'],
};

export const REVIEW_THRESHOLD = 0.75;

export const confColor = (c: number | null): string =>
  c === null ? '#8b978f' : c >= 0.9 ? '#14584a' : c >= 0.75 ? '#b07c1e' : '#b3402e';
