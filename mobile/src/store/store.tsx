/**
 * Cloud-backed data store. The app reads/writes through the MONARK API;
 * PostgreSQL enforces the core invariant server-side: an invoice hits the
 * P&L in its EXPENSE month, a payment hits cash in its PAYMENT month —
 * paying an August invoice in September never creates a September expense.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError, clearToken, createDeviceCreds, getDeviceCreds, getToken, setToken } from '../api/client';

export interface Location { id: string; name: string; code: string }
export interface Vendor { id: string; name: string }
export interface Category { id: string; name: string; group: string }

export type InvoiceStatus = 'pending_approval' | 'approved' | 'paid' | 'rejected' | 'on_hold';

export interface Invoice {
  id: string;
  vendorId: string;
  locationId: string;
  number: string;
  invoiceDate: string;
  expenseDate: string;
  dueDate: string;
  categoryId: string;
  description: string;
  subtotal: number;
  tax: number;
  status: InvoiceStatus;
  createdAt: string;
  paymentDate?: string | null;
  paymentMethod?: string | null;
  paymentRef?: string | null;
  history: Array<{ action: string; when: string }>;
}

export interface Payment {
  id: string;
  invoiceId: string;
  date: string;
  method: string;
  amount: number;
  ref?: string | null;
}

export interface PosDay {
  id: string;
  locationId: string;
  date: string;
  gross: number;
  discounts: number;
  comps?: number;
  refunds?: number;
  tax: number;
  tips: number;
  source?: string; // 'manual' | 'clover' | 'toast' | 'square' | 'lightspeed'
}

/** Net sales of a POS day: gross − discounts − comps − refunds. */
export const posNet = (p: PosDay): number => p.gross - p.discounts - (p.comps ?? 0) - (p.refunds ?? 0);

/** Money that actually entered that day: net + taxes + tips/service. */
export const posCollected = (p: PosDay): number => posNet(p) + p.tax + p.tips;

export interface BankAccount {
  id: string;
  institution: string;
  name: string;
  mask: string;
  type: string;
  balance: number;
  balanceAsOf: string | null;
}

export interface BankTxn {
  id: string;
  accountId: string;
  date: string;
  amount: number; // negative = money out
  description: string;
  counterparty?: string | null;
  pending: boolean;
  matched: boolean;
}

export interface BankIntegration {
  id: string;
  provider: string;
  status: string;
  lastSyncAt: string | null;
}

export interface InvoiceProposal {
  legible: boolean;
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  description: string | null;
  category_name: string | null;
  confidence: number;
  notes: string | null;
}

export interface Deposit {
  id: string;
  locationId: string;
  type: string; // 'card_batch' | 'cash_deposit'
  coversFrom: string;
  expectedAmount: number;
  expectedOn: string;
  actualAmount: number | null;
  variance: number | null;
  status: string; // 'expected' | 'matched' | 'variance' | 'missing'
  bankTransactionId: string | null;
  suggestion: { bankTransactionId: string; postedAt: string; amount: number } | null;
}

export interface MatchCandidate {
  paymentId: string;
  bankTransactionId: string;
  amount: number;
  paymentDate: string;
  postedAt: string;
  dateDistance: number;
  candidateCount: number;
  description: string;
  vendorName: string | null;
  invoiceNumber: string | null;
}

export interface PosIntegration {
  id: string;
  provider: string;
  merchantId: string;
  locationId: string | null;
  status: string;
  lastSyncAt: string | null;
}

interface AppData {
  orgName: string;
  locations: Location[];
  vendors: Vendor[];
  categories: Category[];
  invoices: Invoice[];
  payments: Payment[];
  posDays: PosDay[];
  integrations: PosIntegration[];
  bankAccounts: BankAccount[];
  bankTxns: BankTxn[];
  bankIntegrations: BankIntegration[];
  deposits: Deposit[];
  matchCandidates: MatchCandidate[];
}

