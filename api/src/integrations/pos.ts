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

interface CloverDiscount {
  amount?: number; // cents (sign varies by client; use magnitude)
  percentage?: number; // 0–100
}
interface CloverOrder {
  id: string;
  discounts?: { elements: CloverDiscount[] };
  lineItems?: { elements: Array<{ price: number; discounts?: { elements: CloverDiscount[] } }> };
}

/**
 * Discounts live on orders, not payments (payments report the post-discount
 * charge). Fixed discounts count by magnitude; percentage ones apply to the
 * line price (line level) or the discounted line subtotal (order level).
 */
async function cloverDiscountCents(
  base: string,
  token: string,
  merchantId: string,
  dayStart: number,
  dayEnd: number,
): Promise<number> {
  let total = 0;
  let offset = 0;
  for (;;) {
    const url =
      `${base}/v3/merchants/${merchantId}/orders` +
      `?filter=createdTime>=${dayStart}&filter=createdTime<${dayEnd}` +
      `&expand=discounts,lineItems.discounts&limit=1000&offset=${offset}`;
    const res = await fetchWithRetry(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`clover orders ${res.status}: ${await res.text()}`);
    const orders = ((await res.json()) as { elements: CloverOrder[] }).elements;
    for (const o of orders) {
      let lineSub = 0;
      let lineDisc = 0;
      for (const li of o.lineItems?.elements ?? []) {
        lineSub += li.price;
        for (const d of li.discounts?.elements ?? []) {
          lineDisc += d.amount ? Math.abs(d.amount) : Math.round((li.price * (d.percentage ?? 0)) / 100);
        }
      }
      let orderDisc = 0;
      for (const d of o.discounts?.elements ?? []) {
        orderDisc += d.amount
          ? Math.abs(d.amount)
          : Math.round(((lineSub - lineDisc) * (d.percentage ?? 0)) / 100);
      }
      total += lineDisc + orderDisc;
    }
    if (orders.length < 1000) break;
    offset += 1000;
  }
  return total;
}

/** Epoch millis of `date` at `hour`:00 local time in `tz` (DST-safe). */
export function zonedEpoch(tz: string, date: string, hour: number): number {
  const want = Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
  let ts = want;
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(ts));
    const get = (t: string) => parts.find((p) => p.type === t)!.value;
    const hh = get('hour') === '24' ? '00' : get('hour');
    const asUtc = Date.parse(`${get('year')}-${get('month')}-${get('day')}T${hh}:${get('minute')}:${get('second')}Z`);
    ts += want - asUtc;
  }
  return ts;
}

const nextDate = (date: string): string =>
  new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * A hospitality business day is NOT the calendar day: service that opens at
 * 7pm and closes at 2–5am belongs entirely to the night it started. Day D
 * covers [D at cutoff, D+1 at cutoff) in the merchant's timezone; cutoff
 * defaults to 6am (creds.day_cutoff_hour overrides).
 */
export const dayCutoffHour = (creds: Record<string, string>): number => {
  const h = Number(creds.day_cutoff_hour ?? 6);
  return Number.isInteger(h) && h >= 0 && h <= 12 ? h : 6;
};

export const cloverAdapter: PosAdapter = {
  provider: 'clover',
  async fetchDay(creds, merchantId, businessDate): Promise<NormalizedPosDay | null> {
    need(creds, ['api_token'], 'clover');
    const base = creds.env === 'sandbox' ? 'https://apisandbox.dev.clover.com' : 'https://api.clover.com';
    const tz = creds.timezone ?? 'UTC';
    // Business-day window in epoch millis (Clover filters on createdTime).
    const cutoff = dayCutoffHour(creds);
    const dayStart = zonedEpoch(tz, businessDate, cutoff);
    const dayEnd = zonedEpoch(tz, nextDate(businessDate), cutoff);

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
    // Itemized discounts come from the orders of the same window. If Clover
    // can't answer, degrade to 0 rather than losing the whole day.
    let discountCents = 0;
    try {
      discountCents = await cloverDiscountCents(base, creds.api_token!, merchantId, dayStart, dayEnd);
    } catch (err) {
      console.error(`clover discounts ${businessDate}: ${(err as Error).message}`);
    }

    const toUnits = (c: number) => Math.round(c) / 100;
    // Schema convention: tender must sum to gross + tax + tips, where gross is
    // PRE-discount — the discounted portion rides in the "other" bucket (same
    // as the manual-entry path, which folds everything into "other").
    const gross = toUnits(cents.total - cents.tax - cents.tips + discountCents);
    return {
      businessDate,
      grossSales: gross,
      discounts: toUnits(discountCents),
      comps: 0,
      taxCollected: toUnits(cents.tax),
      tips: toUnits(cents.tips),
      tender: { cash: toUnits(cents.cash), card: toUnits(cents.card), gift_card: 0, other: toUnits(cents.other + discountCents) },
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
