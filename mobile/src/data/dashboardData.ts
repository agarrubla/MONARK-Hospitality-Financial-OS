/**
 * MOCK DATA — development fixtures only, ported verbatim from
 * "Monark Dashboard.dc.html". The shapes model the intended API/domain.
 * Remove the MOCK DATA badges (and this module) in production.
 */
export type LocKey = 'soho' | 'mid' | 'bkn';
export type LocFilter = 'all' | LocKey;
export type MonthKey = 'aug' | 'jul';

export interface MonthFigures {
  days: number;
  todaySales?: number;
  todayTxn?: number;
  dToday?: number;
  revF: number;
  revB: number;
  cogsF: number;
  cogsB: number;
  labor: number;
  opex: number;
  cash: number;
  ap: number;
  due7: number;
  proj: number;
  score: number;
}

export interface LocationData {
  name: string;
  code: string;
  aug: MonthFigures;
  jul: MonthFigures;
}

export const dashboardData: Record<LocKey, LocationData> = {
  soho: {
    name: 'Vela Soho', code: 'SOHO',
    aug: { days: 17, todaySales: 8420, todayTxn: 214, dToday: 6.2, revF: 96330, revB: 51870, cogsF: 27930, cogsB: 10890, labor: 47420, opex: 28160, cash: 84300, ap: 41250, due7: 18400, proj: 96900, score: 82 },
    jul: { days: 31, revF: 171400, revB: 92600, cogsF: 48000, cogsB: 19400, labor: 82100, opex: 50900, cash: 84300, ap: 41250, due7: 18400, proj: 96900, score: 80 },
  },
  mid: {
    name: 'Vela Trattoria Midtown', code: 'MID',
    aug: { days: 17, todaySales: 6180, todayTxn: 172, dToday: -3.1, revF: 82510, revB: 29690, cogsF: 26400, cogsB: 6530, labor: 38150, opex: 24780, cash: 52100, ap: 36900, due7: 21750, proj: 47300, score: 68 },
    jul: { days: 31, revF: 148800, revB: 54100, cogsF: 45900, cogsB: 11900, labor: 66300, opex: 44600, cash: 52100, ap: 36900, due7: 21750, proj: 47300, score: 71 },
  },
  bkn: {
    name: 'Bar Vela Brooklyn', code: 'BKN',
    aug: { days: 17, todaySales: 4930, todayTxn: 148, dToday: 11.4, revF: 24110, revB: 62290, cogsF: 7470, cogsB: 13700, labor: 24190, opex: 17280, cash: 31750, ap: 19600, due7: 7900, proj: 38200, score: 76 },
    jul: { days: 31, revF: 42300, revB: 111900, cogsF: 13300, cogsB: 24400, labor: 44700, opex: 30800, cash: 31750, ap: 19600, due7: 7900, proj: 38200, score: 74 },
  },
};

export type Severity = 'info' | 'warning' | 'critical';

export interface Insight {
  loc: LocFilter;
  sev: Severity;
  conf: string;
  title: string;
  body: string;
  meta: string;
}

export const insightData: Insight[] = [
  { loc: 'mid', sev: 'critical', conf: '0.93', title: 'Labor running 4.0 pts over target', body: 'Midtown labor is 34.0% of net sales MTD vs a 30% target — weekend overtime is driving a $4.1K variance.', meta: 'Midtown · Labor · MTD' },
  { loc: 'bkn', sev: 'warning', conf: '0.91', title: 'Card deposit variance: $482', body: 'Aug 14 batch expected $6,214, bank received $5,732. Likely a held chargeback — needs review.', meta: 'Brooklyn · Deposits · Aug 14' },
  { loc: 'soho', sev: 'warning', conf: '0.87', title: 'Produce prices up 12% vs July', body: 'Hudson Valley Produce raised unit prices on 14 items; food cost impact ≈ 0.4 pts if volumes hold.', meta: 'Soho · COGS · Vendor pricing' },
  { loc: 'all', sev: 'info', conf: '0.98', title: 'Possible duplicate invoice held', body: 'Sysco #INV-88412 ($2,340) matches an invoice entered Aug 9 by amount and number. Held from AP pending review.', meta: 'All locations · AP · Aug 15' },
];

export const locationNames: Record<LocFilter, string> = {
  all: 'All locations',
  soho: 'Vela Soho',
  mid: 'Vela Trattoria Midtown',
  bkn: 'Bar Vela Brooklyn',
};

export interface Aggregates {
  todaySales: number; todayTxn: number; revF: number; revB: number;
  cogsF: number; cogsB: number; labor: number; opex: number;
  cash: number; ap: number; due7: number; proj: number;
  score: number; dToday: number; rev: number; days: number;
  keys: LocKey[];
}

export const fmt = (n: number): string => '$' + Math.round(n).toLocaleString('en-US');
export const pctf = (n: number): string => n.toFixed(1) + '%';

