/**
 * MOCK DATA — development fixtures only, ported verbatim from
 * "Monark Approval Workflow.dc.html".
 */
export type ChainState = 'approved' | 'pending' | 'rejected' | 'returned' | 'active';

export interface ChainStep { who: string; role: string; state: ChainState }

export interface WorkflowInvoice {
  id: string;
  vendor: string;
  meta: string;
  total: number;
  stage: number; // 1–9
  rule: string;
  chainLabel: string;
  createdBy?: string;
  chain: ChainStep[];
  canAct?: boolean;
  blocked?: boolean;
  blockReason?: string;
  rejected?: boolean;
  history: Array<[string, string, string, string]>;
}

export const stageNames = [
  'Received', 'Processing', 'AP Review', 'Pending Approval', 'Approved',
  'Treasury', 'Scheduled', 'Paid', 'Bank Reconciled',
] as const;

export const stageOwners = [
  'Intake channels', 'AI extraction', 'AP team', 'Approval chain (human)', 'Chain complete',
  'Treasury — funding & sequencing', 'Payment queued', 'Cash out · payment month set', 'Bank debit matched',
] as const;

export const workflowInvoices: WorkflowInvoice[] = [
  { id: 'v1', vendor: "Southern Glazer's", meta: 'SG-44120 · BKN · due Sep 13', total: 3700.00, stage: 4, rule: '$2,500–$10,000 → manager + controller', chainLabel: 'RULE 2 · 2 STEPS', createdBy: 'System (EDI)',
    chain: [{ who: 'J. Osei', role: 'GM Brooklyn · step 1', state: 'approved' }, { who: 'M. Okafor', role: 'Controller · step 2', state: 'pending' }],
    canAct: true,
    history: [['Step 1 approved', 'Quantities verified against delivery receipt', 'J. Osei (GM Brooklyn)', 'Aug 15 · 4:18 PM'], ['Routed: Pending Approval', 'Total $3,700 matched rule 2 ($2,500–$10,000): GM → Controller. Policy v7 frozen into chain.', 'System', 'Aug 14 · 3:22 PM'], ['AP Review passed', 'Line items verified against PO-2231', 'D. Kim (AP)', 'Aug 14 · 3:20 PM'], ['Processing complete', 'EDI extraction, conf 0.97', 'System', 'Aug 14 · 3:20 PM'], ['Received', 'Vendor EDI · expense booked to AUG 2026', 'System', 'Aug 14 · 3:19 PM']] },
  { id: 'v2', vendor: 'EcoLab', meta: 'EL-55118 · BKN · due Sep 3', total: 660.00, stage: 5, rule: 'Under $2,500 → one approval', chainLabel: 'RULE 1 · 1 STEP', createdBy: 'System (email)',
    chain: [{ who: 'J. Osei', role: 'GM Brooklyn · step 1', state: 'approved' }],
    history: [['Approved — chain complete', 'Single-step rule satisfied → stage Approved. Handed to Treasury queue.', 'J. Osei (GM Brooklyn)', 'Aug 6 · 1:15 PM'], ['Routed: Pending Approval', 'Total $660 matched rule 1 (under $2,500): one approver.', 'System', 'Aug 4 · 5:31 PM'], ['Received', 'Email capture · expense AUG 2026', 'System', 'Aug 4 · 5:29 PM']] },
  { id: 'v3', vendor: 'BuildRight Contracting', meta: 'BRC-2088 · SOHO · due Sep 30', total: 18400.00, stage: 4, rule: 'Over $10,000 → manager + owner', chainLabel: 'RULE 3 · 2 STEPS', createdBy: 'M. Okafor',
    chain: [{ who: 'J. Reyes', role: 'GM Soho · step 1', state: 'approved' }, { who: 'R. Vela', role: 'Owner · step 2', state: 'pending' }],
    blocked: true, blockReason: 'Policy requires the Owner for invoices over $10,000, and separation of duties bars you anyway: you created this invoice, so you cannot approve it. R. Vela has been notified.',
    history: [['Step 1 approved', 'Scope matches signed change order', 'J. Reyes (GM Soho)', 'Aug 16 · 10:05 AM'], ['Self-approval blocked', 'M. Okafor (creator) attempted step review — denied by separation-of-duties policy. Logged.', 'System (policy engine)', 'Aug 16 · 9:58 AM'], ['Routed: Pending Approval', 'Total $18,400 matched rule 3 (over $10,000): GM → Owner.', 'System', 'Aug 15 · 6:40 PM'], ['Received', 'Manual entry — patio renovation progress bill · expense AUG 2026', 'M. Okafor (Controller)', 'Aug 15 · 6:38 PM']] },
  { id: 'v4', vendor: 'Hudson Valley Produce', meta: 'HVP-90187 · SOHO · due Aug 27', total: 5000.00, stage: 7, rule: '$2,500–$10,000 → manager + controller', chainLabel: 'RULE 2 · 2 STEPS · COMPLETE', createdBy: 'System (email)',
    chain: [{ who: 'J. Reyes', role: 'GM Soho · step 1', state: 'approved' }, { who: 'M. Okafor', role: 'Controller · step 2', state: 'approved' }],
    history: [['Payment scheduled', 'Treasury sequenced ACH for Sep 3 from Chase …4821 · cash month SEP 2026', 'M. Okafor (Controller)', 'Aug 16 · 2:10 PM'], ['Entered Treasury queue', 'Funding check passed — projected balance covers due date', 'System', 'Aug 14 · 9:33 AM'], ['Step 2 approved — chain complete', 'Within policy', 'M. Okafor (Controller)', 'Aug 14 · 9:32 AM'], ['Step 1 approved', 'Quantities verified', 'J. Reyes (GM Soho)', 'Aug 13 · 4:18 PM'], ['Routed: Pending Approval', 'Rule 2 chain: GM → Controller', 'System', 'Aug 12 · 11:05 AM'], ['Received', 'Email capture · expense AUG 2026', 'System', 'Aug 12 · 11:03 AM']] },
  { id: 'v5', vendor: "Boar's Head Provisions", meta: 'BH-66104 · MID · paid Aug 12', total: 900.00, stage: 9, rule: 'Under $2,500 → one approval', chainLabel: 'RULE 1 · COMPLETE',
    chain: [{ who: 'A. Petrov', role: 'GM Midtown · step 1', state: 'approved' }],
    history: [['Bank reconciled', 'ACH debit −$900.00 on Chase …4821 matched to payment (conf 0.99). Lifecycle closed.', 'System (bank match)', 'Aug 13 · 6:15 AM'], ['Paid', 'ACH settled · cash month AUG 2026 · July expense unchanged', 'System', 'Aug 13 · 6:00 AM'], ['Payment scheduled', 'ACH initiated', 'M. Okafor (Controller)', 'Aug 12 · 10:30 AM'], ['Approved', 'Single-step rule', 'A. Petrov (GM Midtown)', 'Jul 30 · 2:12 PM'], ['Received', 'Email capture · expense JUL 2026', 'System', 'Jul 28 · 4:49 PM']] },
  { id: 'v6', vendor: 'Baldor Specialty Foods', meta: 'BSF-77301 · SOHO · due Aug 30', total: 1300.00, stage: 3, rule: 'Under $2,500 → one approval', chainLabel: 'NOT YET ROUTED',
    chain: [{ who: 'D. Kim', role: 'AP Review — correcting subtotal', state: 'active' }],
    history: [['Returned for correction', 'OCR subtotal mismatch ($27.00) — sent back to AP Review; approval chain not started', 'System (validator)', 'Aug 15 · 8:12 AM'], ['Received', 'Email capture · expense AUG 2026', 'System', 'Aug 15 · 8:11 AM']] },
];

