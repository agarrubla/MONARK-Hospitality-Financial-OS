/**
 * MOCK DATA — development fixtures only, ported verbatim from
 * "Monark Reports.dc.html". Per-location MTD (Aug 1–17) figures; other
 * periods scale from these.
 */
export type LocKey = 'soho' | 'mid' | 'bkn';
export type LocFilter = 'all' | LocKey;
export type PeriodKey = 'day' | 'week' | 'mtd' | 'q' | 'yr' | 'custom';

export interface BaseFigures {
  rev: number; food: number; bev: number; cogs: number; labor: number; opex: number;
  begin: number; deposits: number; expDeposits: number; payments: number;
  payroll: number; taxes: number; otherOut: number;
}

export const reportBase: Record<LocKey, BaseFigures> = {
  soho: { rev: 148200, food: 96330, bev: 51870, cogs: 38820, labor: 47420, opex: 28160, begin: 61800, deposits: 128400, expDeposits: 11300, payments: 52100, payroll: 41200, taxes: 8400, otherOut: 4200 },
  mid: { rev: 112200, food: 82510, bev: 29690, cogs: 32930, labor: 38150, opex: 24780, begin: 44900, deposits: 96800, expDeposits: 9000, payments: 43800, payroll: 33900, taxes: 6900, otherOut: 4900 },
  bkn: { rev: 86400, food: 24110, bev: 62290, cogs: 21170, labor: 24190, opex: 17280, begin: 26100, deposits: 74100, expDeposits: 6300, payments: 31900, payroll: 21600, taxes: 5200, otherOut: 2050 },
};

export const reportPeriods: Record<PeriodKey, [string, number]> = {
  day: ['SAT AUG 16', 0.062],
  week: ['WEEK AUG 11–17', 0.42],
  mtd: ['AUG 1–17 · MTD', 1],
  q: ['Q3 · JUL–AUG', 2.9],
  yr: ['2026 YTD', 13.6],
  custom: ['CUSTOM · AUG 1–15', 0.88],
};

export interface ReportAgg extends BaseFigures {
  label: string;
  keys: LocKey[];
}

export function reportAgg(loc: LocFilter, period: PeriodKey): ReportAgg {
  const keys: LocKey[] = loc === 'all' ? ['soho', 'mid', 'bkn'] : [loc];
  const [label, k] = reportPeriods[period];
  const out = {} as BaseFigures;
  (Object.keys(reportBase.soho) as Array<keyof BaseFigures>).forEach((f) => {
    out[f] = Math.round(keys.reduce((a, id) => a + reportBase[id][f], 0) * k);
  });
  return { ...out, label, keys };
}

export const locationNames: Record<LocFilter, string> = {
  all: 'All locations · consolidated',
  soho: 'Vela Soho',
  mid: 'Vela Trattoria Midtown',
  bkn: 'Bar Vela Brooklyn',
};