const EMPTY: AppData = { orgName: '', locations: [], vendors: [], categories: [], invoices: [], payments: [], posDays: [], integrations: [], bankAccounts: [], bankTxns: [], bankIntegrations: [], deposits: [], matchCandidates: [] };

export const monthOf = (isoDate: string): string => isoDate.slice(0, 7);
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
  authed: boolean;
  busy: boolean;
  lastError: string | null;
  clearError(): void;
  register(email: string, password: string, orgName: string): Promise<void>;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  ensureSession(): Promise<void>;
  refresh(): Promise<void>;
  addLocation(name: string, code: string): Promise<void>;
  addInvoice(inv: {
    vendorId?: string; vendorName?: string; locationId: string; number: string;
    invoiceDate: string; expenseDate: string; dueDate?: string;
    categoryId: string; description?: string; subtotal: number; tax: number;
  }): Promise<void>;
  setInvoiceStatus(id: string, status: InvoiceStatus): Promise<void>;
  recordPayment(invoiceId: string, date: string, method: string, ref?: string): Promise<void>;
  addPosDay(day: { locationId: string; date: string; gross: number; discounts: number; tax: number; tips: number }): Promise<void>;
  connectPos(input: {
    provider: string; merchantId: string; apiToken: string; locationId: string;
    timezone?: string; dayCutoffHour?: number;
  }): Promise<void>;
  disconnectPos(id: string): Promise<void>;
  bankLinkToken(): Promise<string>;
  bankExchange(publicToken: string): Promise<void>;
  extractInvoice(fileBase64: string, mimeType: string): Promise<InvoiceProposal>;
  confirmDeposit(depositId: string, bankTransactionId: string): Promise<void>;
  confirmPaymentMatch(paymentId: string, bankTransactionId: string): Promise<void>;
}

const StoreContext = createContext<StoreApi | null>(null);