export function agg(loc: LocFilter, month: MonthKey): Aggregates {
  const d = dashboardData;
  const keys: LocKey[] = loc === 'all' ? ['soho', 'mid', 'bkn'] : [loc];
  const sum = (k: keyof MonthFigures) => keys.reduce((a, id) => a + ((d[id][month][k] as number) || 0), 0);
  const out = {
    todaySales: sum('todaySales'), todayTxn: sum('todayTxn'),
    revF: sum('revF'), revB: sum('revB'), cogsF: sum('cogsF'), cogsB: sum('cogsB'),
    labor: sum('labor'), opex: sum('opex'), cash: sum('cash'), ap: sum('ap'),
    due7: sum('due7'), proj: sum('proj'),
  };
  const rev = out.revF + out.revB;
  const scoreW = keys.reduce((a, id) => a + d[id][month].score * (d[id][month].revF + d[id][month].revB), 0);
  return {
    ...out,
    rev,
    keys,
    days: d[keys[0]][month].days,
    score: Math.round(scoreW / (rev || 1)),
    dToday: loc === 'all' ? 4.6 : (d[loc][month].dToday ?? 0),
  };
}

export interface SheetRow { label: string; sub: string; val: string }
export interface Sheet { title: string; sub: string; rows: SheetRow[] }

function perLocRows(field: keyof MonthFigures | undefined, m: MonthKey, money: boolean): SheetRow[] {
  const d = dashboardData;
  return (['soho', 'mid', 'bkn'] as LocKey[]).map((id) => {
    const x = d[id][m];
    const v = field !== undefined && x[field] !== undefined ? (x[field] as number) : x.revF + x.revB;
    return { label: d[id].name, sub: d[id].code, val: money ? fmt(v) : v.toLocaleString('en-US') };
  });
}

function splitRows(total: number, splits: Array<[string, number, string?]>): SheetRow[] {
  return splits.map(([label, p, sub]) => ({ label, sub: sub || Math.round(p * 100) + '%', val: fmt(total * p) }));
}

