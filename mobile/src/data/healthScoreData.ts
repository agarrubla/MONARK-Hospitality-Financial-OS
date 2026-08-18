/**
 * MOCK DATA — development fixtures only, ported verbatim from
 * "Monark Health Score.dc.html". Deterministic, explainable 0–100 from 11
 * weighted components — every component traces to its transactions.
 */
export type LocFilter = 'all' | 'soho' | 'mid' | 'bkn';

export interface ComponentDef {
  key: string;
  name: string;
  w: number;
  form: string;
  rows: Array<[string, string, string]>;
}

export const componentDefs: ComponentDef[] = [
  { key: 'rev', name: 'Revenue vs plan', w: 12, form: 'MTD revenue ÷ budgeted revenue, capped at 100', rows: [['Revenue MTD', 'pos_sales · Aug 1–17', '$346,800'], ['Budget pro-rata', 'budgets · AUG', '$334,000'], ['Attainment', '', '103.8%']] },
  { key: 'profit', name: 'Profitability', w: 14, form: 'Operating margin ÷ 20% target × 100', rows: [['Operating profit', 'P&L MTD', '$61,900'], ['Margin', '', '17.8%'], ['Target', 'org setting', '20.0%']] },
  { key: 'food', name: 'Food cost', w: 10, form: '100 − (food cost % − 30% target) × 12', rows: [['Food COGS', 'invoice_line_items', '$68,800'], ['Food revenue', 'pos_sales', '$202,950'], ['Food cost %', 'vs 30% target', '33.9%']] },
  { key: 'bev', name: 'Beverage cost', w: 6, form: '100 − (bev cost % − 22% target) × 12', rows: [['Bev COGS', 'invoice_line_items', '$24,100'], ['Bev revenue', 'pos_sales', '$143,850'], ['Bev cost %', 'vs 22% target', '16.8%']] },
  { key: 'labor', name: 'Labor', w: 12, form: '100 − (labor % − 31% target) × 10', rows: [['Labor MTD', 'payroll accrual', '$109,760'], ['Labor %', 'vs 31% target', '31.6%'], ['Midtown', 'main variance', '34.0%']] },
  { key: 'prime', name: 'Prime cost', w: 10, form: '100 − (prime % − 60% ceiling) × 8, capped', rows: [['COGS + labor', '', '$202,680'], ['Prime %', 'vs 60% ceiling', '58.4%']] },
  { key: 'cash', name: 'Cash flow', w: 12, form: 'Runway vs 2.5× payroll floor + forecast slope', rows: [['Available cash', '5 accounts', '$168,150'], ['Sep 2 projected low', 'forecast v2.3', '$121,000'], ['Floor multiple', 'vs 2.5× target', '1.8×']] },
  { key: 'ap', name: 'AP health', w: 8, form: '100 − overdue share × 200 − held share × 100', rows: [['Open AP', '53 invoices', '$97,750'], ['Overdue', '30+ days', '5.8%'], ['Held/disputed', '2 invoices', '$2,800']] },
  { key: 'budget', name: 'Budget performance', w: 6, form: 'Categories within ±5% of budget ÷ total', rows: [['Categories on budget', 'budgets vs actuals', '9 of 12'], ['Largest overage', 'MID OpEx', '+9%']] },
  { key: 'sales', name: 'Sales trend', w: 5, form: '4-week revenue slope, normalized', rows: [['4-week slope', 'pos_sales weekly', '+3.1%'], ['MID lunch', 'declining 3 wks', '−11%']] },
  { key: 'vendor', name: 'Vendor cost trend', w: 5, form: '100 − weighted unit-price inflation × 8', rows: [['Unit-price inflation', 'invoice_line_items', '+2.4%'], ['HVP', '14 items', '+12%'], ['Sysco', '', 'flat']] },
];

export const locationScores: Record<LocFilter, { prev: number; vals: Record<string, number> }> = {
  all: { prev: 74, vals: { rev: 88, profit: 89, food: 53, bev: 96, labor: 74, prime: 87, cash: 62, ap: 88, budget: 75, sales: 78, vendor: 81 } },
  soho: { prev: 80, vals: { rev: 94, profit: 93, food: 82, bev: 94, labor: 84, prime: 90, cash: 71, ap: 90, budget: 83, sales: 85, vendor: 74 } },
  mid: { prev: 71, vals: { rev: 79, profit: 76, food: 46, bev: 92, labor: 48, prime: 62, cash: 58, ap: 82, budget: 58, sales: 61, vendor: 83 } },
  bkn: { prev: 74, vals: { rev: 91, profit: 84, food: 68, bev: 88, labor: 82, prime: 93, cash: 55, ap: 86, budget: 79, sales: 88, vendor: 86 } },
};

/** Week-over-week component trends (group scope, per prototype). */
export const componentTrends: Record<string, number> = {
  food: -6, labor: -3, cash: -4, rev: 2, profit: 3, sales: -2, vendor: -3, bev: 1, prime: 1, ap: 0, budget: -2,
};

export const scoreDrivers = [
  { delta: '+3', text: 'Profitability up — margin 16.6% → 17.8% on stronger weekend revenue.', up: true },
  { delta: '−6', text: 'Food cost slipped to 33.9% (HVP pricing + Midtown waste) — the single biggest drag.', up: false },
  { delta: '−4', text: 'Cash-flow component fell: Sep 1–2 projected low of $121K breaks the 2.5× payroll floor.', up: false },
  { delta: '−3', text: 'Labor drifted up 0.9 pts, concentrated in Midtown weekend overtime.', up: false },
];

export const riskAreas = [
  { title: 'Midtown labor & prime cost', sev: 'HIGH', note: 'Labor 34% and prime 63.2% — both past thresholds; drags 4 components at once.', border: '#dfa89a', c: '#b3402e' },
  { title: 'September cash window', sev: 'HIGH', note: 'Rent + HVP + payroll cluster Sep 1–3; low point 1.8× payroll vs 2.5× floor.', border: '#dfa89a', c: '#b3402e' },
  { title: 'Vendor inflation', sev: 'MEDIUM', note: 'HVP +12% flows into food cost; contract review Sep 1 is the natural fix point.', border: '#ecd9b7', c: '#b07c1e' },
];

export const rankedActions = [
  { n: '1', title: 'Rebalance Midtown weekend scheduling', note: 'Fixes labor + prime + budget components. ≈$950/week.', pts: '+5 pts' },
  { n: '2', title: 'Move HVP payment Sep 3 → Sep 5', note: 'Clears the payroll-floor breach; within Net 15 terms. One tap in Treasury.', pts: '+3 pts' },
  { n: '3', title: 'Renegotiate or re-source 8 HVP SKUs', note: 'Recovers ~1.1 pts of food cost; quotes from Baldor ready.', pts: '+3 pts' },
];

export const scopeNames: Record<LocFilter, string> = {
  all: 'Vela Group · consolidated',
  soho: 'Vela Soho',
  mid: 'Vela Trattoria Midtown',
  bkn: 'Bar Vela Brooklyn',
};

export const scoreColor = (v: number): string => (v >= 78 ? '#5aa584' : v >= 60 ? '#c9a35d' : '#c96a52');