export const fmt = (n: number): string =>
  (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');

export const pct = (n: number, d: number): string => (d ? ((n / d) * 100).toFixed(1) + '%' : '—');

export interface SheetRow { label: string; sub: string; trace: string; val: string }
export interface Sheet { title: string; sub: string; rows: SheetRow[] }

export function lineSheet(key: string, a: ReportAgg, loc: LocFilter, period: PeriodKey): Sheet {
  const all = loc === 'all';
  const [, k] = reportPeriods[period];
  const shortNames: Record<LocKey, string> = { soho: 'Vela Soho', mid: 'Vela Trattoria Midtown', bkn: 'Bar Vela Brooklyn' };
  const perLoc = (f: keyof BaseFigures): SheetRow[] =>
    (['soho', 'mid', 'bkn'] as LocKey[]).map((id) => ({
      label: shortNames[id], sub: '', trace: 'loc:' + id.toUpperCase(), val: fmt(reportBase[id][f] * k),
    }));
  const S = (title: string, sub: string, rows: SheetRow[]): Sheet => ({ title, sub, rows });
  switch (key) {
    case 'rev': return S('Revenue', 'From pos_sales · business-dated', all ? perLoc('rev') : [
      { label: 'Food sales', sub: pct(a.food, a.rev), trace: 'pos_sales.food · 17 days', val: fmt(a.food) },
      { label: 'Beverage sales', sub: pct(a.bev, a.rev), trace: 'pos_sales.beverage · 17 days', val: fmt(a.bev) }]);
    case 'cogs': return S('COGS', 'From invoice_line_items · expense-dated', all ? perLoc('cogs') : [
      { label: 'Sysco', sub: '12 invoices', trace: 'vendor:sysco · inv 88201…88412', val: fmt(a.cogs * 0.31) },
      { label: 'Hudson Valley Produce', sub: '9 invoices', trace: 'vendor:hvp · incl HVP-90187 $5,000', val: fmt(a.cogs * 0.22) },
      { label: "Southern Glazer's", sub: '6 invoices', trace: 'vendor:sg · inv SG-44001…44120', val: fmt(a.cogs * 0.18) },
      { label: 'All other vendors', sub: '23 invoices', trace: '14 vendors', val: fmt(a.cogs * 0.29) }]);
    case 'labor': return S('Labor', 'From payroll runs · accrued to worked dates', [
      { label: 'BOH hourly', sub: '', trace: 'payroll:gusto run 0808, 0815', val: fmt(a.labor * 0.44) },
      { label: 'FOH hourly', sub: '', trace: 'payroll:gusto run 0808, 0815', val: fmt(a.labor * 0.38) },
      { label: 'Management', sub: '', trace: 'salaried accrual', val: fmt(a.labor * 0.12) },
      { label: 'Payroll taxes', sub: '', trace: 'computed per run', val: fmt(a.labor * 0.06) }]);
    case 'opex': return S('Operating expenses', 'Invoices + card + direct expenses', all ? perLoc('opex') : [
      { label: 'Rent & occupancy', sub: '', trace: 'inv:SEP-RENT + CAM', val: fmt(a.opex * 0.48) },
      { label: 'Card processing fees', sub: '', trace: 'netted from deposits', val: fmt(a.opex * 0.15) },
      { label: 'Utilities', sub: '', trace: 'inv:CE-2026-0812 + bt-1038', val: fmt(a.opex * 0.14) },
      { label: 'Supplies & services', sub: '', trace: '11 invoices + 4 card txns', val: fmt(a.opex * 0.23) }]);
    case 'deposits': return S('Cash received', 'Bank deposits matched to POS', [
      { label: 'Card settlements', sub: '', trace: '41 matched pos_deposits', val: fmt(a.deposits * 0.87) },
      { label: 'Cash deposits', sub: '', trace: '12 matched · 1 missing (BKN)', val: fmt(a.deposits * 0.13) }]);
    case 'payments': return S('Vendor payments', 'From payments · payment-dated', [
      { label: "Boar's Head BH-66104", sub: 'Aug 12', trace: 'pay:ACH-0812-6610 · JUL expense', val: fmt(900) },
      { label: 'Sysco (3 payments)', sub: 'Aug 4–15', trace: 'pay:ACH-0804…0815', val: fmt(a.payments * 0.34) },
      { label: 'All other vendors', sub: '19 payments', trace: 'ACH 14 · check 5', val: fmt(a.payments * 0.66 - 900) }]);
    case 'payroll': return S('Payroll', 'Cash side of payroll runs', [
      { label: 'Run Aug 8 (Jul 28–Aug 3)', sub: '', trace: 'transfer bt-1021 → …9310', val: fmt(a.payroll * 0.48) },
      { label: 'Run Aug 15 (Aug 4–10)', sub: '', trace: 'transfer bt-1037 → …9310', val: fmt(a.payroll * 0.52) }]);
    case 'taxes': return S('Taxes', 'Sales tax remittance', [
      { label: 'NY sales tax · July', sub: 'Aug 20 due', trace: 'pay:ACH-0820-TAX', val: fmt(a.taxes) }]);
    case 'other': return S('Other expenses', 'Direct bank/card expenses', [
      { label: 'NYC Water Board', sub: 'Aug 14', trace: 'bt-1038 · classified', val: fmt(418) },
      { label: 'Card purchases', sub: '9 txns', trace: 'Amex …3009', val: fmt(a.otherOut - 418) }]);
    default: return S('Detail', '', []);
  }
}