/** History shown in the invoice detail, derived from server facts. */
function synthesizeHistory(i: Omit<Invoice, 'history'>): Invoice['history'] {
  const h: Invoice['history'] = [];
  if (i.paymentDate) h.push({ action: `Pagada · caja ${monthLabel(monthOf(i.paymentDate))}`, when: i.paymentDate });
  if (i.status === 'rejected') h.push({ action: 'Rechazada', when: '' });
  if (i.status === 'on_hold') h.push({ action: 'En pausa', when: '' });
  if (i.status === 'approved' || i.status === 'paid') h.push({ action: 'Aprobada', when: '' });
  h.push({ action: `Creada · gasto ${monthLabel(monthOf(i.expenseDate))}`, when: i.createdAt.slice(0, 10) });
  return h;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY);
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [state, ints] = await Promise.all([
      api<Omit<AppData, 'integrations'> & { invoices: Array<Omit<Invoice, 'history'>> }>('GET', '/state'),
      api<{ integrations: PosIntegration[] }>('GET', '/integrations'),
    ]);
    setData({
      ...state,
      invoices: state.invoices.map((i) => ({ ...i, history: synthesizeHistory(i) })),
      integrations: ints.integrations,
    });
    setAuthed(true);
  }, []);

  /**
   * Silent module session. This module lives inside the MONARK super app:
   * the super-app login will own identity later, so there is no login screen
   * here — the device provisions (or resumes) its own account transparently.
   */
  const ensureSession = useCallback(async () => {
    setLastError(null);
    try {
      if (await getToken()) {
        await refresh();
        return;
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) await clearToken();
      else throw err;
    }
    const stored = await getDeviceCreds();
    if (stored) {
      try {
        const res = await api<{ token: string }>('POST', '/auth/login', stored);
        await setToken(res.token);
        await refresh();
        return;
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 401)) throw err;
        // device creds no longer valid server-side — fall through to re-provision
      }
    }
    const creds = await createDeviceCreds();
    const res = await api<{ token: string }>('POST', '/auth/register', {
      email: creds.email, password: creds.password, orgName: 'MONARK',
    });
    await setToken(res.token);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    (async () => {
      try {
        await ensureSession();
      } catch (err) {
        setLastError(err instanceof Error ? err.message : String(err));
      } finally {
        setReady(true);
      }
    })();
  }, [ensureSession]);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setLastError(null);
      try {
        await fn();
      } catch (err) {
        setLastError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const apiStore = useMemo<StoreApi>(
    () => ({
      data, ready, authed, busy, lastError,
      clearError: () => setLastError(null),
      register: (email, password, orgName) =>
        run(async () => {
          const res = await api<{ token: string }>('POST', '/auth/register', { email, password, orgName });
          await setToken(res.token);
          await refresh();
        }),
      login: (email, password) =>
        run(async () => {
          const res = await api<{ token: string }>('POST', '/auth/login', { email, password });
          await setToken(res.token);
          await refresh();
        }),
      logout: async () => {
        await clearToken();
        setAuthed(false);
        setData(EMPTY);
      },
      ensureSession: () => run(ensureSession),
      refresh,
      addLocation: (name, code) =>
        run(async () => {
          await api('POST', '/locations', { name, code });
          await refresh();
        }),
      addInvoice: (inv) =>
        run(async () => {
          await api('POST', '/invoices', inv);
          await refresh();
        }),
      setInvoiceStatus: (id, status) =>
        run(async () => {
          const action = { approved: 'approve', rejected: 'reject', on_hold: 'hold', pending_approval: 'reactivate', paid: 'approve' }[status];
          await api('POST', `/invoices/${id}/decision`, { action });
          await refresh();
        }),
      recordPayment: (invoiceId, date, method, ref) =>
        run(async () => {
          await api('POST', `/invoices/${invoiceId}/pay`, { date, method, ref });
          await refresh();
        }),
      addPosDay: (day) =>
        run(async () => {
          await api('POST', '/pos-days', day);
          await refresh();
        }),
      connectPos: (input) =>
        run(async () => {
          await api('POST', '/integrations', input);
          await refresh();
        }),
      disconnectPos: (id) =>
        run(async () => {
          await api('POST', `/integrations/${id}/disconnect`, {});
          await refresh();
        }),
      bankLinkToken: async () => {
        const res = await api<{ linkToken: string }>('POST', '/bank/link-token', {});
        return res.linkToken;
      },
      bankExchange: (publicToken) =>
        run(async () => {
          await api('POST', '/bank/exchange', { publicToken });
          await refresh();
        }),
      extractInvoice: async (fileBase64, mimeType) => {
        setBusy(true);
        setLastError(null);
        try {
          const res = await api<{ proposal: InvoiceProposal }>('POST', '/invoices/extract', { fileBase64, mimeType });
          return res.proposal;
        } catch (err) {
          setLastError(err instanceof Error ? err.message : String(err));
          throw err;
        } finally {
          setBusy(false);
        }
      },
      confirmDeposit: (depositId, bankTransactionId) =>
        run(async () => {
          await api('POST', '/reconcile/deposit', { depositId, bankTransactionId });
          await refresh();
        }),
      confirmPaymentMatch: (paymentId, bankTransactionId) =>
        run(async () => {
          await api('POST', '/reconcile/payment', { paymentId, bankTransactionId });
          await refresh();
        }),
    }),
    [data, ready, authed, busy, lastError, refresh, run, ensureSession],
  );

  return <StoreContext.Provider value={apiStore}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore outside StoreProvider');
  return ctx;
}

/* ── Derived financials (mirror of the server-side invariant) ────────────── */

export const invoiceTotal = (i: Invoice): number => i.subtotal + i.tax;

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

export function revenueByMonth(d: AppData): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of d.posDays) {
    const m = monthOf(p.date);
    out.set(m, (out.get(m) ?? 0) + posNet(p));
  }
  return out;
}

export function cashOutByMonth(d: AppData): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of d.payments) {
    const m = monthOf(p.date);
    out.set(m, (out.get(m) ?? 0) + p.amount);
  }
  return out;
}

export function openAP(d: AppData): Invoice[] {
  return d.invoices.filter((i) => i.status === 'approved');
}
