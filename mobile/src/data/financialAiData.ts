/**
 * MOCK DATA — development fixtures only, ported verbatim from
 * "Monark Financial AI.dc.html". Canned answers grounded in the same fixture
 * numbers used across modules. Every answer shows period, sources and
 * confidence; out-of-scope questions are refused, never estimated.
 */
export interface AnswerRow {
  label: string;
  sub: string;
  val: string;
  strong?: boolean;
  top?: boolean;
  color?: string;
}

export interface AIAnswer {
  match: string[];
  think: string;
  text: string;
  period: string;
  sources: string;
  conf: number;
  rows?: AnswerRow[];
  warn?: string;
  links?: string[];
}

const row = (label: string, sub: string, val: string, opts: Partial<AnswerRow> = {}): AnswerRow =>
  ({ label, sub, val, ...opts });

export const aiAnswers: AIAnswer[] = [
  { match: ['how are we doing', 'how are we'], think: 'Reading MTD P&L, cash, score…',
    text: 'Solid overall. August MTD (through the 17th): revenue $346,800, operating profit $61,900 at a 17.8% margin — up 1.2 pts vs July’s pace. Cash is healthy at $168,150 across 3 locations. Two watch items: Midtown labor is 4 pts over target, and Brooklyn has a missing $1,840 cash deposit.',
    period: 'AUG 1–17 MTD', sources: 'pos_sales · invoices · bank', conf: 0.95,
    rows: [row('Revenue', '3 locations', '$346,800'), row('Operating profit', '17.8% margin', '$61,900', { color: '#14584a' }), row('Available cash', '5 accounts', '$168,150'), row('Monark score', 'weighted', '76', { strong: true })],
    links: ['Open dashboard', 'MTD P&L'] },
  { match: ['why is profit down', 'profit down'], think: 'Comparing AUG vs JUL margins…',
    text: 'August margin is actually up overall — but Midtown’s profit is down $3,900 vs its July pace. Two drivers: labor there is running 34.0% of sales vs 30% target (weekend overtime, ≈$4.1K), and produce costs rose — Hudson Valley raised unit prices 12% on 14 items (+$1,840 group-wide).',
    period: 'AUG MTD vs JUL', sources: 'invoices · payroll · pos_sales', conf: 0.91,
    rows: [row('Midtown labor variance', 'vs 30% target', '−$4,100', { color: '#b3402e' }), row('Produce price increases', 'HVP, 14 items', '−$1,840', { color: '#b3402e' }), row('Other categories', 'net', '+$2,040', { color: '#14584a' })],
    links: ['Labor drill-down', 'Vendor price report'] },
  { match: ['cash lower than profit', 'why is cash lower'], think: 'Building accrual → cash bridge…',
    text: 'Because profit is accrual and cash is timing. You earned $61,900 of operating profit MTD, but cash grew only $38,400: $16,700 of card settlements are still in transit (T+1/T+2 lag), you paid $9,800 of July-dated invoices this month, and the payroll run on Aug 15 covered July-end shifts. One invoice = one expense + one cash event — on different dates.',
    period: 'AUG 1–17 MTD', sources: 'payments · pos_deposits · payroll', conf: 0.93,
    rows: [row('Operating profit (accrual)', '', '$61,900', { strong: true }), row('Deposits in transit', 'T+1/T+2 lag', '−$16,700'), row('July invoices paid in Aug', 'cash, not expense', '−$9,800'), row('Payroll & tax timing', '', '+$3,000'), row('Net cash change', '', '$38,400', { top: true, strong: true, color: '#14584a' })],
    links: ['Accrual vs Cash report'] },
  { match: ['biggest expenses'], think: 'Ranking MTD expense categories…',
    text: 'Your five biggest August MTD expense categories, accrual basis. Labor and food COGS together are 41% of revenue.',
    period: 'AUG 1–17 MTD', sources: 'invoice_line_items · payroll', conf: 0.97,
    rows: [row('Labor', '31.6% of rev', '$109,760'), row('COGS · Food', '19.8%', '$68,800'), row('Rent & occupancy', '9.7%', '$33,700'), row('COGS · Beverage', '6.9%', '$24,100'), row('Card processing fees', '3.0%', '$10,500')],
    links: ['Expense analysis'] },
  { match: ['vendor increased prices', 'which vendor'], think: 'Scanning vendor unit prices…',
    text: 'Hudson Valley Produce raised unit prices ~12% on 14 items effective Aug 4 (organic produce + dairy). ConEdison summer peak rates are also up ~8% vs June. No other vendor shows a significant unit-price move this period.',
    period: 'AUG vs JUL', sources: 'invoice_line_items', conf: 0.87,
    rows: [row('Hudson Valley Produce', '14 items, +12%', '+$1,840', { color: '#b3402e' }), row('ConEdison', 'peak rates, +8%', '+$410', { color: '#b3402e' }), row('Sysco', 'price flat', '$0')],
    warn: 'Unit-price tracking needs line-item detail: 3 of 51 August invoices are photo captures without parsed line items, so small moves could be missed.',
    links: ['HVP invoices', 'Price report'] },
  { match: ['bills are due', 'due this week'], think: 'Checking AP due dates Aug 17–24…',
    text: 'Four bills totaling $9,148 are due this week (Aug 17–24). Pat LaFrieda is on Net 7 terms and due first. All are approved or awaiting one step.',
    period: 'AUG 17–24', sources: 'invoices · approvals', conf: 0.99,
    rows: [row('Pat LaFrieda Meats', 'due Aug 23', '$1,900'), row("Southern Glazer's", 'due Sep 13 · sched.', '$3,700'), row('Imperial Linen', 'due Aug 28', '$460'), row('ConEdison', 'due Aug 30 · sched. Aug 28', '$2,288'), row('Hudson Valley', 'due Aug 27 · sched. Sep 3', '$5,000')],
    links: ['Treasury · Ready', 'Payment calendar'] },
  { match: ['cash will i have', '30 days'], think: 'Running 30-day cash forecast…',
    text: 'Projected $182,400 on Sep 16 (forecast v2.3, confidence 0.84). That’s +$14,250 vs today: strong weekend deposits offset September rent ($14.5K) and two payroll runs. Low point is Sep 1–2 (~$121K) right after rent — still 3.4× your weekly outflow.',
    period: 'NEXT 30 DAYS', sources: 'cash_forecasts · open AP · payroll calendar', conf: 0.84,
    rows: [row('Today', '5 accounts', '$168,150', { strong: true }), row('Projected inflows', 'POS deposits', '+$412,300', { color: '#14584a' }), row('Projected outflows', 'AP · payroll · rent · tax', '−$398,050', { color: '#b3402e' }), row('Sep 16 projection', 'conf 0.84', '$182,400', { top: true, strong: true, color: '#14584a' })],
    warn: 'Forecast assumes the missing Brooklyn cash deposit ($1,840) resolves; it’s currently unreconciled.',
    links: ['Cash forecast detail'] },
  { match: ['food cost'], think: 'Computing food COGS ÷ food revenue…',
    text: 'Food cost is 33.9% MTD — food COGS $68,800 against food revenue $202,950. That’s 3.9 pts over your 30% target, driven mostly by the HVP price increase and Midtown’s mix.',
    period: 'AUG 1–17 MTD', sources: 'invoice_line_items · pos_sales', conf: 0.94,
    rows: [row('Vela Soho', '$27,930 / $96,330', '29.0%', { color: '#14584a' }), row('Midtown', '$26,400 / $82,510', '32.0%', { color: '#b3402e' }), row('Brooklyn', '$7,470 / $24,110', '31.0%', { color: '#b3402e' }), row('Group', 'target 30%', '33.9%', { top: true, strong: true, color: '#b3402e' })],
    links: ['Food COGS invoices'] },
  { match: ['prime cost'], think: 'COGS + labor over revenue…',
    text: 'Prime cost is 58.4% MTD (COGS $92,920 + labor $109,760 over $346,800 revenue) — under your 60% ceiling, but Midtown alone is at 63.2% because of the labor overrun.',
    period: 'AUG 1–17 MTD', sources: 'invoices · payroll · pos_sales', conf: 0.94,
    rows: [row('Vela Soho', '', '55.9%', { color: '#14584a' }), row('Midtown', 'labor-driven', '63.2%', { color: '#b3402e' }), row('Brooklyn', '', '52.5%', { color: '#14584a' }), row('Group', 'ceiling 60%', '58.4%', { top: true, strong: true, color: '#14584a' })],
    links: ['Prime cost drill-down'] },
  { match: ['compare this month', 'last month'], think: 'Normalizing AUG MTD vs JUL same-day…',
    text: 'Comparing Aug 1–17 with Jul 1–17 (same-day basis): revenue up 5.2%, margin up 1.2 pts, cash position up $12,900. Labor is the one regression — up 0.9 pts as a share of revenue.',
    period: 'AUG 1–17 vs JUL 1–17', sources: 'pos_sales · invoices · payroll', conf: 0.92,
    rows: [row('Revenue', 'vs $329,700', '+5.2%', { color: '#14584a' }), row('Operating margin', '16.6% → 17.8%', '+1.2 pts', { color: '#14584a' }), row('Food cost %', '32.8% → 33.9%', '+1.1 pts', { color: '#b3402e' }), row('Labor %', '30.7% → 31.6%', '+0.9 pts', { color: '#b3402e' })],
    links: ['Month comparison'] },
  { match: ['biggest financial problems', 'three biggest'], think: 'Ranking open issues by impact…',
    text: 'Ranked by monthly profit impact: (1) Midtown labor — 4 pts over target, ≈$4.1K/mo, fix is weekend scheduling; (2) food cost at 33.9% vs 30% — ≈$3.4K/mo, driven by HVP pricing (renegotiate or re-source 14 items); (3) unreconciled cash — $2,322 stuck ($1,840 missing BKN deposit + $482 Soho batch variance).',
    period: 'AUG MTD', sources: 'ai_insights · all modules', conf: 0.89,
    rows: [row('1 · Midtown labor overrun', '≈ monthly impact', '−$4,100', { color: '#b3402e' }), row('2 · Food cost vs target', 'HVP pricing', '−$3,400', { color: '#b3402e' }), row('3 · Unreconciled cash', 'deposit + variance', '−$2,322', { color: '#b07c1e' })],
    links: ['Labor detail', 'Vendor prices', 'Reconciliation'] },
];

export const aiFallback: Omit<AIAnswer, 'match' | 'think'> = {
  text: 'I can’t answer that from your Monark data. I only work from your authorized sources — POS sales, invoices, payments, bank transactions and forecasts — and I won’t estimate numbers I don’t have. Try one of the suggested questions, or ask about a specific vendor, category, location or period.',
  period: 'N/A', sources: 'no matching source', conf: 0,
  warn: 'If this is data Monark should have (e.g. a missing integration), connect it under Settings → Integrations.',
};

export const suggestedQuestions = [
  'How are we doing?',
  'Why is profit down?',
  'Why is cash lower than profit?',
  'What are my biggest expenses?',
  'Which vendor increased prices?',
  'What bills are due this week?',
  'How much cash will I have in 30 days?',
  'What is my food cost?',
  'What is my prime cost?',
  'Compare this month with last month',
  'What are my three biggest financial problems?',
];

export const confColor = (c: number): string => (c >= 0.9 ? '#14584a' : c >= 0.75 ? '#b07c1e' : '#b3402e');
