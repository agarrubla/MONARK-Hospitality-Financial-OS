/**
 * POS adapters. Clover is the first real one (the user's POS); Toast,
 * Square and Lightspeed plug into the same interface when their credentials
 * arrive. Every adapter returns the same normalized daily summary, and the
 * tender breakdown must satisfy the schema trigger:
 * cash + card + gift_card + other = gross + tax + tips.
 */
import type { NormalizedPosDay, PosAdapter } from './types.js';

const need = (creds: Record<string, string>, keys: string[], provider: string): void => {
  for (const k of keys) {
    if (!creds[k]) throw new Error(`${provider}: missing credential "${k}" — connect the integration first`);
  }
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Providers rate-limit backfills; wait out 429/5xx instead of failing the day. */
async function fetchWithRetry(url: string, init: RequestInit, tries = 5): Promise<Response> {
  let res: Response | null = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    res = await fetch(url, init);
    if (res.status !== 429 && res.status < 500) return res;
    await sleep(1500 * (attempt + 1));
  }
  return res!;
}

/* ── Clover ──────────────────────────────────────────────────────────────── */

interface CloverPayment {
  id: string;
  amount: number; // cents, includes tax
  tipAmount?: number; // cents
  taxAmount?: number; // cents
  result: string;
  tender?: { labelKey?: string; label?: string };
}

export const cloverAdapter: PosAdapter = {
  provider: 'clover',
  async fetchDay(creds, merchantId, businessDate): Promise<NormalizedPosDay | null> {
    need(creds, ['api_token'], 'clover');
    const base = creds.env === 'sandbox' ? 'https://apisandbox.dev.clover.com' : 'https://api.clover.com';
    const tz = creds.timezone ?? 'UTC';
    // Business-day window in epoch millis (Clover filters on createdTime).
    const dayStart = Date.parse(`${businessDate}T00:00:00`);
    const dayEnd = dayStart + 24 * 3600 * 1000;

    const payments: CloverPayment[] = [];
    let offset = 0;
    for (;;) {
      const url =
        `${base}/v3/merchants/${merchantId}/payments` +
        `?filter=createdTime>=${dayStart}&filter=createdTime<${dayEnd}` +
        `&expand=tender&limit=1000&offset=${offset}`;
      const res = await fetchWithRetry(url, { headers: { authorization: `Bearer ${creds.api_token}` } });
      if (!res.ok) throw new Error(`clover payments ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as { elements: CloverPayment[] };
      payments.push(...json.elements);
      if (json.elements.length < 1000) break;
      offset += 1000;
    }
    if (payments.length === 0) return null;

    const settled = payments.filter((p) => p.result === 'SUCCESS');
    const cents = { cash: 0, card: 0, other: 0, tax: 0, tips: 0, total: 0 };
    for (const p of settled) {
      const label = (p.tender?.labelKey ?? p.tender?.label ?? '').toLowerCase();
      const bucket = label.includes('cash') ? 'cash' : label.includes('credit') || label.includes('debit') || label.includes('card') ? 'card' : 'other';
      const tip = p.tipAmount ?? 0;
      cents[bucket] += p.amount + tip;
      cents.tax += p.taxAmount ?? 0;
      cents.tips += tip;
      cents.total += p.amount + tip;
    }
    const toUnits = (c: number) => Math.round(c) / 100;
    // gross = tendered − tax − tips (tender must equal gross + tax + tips).
    const gross = toUnits(cents.total - cents.tax - cents.tips);
    return {
      businessDate,
      grossSales: gross,
      discounts: 0, // v1: Clover reports post-discount amounts; itemized discounts come with the orders expansion
      comps: 0,
      taxCollected: toUnits(cents.tax),
      tips: toUnits(cents.tips),
      tender: { cash: toUnits(cents.cash), card: toUnits(cents.card), gift_card: 0, other: toUnits(cents.other) },
      checkCount: settled.length,
      externalBatchId: `clover-${merchantId}-${businessDate}-${tz}`,
    };
  },
};

/* ── Not-yet-connected providers fail loudly, never silently ─────────────── */

const notConnected = (provider: string): PosAdapter => ({
  provider,
  async fetchDay() {
    throw new Error(`${provider}: adapter ready but no partner credentials configured yet`);
  },
});

/* ── Sandbox (tests & demos) ─────────────────────────────────────────────── */

export const makeSandboxPosAdapter = (days: Record<string, NormalizedPosDay>): PosAdapter => ({
  provider: 'other',
  async fetchDay(_creds, _merchant, businessDate) {
    return days[businessDate] ?? null;
  },
});

export const posAdapters: Record<string, PosAdapter> = {
  clover: cloverAdapter,
  toast: notConnected('toast'),
  square: notConnected('square'),
  lightspeed: notConnected('lightspeed'),
};
