/**
 * MOCK DATA — development fixtures only, ported verbatim from
 * "Monark Email Ingestion.dc.html". 8-step pipeline per email, full
 * provenance (Message-ID, .eml archived).
 */
export type StepStatus = 'done' | 'warn' | 'stop' | 'hold' | 'active' | 'todo';

export interface PipelineStep {
  title: string;
  when: string;
  detail: string;
  status: StepStatus;
  conf?: number;
}

export type OutcomeKind = 'ok' | 'warn' | 'stop' | 'run';

export interface EmailFixture {
  id: string;
  sender: string;
  time: string;
  subject: string;
  attachment: string;
  ext: string;
  size: string | null;
  msgId: string;
  status: string;
  overall: number;
  processing?: boolean;
  steps: PipelineStep[];
  outcome: { kind: OutcomeKind; title: string; note: string; action: string | null };
}

const step = (title: string, when: string, detail: string, status: StepStatus, conf?: number): PipelineStep =>
  ({ title, when, detail, status, conf });

export const emails: EmailFixture[] = [
  { id: 'e1', sender: 'billing@hudsonvalleyproduce.com', time: '9:38 AM', subject: 'Invoice HVP-90233 — Vela Soho weekend order', attachment: 'hvp-90233.pdf', ext: 'PDF', size: '182 KB', msgId: '<20260817143801.8842@hvp.com>', status: 'Pending Approval', overall: 0.94,
    steps: [
      step('Email received', '9:38:01 AM', 'From billing@hudsonvalleyproduce.com to ap@velagroup.monark.app. SPF/DKIM pass. Raw .eml archived.', 'done'),
      step('Attachment detected', '9:38:02 AM', '1 attachment: hvp-90233.pdf (182 KB). Inline logo images ignored.', 'done'),
      step('Document validated', '9:38:03 AM', 'Valid PDF, 1 page, text layer present. SHA-256 fingerprint computed — no prior document matches.', 'done'),
      step('OCR / AI extraction', '9:38:09 AM', 'Vendor, number, dates, amounts and 2 line items extracted. Expense date Aug 16 → expense month AUG 2026.', 'done', 0.96),
      step('Vendor matched', '9:38:10 AM', 'Matched to existing vendor "Hudson Valley Produce" (learned template, 31 prior invoices).', 'done', 0.99),
      step('Duplicate check', '9:38:10 AM', 'Vendor + invoice number unique; document hash new; no amount/date collision. Clear.', 'done', 0.98),
      step('Expense classified', '9:38:11 AM', 'COGS · Food · Produce, Vela Soho (PO-2250 referenced in subject).', 'done', 0.91),
      step('AP record created', '9:38:12 AM', 'Invoice created as Received → routed to approval chain (over $2,500: GM → Controller). AI does not approve or pay.', 'done'),
    ],
    outcome: { kind: 'ok', title: 'Created → Pending Approval', note: 'AP record HVP-90233 ($3,100.00) is awaiting step 1 of 2 (GM Soho). Full email provenance attached.', action: 'Open invoice in AP' } },
  { id: 'e2', sender: 'accounts@citywidefire.com', time: '7:12 AM', subject: 'Inspection invoice — annual hood suppression', attachment: 'cwfs-inspection.pdf', ext: 'PDF', size: '96 KB', msgId: '<CWFS-1108-20260817@citywidefire.com>', status: 'Review Required', overall: 0.63,
    steps: [
      step('Email received', '7:12:44 AM', 'From accounts@citywidefire.com. SPF pass, DKIM pass. Raw .eml archived.', 'done'),
      step('Attachment detected', '7:12:45 AM', '1 attachment: cwfs-inspection.pdf (96 KB).', 'done'),
      step('Document validated', '7:12:46 AM', 'Valid PDF, scanned (no text layer) — image OCR path used.', 'done'),
      step('OCR / AI extraction', '7:12:58 AM', 'Two candidate totals found; date format ambiguous (08/09 vs 09/08). Key amounts below threshold.', 'warn', 0.63),
      step('Vendor matched', '7:12:59 AM', 'No existing vendor matched "City Wide Fire Safety" — would create a new vendor on confirmation.', 'warn', 0.55),
      step('Duplicate check', '7:12:59 AM', 'No collision found (new vendor).', 'done', 0.97),
      step('Expense classified', '7:13:00 AM', 'Best guess OpEx · Repairs & Maintenance; location unknown — no PO reference.', 'warn', 0.49),
      step('Routed to Human Review', '7:13:01 AM', 'Overall confidence 0.63 < 0.75 threshold. No AP record created yet — a human confirms every field first.', 'hold'),
    ],
    outcome: { kind: 'warn', title: 'Held for Human Review', note: 'Nothing was booked. The document waits in the review queue until a person confirms vendor, dates, amounts and location.', action: 'Review extraction now' } },
  { id: 'e3', sender: 'ap-noreply@sysco.com', time: 'Aug 15', subject: 'Sysco invoice INV-88412 (resend)', attachment: 'sysco-inv-88412.pdf', ext: 'PDF', size: '210 KB', msgId: '<resend.88412@sysco.com>', status: 'Duplicate — held', overall: 0.96,
    steps: [
      step('Email received', 'Aug 15 · 7:39 AM', 'From ap-noreply@sysco.com. Authentication pass. Raw .eml archived.', 'done'),
      step('Attachment detected', 'Aug 15 · 7:39 AM', '1 attachment: sysco-inv-88412.pdf (210 KB).', 'done'),
      step('Document validated', 'Aug 15 · 7:39 AM', 'Valid PDF. Hash differs from any stored document (re-issued PDF).', 'done'),
      step('OCR / AI extraction', 'Aug 15 · 7:40 AM', 'All fields extracted cleanly.', 'done', 0.96),
      step('Vendor matched', 'Aug 15 · 7:40 AM', 'Matched to existing vendor "Sysco".', 'done', 0.99),
      step('Duplicate detected', 'Aug 15 · 7:40 AM', 'Sysco + INV-88412 + $2,340.00 matches an invoice entered Aug 9. Held — a duplicate can never silently become a second expense.', 'stop', 0.98),
      step('Awaiting human decision', '—', 'Confirm duplicate (discard) or mark genuinely new. AI will not decide.', 'hold'),
    ],
    outcome: { kind: 'stop', title: 'Frozen at duplicate gate', note: 'One transaction = one financial event. This document books nothing until a human resolves the duplicate.', action: 'Resolve duplicate' } },
  { id: 'e4', sender: 'j.reyes@velagroup.com (fwd)', time: 'Yesterday', subject: 'Fwd: Pat LaFrieda invoice from delivery', attachment: 'IMG_4482.heic', ext: 'IMG', size: '2.1 MB', msgId: '<fwd.4482@velagroup.com>', status: 'Pending Approval', overall: 0.92,
    steps: [
      step('Email received', 'Aug 16 · 9:00 AM', 'Forwarded by GM Soho — original sender preserved from forward headers.', 'done'),
      step('Attachment detected', 'Aug 16 · 9:00 AM', 'IMG_4482.heic (photo). Converted to processing format; original kept.', 'done'),
      step('Document validated', 'Aug 16 · 9:01 AM', 'Photo deskewed, glare-corrected. Legibility sufficient.', 'done'),
      step('OCR / AI extraction', 'Aug 16 · 9:01 AM', 'Extracted against learned Pat LaFrieda template (22 prior invoices).', 'done', 0.94),
      step('Vendor matched', 'Aug 16 · 9:01 AM', 'Pat LaFrieda Meats.', 'done', 0.98),
      step('Duplicate check', 'Aug 16 · 9:02 AM', 'PLF-30991 unique. Clear.', 'done', 0.97),
      step('Expense classified', 'Aug 16 · 9:02 AM', 'COGS · Food · Meat, Vela Soho.', 'done', 0.92),
      step('AP record created', 'Aug 16 · 9:02 AM', 'Created as Received → approval chain.', 'done'),
    ],
    outcome: { kind: 'ok', title: 'Created → Pending Approval', note: 'Photo-quality forward handled end-to-end; provenance chain includes the forwarding GM and the original delivery photo.', action: 'Open invoice in AP' } },
  { id: 'e5', sender: 'newsletter@restaurantsupply.io', time: 'Yesterday', subject: 'August specials — save 20% on smallwares!', attachment: 'promo-flyer.pdf', ext: 'PDF', size: '4.4 MB', msgId: '<promo.20260816@rsupply.io>', status: 'Rejected — not an invoice', overall: 0.11,
    steps: [
      step('Email received', 'Aug 16 · 2:10 PM', 'From newsletter@restaurantsupply.io. Bulk-mail headers present.', 'done'),
      step('Attachment detected', 'Aug 16 · 2:10 PM', 'promo-flyer.pdf (4.4 MB).', 'done'),
      step('Document validated', 'Aug 16 · 2:11 PM', 'Valid PDF but classified as marketing material — no invoice number, no amounts due, promotional layout.', 'stop', 0.11),
      step('Stopped — not an invoice', 'Aug 16 · 2:11 PM', 'No AP record created. Email retained 90 days for audit, then purged. Sender can be blocked.', 'hold'),
    ],
    outcome: { kind: 'stop', title: 'Not an invoice — nothing booked', note: 'Document classifier stopped the pipeline before extraction. Kept for audit; no financial record exists.', action: null } },
  { id: 'e6', sender: 'billing@imperiallinen.com', time: '9:41 AM', subject: 'Invoice IL-8851 — weekly linen service', attachment: 'il-8851.pdf', ext: 'PDF', size: null, msgId: '<il.8851@imperiallinen.com>', status: 'Processing', overall: 0.0, processing: true,
    steps: [
      step('Email received', '9:41:02 AM', 'From billing@imperiallinen.com. Authentication pass.', 'done'),
      step('Attachment detected', '9:41:03 AM', 'il-8851.pdf (74 KB).', 'done'),
      step('Document validated', '9:41:04 AM', 'Valid PDF, text layer present.', 'done'),
      step('OCR / AI extraction', 'now', 'Extraction in progress…', 'active'),
      step('Vendor matching', '—', 'Waiting', 'todo'),
      step('Duplicate check', '—', 'Waiting', 'todo'),
      step('Expense classification', '—', 'Waiting', 'todo'),
      step('AP record', '—', 'Waiting', 'todo'),
    ],
    outcome: { kind: 'run', title: 'Processing…', note: 'Pipeline is running. Typical email-to-AP time is under 60 seconds.', action: null } },
];

export const emailBadges: Record<string, [string, string]> = {
  'Pending Approval': ['#b07c1e', '#fdf6ec'],
  'Review Required': ['#b07c1e', '#fdf6ec'],
  'Duplicate — held': ['#b3402e', '#faeeeb'],
  'Rejected — not an invoice': ['#5c6b64', '#f0efe9'],
  Processing: ['#4a6b8a', '#edf2f7'],
};

export const outcomeStyles: Record<OutcomeKind, [string, string, string, string]> = {
  ok: ['#eaf3ee', '#bcd8ca', '#14584a', '✓'],
  warn: ['#fdf6ec', '#ecd9b7', '#b07c1e', '!'],
  stop: ['#faeeeb', '#dfa89a', '#b3402e', '✕'],
  run: ['#edf2f7', '#c8d6e2', '#4a6b8a', '…'],
};

export const confColor = (c: number): string => (c >= 0.9 ? '#14584a' : c >= 0.75 ? '#b07c1e' : '#b3402e');
