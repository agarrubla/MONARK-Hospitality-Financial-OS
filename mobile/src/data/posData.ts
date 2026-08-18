/**
 * MOCK DATA — development fixtures only, ported verbatim from
 * "Monark POS.dc.html". One normalized sales schema for every provider —
 * screens never know which POS produced the numbers.
 */
export interface PosDay {
  loc: string;
  src: string;
  srcColor: string;
  date: string;
  hours: string;
  gross: number;
  discounts: number;
  comps: number;
  refunds: number;
  net: number;
  food: number;
  bev: number;
  tax: number;
  tips: number;
  cash: number;
  card: number;
  other: number;
  txns: number;
  avg: number;
  delta: number;
  provenance: string;
}

const D = (loc: string, src: string, srcColor: string, data: Omit<PosDay, 'loc' | 'src' | 'srcColor'>): PosDay =>
  ({ loc, src, srcColor, ...data });

export const posDays: Record<'sat' | 'fri', PosDay[]> = {
  sat: [
    D('Vela Soho', 'TOAST', '#e0592a', { date: 'Sat Aug 16', hours: '8:00 AM – 2:14 AM', gross: 11840, discounts: 312, comps: 148, refunds: 96, net: 11284, food: 7420, bev: 3864, tax: 1001, tips: 2148, cash: 1218, card: 12876, other: 895, txns: 289, avg: 39.04, delta: 7.8,
      provenance: 'Imported 3:05 AM via Toast adapter (API v2, batch 250816). Raw payload archived · normalized by adapter toast@1.4 · mapping version logged. Re-syncs are idempotent: (location, business date, source) is unique.' }),
    D('Vela Trattoria Midtown', 'SQUARE', '#3a6ff0', { date: 'Sat Aug 16', hours: '11:00 AM – 11:40 PM', gross: 8960, discounts: 214, comps: 102, refunds: 155, net: 8489, food: 6120, bev: 2369, tax: 753, tips: 1590, cash: 842, card: 9915, other: 546, txns: 231, avg: 36.75, delta: -2.4,
      provenance: 'Imported 3:02 AM via Square adapter (Orders API). Refund of $155 on ticket #4412 carried as negative sale, not deleted. Adapter square@1.2.' }),
    D('Bar Vela Brooklyn', 'LIGHTSPEED', '#7a4fd0', { date: 'Sat Aug 16', hours: '4:00 PM – 3:50 AM', gross: 7210, discounts: 188, comps: 240, refunds: 0, net: 6782, food: 1490, bev: 5292, tax: 602, tips: 1394, cash: 1630, card: 6892, other: 684, txns: 198, avg: 34.25, delta: 12.1,
      provenance: 'Imported 4:10 AM via Lightspeed adapter. 1:00–3:50 AM checks assigned to Aug 16 business date per location timezone rule. Adapter lightspeed@1.1.' }),
  ],
  fri: [
    D('Vela Soho', 'TOAST', '#e0592a', { date: 'Fri Aug 15', hours: '8:00 AM – 2:05 AM', gross: 10420, discounts: 280, comps: 120, refunds: 44, net: 9976, food: 6610, bev: 3366, tax: 885, tips: 1902, cash: 1104, card: 11348, other: 755, txns: 262, avg: 38.08, delta: 4.2, provenance: 'Imported 3:04 AM via Toast adapter.' }),
    D('Vela Trattoria Midtown', 'SQUARE', '#3a6ff0', { date: 'Fri Aug 15', hours: '11:00 AM – 11:30 PM', gross: 8110, discounts: 190, comps: 88, refunds: 61, net: 7771, food: 5580, bev: 2191, tax: 689, tips: 1443, cash: 760, card: 9008, other: 475, txns: 214, avg: 36.31, delta: 1.6, provenance: 'Imported 3:01 AM via Square adapter.' }),
    D('Bar Vela Brooklyn', 'LIGHTSPEED', '#7a4fd0', { date: 'Fri Aug 15', hours: '4:00 PM – 3:40 AM', gross: 6480, discounts: 150, comps: 195, refunds: 20, net: 6115, food: 1355, bev: 4760, tax: 543, tips: 1247, cash: 1421, card: 6252, other: 600, txns: 182, avg: 33.60, delta: 6.9, provenance: 'Imported 4:08 AM via Lightspeed adapter.' }),
  ],
};

export type DepositStatus = 'Matched' | 'Expected' | 'Variance' | 'Missing';

export interface PosDeposit {
  id: string;
  title: string;
  meta: string;
  expected: number;
  actual: number | null;
  status: DepositStatus;
  provider: string;
}

export const posDeposits: PosDeposit[] = [
  { id: 'dp1', title: 'Card batch · Soho', meta: 'Toast payouts · covers Aug 14 · expected T+2 (Aug 16)', expected: 6214.00, actual: 5732.00, status: 'Variance', provider: 'TOAST' },
  { id: 'dp2', title: 'Card batch · Soho', meta: 'Toast payouts · covers Aug 15 · expected T+2 (Aug 17)', expected: 11348.00, actual: null, status: 'Expected', provider: 'TOAST' },
  { id: 'dp3', title: 'Card batch · Midtown', meta: 'Square settlements · covers Aug 15 · expected T+1 (Aug 16)', expected: 9008.00, actual: 9008.00, status: 'Matched', provider: 'SQUARE' },
  { id: 'dp4', title: 'Cash deposit · Brooklyn', meta: 'Cash drops · covers Aug 12–13 · expected by Aug 15', expected: 1840.00, actual: null, status: 'Missing', provider: 'LIGHTSPEED' },
  { id: 'dp5', title: 'Card batch · Brooklyn', meta: 'Lightspeed payments · covers Aug 15 · expected T+2 (Aug 17)', expected: 6252.00, actual: null, status: 'Expected', provider: 'LIGHTSPEED' },
  { id: 'dp6', title: 'Card batch · Midtown', meta: 'Square settlements · covers Aug 14 · expected T+1 (Aug 15)', expected: 8410.00, actual: 8410.00, status: 'Matched', provider: 'SQUARE' },
];

export const posProviders = [
  { name: 'Toast', initial: 'T', color: '#e0592a', meta: 'Vela Soho · adapter toast@1.4', state: 'CONNECTED', sync: 'synced 3:05 AM' },
  { name: 'Square', initial: 'S', color: '#3a6ff0', meta: 'Vela Trattoria Midtown · adapter square@1.2', state: 'CONNECTED', sync: 'synced 3:02 AM' },
  { name: 'Lightspeed', initial: 'L', color: '#7a4fd0', meta: 'Bar Vela Brooklyn · adapter lightspeed@1.1', state: 'CONNECTED', sync: 'synced 4:10 AM' },
  { name: 'Clover · future', initial: 'C', color: '#a5aca6', meta: 'Adapter ready — no location assigned', state: 'AVAILABLE', sync: '' },
];

export const depositBadges: Record<DepositStatus, [string, string]> = {
  Matched: ['#14584a', '#eaf3ee'],
  Expected: ['#4a6b8a', '#edf2f7'],
  Variance: ['#b07c1e', '#fdf6ec'],
  Missing: ['#b3402e', '#faeeeb'],
};

export const money = (n: number): string => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2 });
export const moneyK = (n: number): string => '$' + Math.round(n).toLocaleString('en-US');