export function buildSheet(key: string, a: Aggregates, m: MonthKey, loc: LocFilter): Sheet {
  const d = dashboardData;
  const all = loc === 'all';
  const scope = all ? 'All locations' : d[loc as LocKey].name;
  const per = (f: keyof MonthFigures | undefined, money: boolean) => perLocRows(f, m, money);
  const S = (title: string, sub: string, rows: SheetRow[]): Sheet => ({ title, sub: sub + ' · ' + scope, rows });
  const locs: LocKey[] = ['soho', 'mid', 'bkn'];
  switch (key) {
    case 'score': return S('Monark Score', 'Composite of margin, cash runway, cost control, AP health', [
      { label: 'Operating margin', sub: '30% weight', val: String(Math.min(100, Math.round((a.rev - a.cogsF - a.cogsB - a.labor - a.opex) / a.rev * 500))) },
      { label: 'Cash runway', sub: '25% weight', val: String(Math.round(Math.min(100, a.cash / (a.due7 * 4) * 60 + 30))) },
      { label: 'Prime cost control', sub: '25% weight', val: String(Math.max(20, 100 - Math.round(((a.cogsF + a.cogsB + a.labor) / a.rev * 100 - 55) * 6))) },
      { label: 'AP health', sub: '20% weight', val: String(Math.round(Math.max(20, 100 - a.due7 / a.ap * 80))) },
      ...(all ? per('score', false).map((r) => ({ ...r, sub: r.sub + ' score' })) : []),
    ]);
    case 'sales_today': return S("Today's sales", 'Live POS feed, business date Aug 17',
      all ? per('todaySales', true) : splitRows(a.todaySales, [['Dine-in', 0.64], ['Bar', 0.22], ['Takeout & delivery', 0.14]]));
    case 'txn_today': return S("Today's transactions", 'Closed checks by daypart', all ? per('todayTxn', false) : [
      { label: 'Brunch', sub: '11a–3p', val: Math.round(a.todayTxn * 0.46).toLocaleString() },
      { label: 'Happy hour', sub: '3p–6p', val: Math.round(a.todayTxn * 0.17).toLocaleString() },
      { label: 'Dinner', sub: '6p–close', val: Math.round(a.todayTxn * 0.37).toLocaleString() }]);
    case 'avg_today': return S('Average check', 'Net sales ÷ closed checks', locs.map((id) => {
      const x = d[id][m];
      return { label: d[id].name, sub: (x.todayTxn ?? 0) + ' checks', val: '$' + ((x.todaySales ?? 0) / (x.todayTxn ?? 1)).toFixed(2) };
    }));
    case 'revenue': return S('Revenue', 'Accrual basis, net of discounts & comps', all ? per(undefined, true) : [
      { label: 'Food', sub: pctf(a.revF / a.rev * 100), val: fmt(a.revF) },
      { label: 'Beverage', sub: pctf(a.revB / a.rev * 100), val: fmt(a.revB) }]);
    case 'cogs': {
      const t = a.cogsF + a.cogsB;
      return S('COGS', 'Invoiced cost of goods, expense-dated', all
        ? locs.map((id) => { const x = d[id][m]; return { label: d[id].name, sub: d[id].code, val: fmt(x.cogsF + x.cogsB) }; })
        : [
          { label: 'Food', sub: pctf(a.cogsF / t * 100), val: fmt(a.cogsF) },
          { label: 'Beverage', sub: pctf(a.cogsB / t * 100), val: fmt(a.cogsB) }]);
    }
    case 'labor': return S('Labor', 'Wages, salaries & payroll taxes',
      all ? per('labor', true) : splitRows(a.labor, [['BOH hourly', 0.44], ['FOH hourly', 0.38], ['Management', 0.12], ['Payroll taxes', 0.06]]));
    case 'opex': return S('Operating expenses', 'Occupancy, utilities, supplies, fees',
      all ? per('opex', true) : splitRows(a.opex, [['Rent & occupancy', 0.48], ['Utilities', 0.14], ['Supplies & smallwares', 0.13], ['Card processing fees', 0.15], ['Other', 0.10]]));
    case 'profit': return S('Operating profit', 'Revenue − COGS − labor − OpEx', locs.map((id) => {
      const x = d[id][m]; const r = x.revF + x.revB; const p = r - x.cogsF - x.cogsB - x.labor - x.opex;
      return { label: d[id].name, sub: pctf(p / r * 100) + ' margin', val: fmt(p) };
    }));
    case 'cash': return S('Available cash', 'Sum of connected operating accounts', all ? per('cash', true) : [
      { label: 'Operating · Chase …4821', sub: 'checking', val: fmt(a.cash * 0.72) },
      { label: 'Payroll · Chase …9310', sub: 'checking', val: fmt(a.cash * 0.21) },
      { label: 'Reserve · Mercury …1177', sub: 'savings', val: fmt(a.cash * 0.07) }]);
    case 'ap': return S('Accounts payable', 'Open approved invoices, accrual-dated',
      all ? per('ap', true) : splitRows(a.ap, [['Sysco', 0.31, '12 invoices'], ['Hudson Valley Produce', 0.18, '9 invoices'], ['Southern Glazer’s', 0.16, '6 invoices'], ['Baldor', 0.13, '7 invoices'], ['All other vendors', 0.22, '19 invoices']]));
    case 'due': return S('Payments due · next 7 days', 'By due date, approved & scheduled',
      all ? per('due7', true) : splitRows(a.due7, [['Tue Aug 19', 0.34, '4 payments'], ['Thu Aug 21', 0.27, '3 payments'], ['Fri Aug 22', 0.24, '5 payments'], ['Sun Aug 24', 0.15, '2 payments']]));
    case 'proj': return S('Projected cash · 30 days', 'Forecast v2.3 · confidence 0.84', [
      { label: 'Opening balance', sub: 'today', val: fmt(a.cash) },
      { label: 'Projected inflows', sub: 'POS deposits', val: '+' + fmt(a.rev / a.days * 30 * 0.93) },
      { label: 'Projected outflows', sub: 'AP, payroll, rent', val: '−' + fmt(a.cash + a.rev / a.days * 30 * 0.93 - a.proj) },
      { label: 'Projected closing', sub: 'Sep 16', val: fmt(a.proj) }]);
    case 'food': return S('Food cost %', 'Food COGS ÷ food revenue', locs.map((id) => {
      const x = d[id][m];
      return { label: d[id].name, sub: fmt(x.cogsF) + ' / ' + fmt(x.revF), val: pctf(x.cogsF / x.revF * 100) };
    }));
    case 'bev': return S('Beverage cost %', 'Beverage COGS ÷ beverage revenue', locs.map((id) => {
      const x = d[id][m];
      return { label: d[id].name, sub: fmt(x.cogsB) + ' / ' + fmt(x.revB), val: pctf(x.cogsB / x.revB * 100) };
    }));
    case 'laborpct': return S('Labor %', 'Total labor ÷ net revenue', locs.map((id) => {
      const x = d[id][m]; const r = x.revF + x.revB;
      return { label: d[id].name, sub: fmt(x.labor), val: pctf(x.labor / r * 100) };
    }));
    case 'prime': return S('Prime cost %', '(COGS + labor) ÷ net revenue · target ≤ 60%', locs.map((id) => {
      const x = d[id][m]; const r = x.revF + x.revB;
      return { label: d[id].name, sub: d[id].code, val: pctf((x.cogsF + x.cogsB + x.labor) / r * 100) };
    }));
    default: return S('Detail', '', []);
  }
}
