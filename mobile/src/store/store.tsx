/**
 * Live data store — the app starts EMPTY and the user feeds it.
 * Persisted on-device (localStorage on web, AsyncStorage on native).
 *
 * The core invariant is enforced here, exactly as in the backend:
 * one transaction = one financial event. An invoice hits the P&L in its
 * EXPENSE month; a payment hits cash flow in its PAYMENT month; paying an
 * August invoice in September never creates a September expense.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export interface Location { id: string; name: string; code: string }
export interface Vendor { id: string; name: string; termsDays: number }
export interface Category { id: string; name: string; group: 'cogs' | 'labor' | 'occupancy' | 'opex' | 'gna' }

export type InvoiceStatus = 'pending_approval' | 'approved' | 'scheduled' | 'paid' | 'rejected' | 'on_hold';

export interface Invoice {
  id: string;
  vendorId: string;
  locationId: string;
  number: string;
  invoiceDate: string; // YYYY-MM-DD
  expenseDate: string; // YYYY-MM-DD → drives the P&L month
  dueDate: string;
  categoryId: string;
  description: string;
  subtotal: number;
  tax: number;
  status: InvoiceStatus;
  scheduledFor?: string;
  history: Array<{ action: string; when: string }>;
}

export interface Payment {
  id: string;
  invoiceId: string;
  date: string; // YYYY-MM-DD → drives the cash month
  method: 'ach' | 'check' | 'wire' | 'card' | 'cash';
  amount: number;
  ref?: string;
}

export interface PosDay {
  id: string;
  locationId: string;
  date: string; // YYYY-MM-DD business date
  gross: number;
  discounts: number;
  tax: number;
  tips: number;
  food: number;
  bev: number;
}

interface AppData {
  locations: Location[];
  vendors: Vendor[];
  categories: Category[];
  invoices: Invoice[];
  payments: Payment[];
  posDays: PosDay[];
}

/** Standard restaurant chart of categories — structure, not data. */
const seedCategories: Category[] = [
  { id: 'c-food', name: 'COGS · Food', group: 'cogs' },
  { id: 'c-bev', name: 'COGS · Beverage', group: 'cogs' },
  { id: 'c-labor', name: 'Labor', group: 'labor' },
  { id: 'c-rent', name: 'Rent & occupancy', group: 'occupancy' },
  { id: 'c-util', name: 'Utilities', group: 'opex' },
  { id: 'c-supplies', name: 'Supplies', group: 'opex' },
  { id: 'c-services', name: 'Services & maintenance', group: 'opex' },
  { id: 'c-fees', name: 'Fees & processing', group: 'gna' },
  { id: 'c-other', name: 'Other', group: 'gna' },
];

const EMPTY: AppData = {
  locations: [],
  vendors: [],
  categories: seedCategories,
  invoices: [],
  payments: [],
  posDays: [],
};

const STORAGE_KEY = 'monark.data.v1';

export const uid = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
export const monthOf = (isoDate: string): string => isoDate.slice(0, 7); // YYYY-MM
export const todayISO = (): string => new Date().toISOString().slice(0, 10);
export const money = (n: number): string =>
  (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const names = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${names[(m ?? 1) - 1]} ${y}`;
}

interface StoreApi {
  data: AppData;
  ready: boolean;
  addLocation(name: string, code: string): void;
  addVendor(name: string, termsDays: number): Vendor;
  addInvoice(inv: Omit<Invoice, 'id' | 'status' | 'history'>): void;
  setInvoiceStatus(id: string, status: InvoiceStatus, note?: string, scheduledFor?: string): void;
  recordPayment(invoiceId: string, date: string, method: Payment['method'], ref?: string): void;
  addPosDay(day: Omit<PosDay, 'id'>): void;
  resetAll(): void;
}

const StoreContext = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setData({ ...EMPTY, ...JSON.parse(raw) });
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const update = (fn: (d: AppData) => AppData) => {
    setData((prev) => {
      const next = fn(prev);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const api = useMemo<StoreApi>(
    () => ({
      data,
      ready,
      addLocation: (name, code) =>
        update((d) => ({ ...d, locations: [...d.locations, { id: uid(), name, code: code.toUpperCase() }] })),
      addVendor: (name, termsDays) => {
        const vendor: Vendor = { id: uid(), name, termsDays };
        update((d) => ({ ...d, vendors: [...d.vendors, vendor] }));
        return vendor;
      },
      addInvoice: (inv) =>
        update((d) => ({
          ...d,
          invoices: [
            {
              ...inv,
              id: uid(),
              status: 'pending_approval',
              history: [{ action: 'Created', when: todayISO() }],
            },
            ...d.invoices,
          ],
        })),
      setInvoiceStatus: (id, status, note, scheduledFor) =>
        update((d) => ({
          ...d,
          invoices: d.invoices.map((i) =>
            i.id === id
              ? {
                  ...i,
                  status,
                  scheduledFor: scheduledFor ?? i.scheduledFor,
                  history: [{ action: note ?? status, when: todayISO() }, ...i.history],
                }
              : i,
          ),
        })),
      recordPayment: (invoiceId, date, method, ref) =>
        update((d) => {
          const inv = d.invoices.find((i) => i.id === invoiceId);
          if (!inv) return d;
          return {
            ...d,
            payments: [
              { id: uid(), invoiceId, date, method, amount: inv.subtotal + inv.tax, ref },
              ...d.payments,
            ],
            invoices: d.invoices.map((i) =>
              i.id === invoiceId
                ? { ...i, status: 'paid', history: [{ action: `Paid · cash month ${monthLabel(monthOf(date))}`, when: todayISO() }, ...i.history] }
                : i,
            ),
          };
        }),
      addPosDay: (day) => update((d) => ({ ...d, posDays: [{ ...day, id: uid() }, ...d.posDays] })),
      resetAll: () => update(() => EMPTY),
    }),
    [data, ready],
  );

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore outside StoreProvider');
  return ctx;
}

/* ── Derived financials (the invariant lives here) ─────────────────────── */

export const invoiceTotal = (i: Invoice): number => i.subtotal + i.tax;

/** Expenses by P&L month (expense date), only booked invoices — never by payment date. */
export function expensesByMonth(d: AppData): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of d.invoices) {
    if (i.status === 'rejected' || i.status === 'pending_approval' || i.status === 'on_hold') continue;
    const m = monthOf(i.expenseDate);
    out.set(m, (out.get(m) ?? 0) + invoiceTotal(i));
  }
  return out;
}

export function expensesByCategory(d: AppData, month?: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of d.invoices) {
    if (i.status === 'rejected' || i.status === 'pending_approval' || i.status === 'on_hold') continue;
    if (month && monthOf(i.expenseDate) !== month) continue;
    out.set(i.categoryId, (out.get(i.categoryId) ?? 0) + invoiceTotal(i));
  }
  return out;
}

/** Revenue by month from POS days (net = gross − discounts). */
export function revenueByMonth(d: AppData): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of d.posDays) {
    const m = monthOf(p.date);
    out.set(m, (out.get(m) ?? 0) + (p.gross - p.discounts));
  }
  return out;
}

/** Cash out by month from payments (payment date) — never from expense dates. */
export function cashOutByMonth(d: AppData): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of d.payments) {
    const m = monthOf(p.date);
    out.set(m, (out.get(m) ?? 0) + p.amount);
  }
  return out;
}

export function openAP(d: AppData): Invoice[] {
  return d.invoices.filter((i) => ['approved', 'scheduled'].includes(i.status));
}