export const hardRules = [
  'Every invoice passes a human approval chain — AI and integrations can never approve.',
  'Payments cannot be scheduled until the chain is complete.',
  'Approver must hold the required role AND location access at decision time.',
  'Chains keep the policy version they started with; edits never rewrite history.',
];

export type AlertKind = 'need' | 'ok' | 'rej' | 'ret' | 'sched' | 'paid';

export const alertKinds: Record<AlertKind, [string, string]> = {
  need: ['#b07c1e', '!'],
  ok: ['#14584a', '✓'],
  rej: ['#b3402e', '✕'],
  ret: ['#b07c1e', '↩'],
  sched: ['#4a6b8a', '◷'],
  paid: ['#5c6b64', '$'],
};

export const workflowAlerts: Array<[AlertKind, string, string, string, boolean]> = [
  ['need', 'Approval required — step 2 of 2', "Southern Glazer's SG-44120 · $3,700.00 · BKN. J. Osei approved step 1; you're next.", '9:41 AM', true],
  ['need', 'Approval required — owner step', 'BuildRight BRC-2088 · $18,400.00 · SOHO. Waiting on R. Vela (rule 3, over $10K).', '9:40 AM', true],
  ['ok', 'Approved — chain complete', 'EcoLab EL-55118 · $660.00 approved by J. Osei. Moved to Treasury.', 'Aug 6', false],
  ['ret', 'Returned for correction', 'Baldor BSF-77301 · $1,300.00 sent back to AP Review — subtotal mismatch.', 'Aug 15', false],
  ['sched', 'Payment scheduled', 'Hudson Valley HVP-90187 · $5,000.00 · ACH Sep 3 from Chase …4821. Cash month SEP.', 'Aug 16', false],
  ['paid', 'Payment completed & reconciled', "Boar's Head BH-66104 · $900.00 settled Aug 12, bank-matched Aug 13 (conf 0.99).", 'Aug 13', false],
  ['rej', 'Rejected', 'Sparkle Commercial SCC-2201 · $1,200.00 rejected by M. Okafor — unauthorized work.', 'Aug 12', false],
];
