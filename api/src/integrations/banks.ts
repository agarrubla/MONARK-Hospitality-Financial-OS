/**
 * Bank aggregator adapters.
 *
 * - Plaid  → US / Canada / Europe banks.
 * - Belvo  → Latin America banks (Colombia, México, Brasil…).
 * - Sandbox → deterministic simulated feed for tests and demos.
 *
 * All three return the same normalized shapes; the sync engine treats them
 * identically. Real adapters activate when their environment keys exist —
 * until then connections simply fail with a clear "credentials missing"
 * error, never with fake data.
 */
import type { BankFeedAdapter, BankSyncResult, NormalizedBankAccount, NormalizedBankTxn } from './types.js';

const need = (creds: Record<string, string>, keys: string[], provider: string): void => {
  for (const k of keys) {
    if (!creds[k]) throw new Error(`${provider}: missing credential "${k}" — connect the integration first`);
  }
};

/* ── Plaid (US/CA/EU) ────────────────────────────────────────────────────── */

export const plaidAdapter: BankFeedAdapter = {
  provider: 'plaid',
  async sync(creds, cursor): Promise<BankSyncResult> {
    need(creds, ['client_id', 'secret', 'access_token'], 'plaid');
    const env = creds.env ?? 'sandbox'; // sandbox | development | production
    const base = `https://${env}.plaid.com`;

    const accountsRes = await fetch(`${base}/accounts/get`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: creds.client_id, secret: creds.secret, access_token: creds.access_token }),
    });
    if (!accountsRes.ok) throw new Error(`plaid accounts/get ${accountsRes.status}: ${await accountsRes.text()}`);
    const accountsJson = (await accountsRes.json()) as {
      accounts: Array<{ account_id: string; name: string; mask: string | null; type: string; subtype: string | null; balances: { current: number | null; iso_currency_code: string | null } }>;
      item: { institution_name?: string | null };
    };

    const typeMap = (t: string, s: string | null): NormalizedBankAccount['accountType'] =>
      t === 'credit' ? 'credit_card' : s === 'savings' ? 'savings' : s === 'money market' ? 'money_market' : 'checking';

    const accounts: NormalizedBankAccount[] = accountsJson.accounts.map((a) => ({
      externalAccountId: a.account_id,
      institutionName: accountsJson.item.institution_name ?? 'Bank',
      accountName: a.name,
      mask: (a.mask ?? '0000').slice(-4),
      accountType: typeMap(a.type, a.subtype),
      currency: a.balances.iso_currency_code ?? 'USD',
      currentBalance: a.balances.current ?? 0,
    }));

    // Incremental, replay-safe transaction sync.
    const transactions = new Map<string, NormalizedBankTxn[]>();
    let nextCursor = cursor;
    let hasMore = true;
    while (hasMore) {
      const res = await fetch(`${base}/transactions/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: creds.client_id, secret: creds.secret, access_token: creds.access_token,
          cursor: nextCursor ?? undefined, count: 500,
        }),
      });
      if (!res.ok) throw new Error(`plaid transactions/sync ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as {
        added: Array<{ account_id: string; transaction_id: string; date: string; amount: number; name: string; merchant_name: string | null; pending: boolean }>;
        next_cursor: string;
        has_more: boolean;
      };
      for (const t of json.added) {
        const list = transactions.get(t.account_id) ?? [];
        list.push({
          externalTxnId: t.transaction_id,
          postedAt: t.date,
          // Plaid: positive = money OUT. Monark: negative = outflow.
          amount: -t.amount,
          descriptionRaw: t.name,
          counterparty: t.merchant_name ?? undefined,
          pending: t.pending,
        });
        transactions.set(t.account_id, list);
      }
      nextCursor = json.next_cursor;
      hasMore = json.has_more;
    }
    return { accounts, transactions, nextCursor };
  },
};

/* ── Belvo (Latin America) ───────────────────────────────────────────────── */

export const belvoAdapter: BankFeedAdapter = {
  provider: 'belvo',
  async sync(creds, cursor): Promise<BankSyncResult> {
    need(creds, ['secret_id', 'secret_password', 'link_id'], 'belvo');
    const base = creds.env === 'production' ? 'https://api.belvo.com' : 'https://sandbox.belvo.com';
    const auth = 'Basic ' + Buffer.from(`${creds.secret_id}:${creds.secret_password}`).toString('base64');

    const accRes = await fetch(`${base}/api/accounts/?link=${creds.link_id}&page_size=100`, {
      headers: { authorization: auth },
    });
    if (!accRes.ok) throw new Error(`belvo accounts ${accRes.status}: ${await accRes.text()}`);
    const accJson = (await accRes.json()) as {
      results: Array<{ id: string; institution: { name: string }; name: string; number: string | null; category: string; currency: string; balance: { current: number } }>;
    };
    const catMap = (c: string): NormalizedBankAccount['accountType'] =>
      c === 'CREDIT_CARD' ? 'credit_card' : c === 'SAVINGS_ACCOUNT' ? 'savings' : 'checking';
    const accounts: NormalizedBankAccount[] = accJson.results.map((a) => ({
      externalAccountId: a.id,
      institutionName: a.institution.name,
      accountName: a.name,
      mask: (a.number ?? '0000').slice(-4),
      accountType: catMap(a.category),
      currency: a.currency,
      currentBalance: a.balance.current,
    }));

    // Belvo has no sync cursor; we page transactions from the last synced
    // date. The DB's external-id and dedupe-hash guards make replays no-ops.
    const since = cursor ?? '2000-01-01';
    const transactions = new Map<string, NormalizedBankTxn[]>();
    let latest = since;
    for (const acc of accounts) {
      let url: string | null =
        `${base}/api/transactions/?link=${creds.link_id}&account=${acc.externalAccountId}&value_date__gte=${since}&page_size=1000`;
      while (url) {
        const res: Response = await fetch(url, { headers: { authorization: auth } });
        if (!res.ok) throw new Error(`belvo transactions ${res.status}: ${await res.text()}`);
        const json = (await res.json()) as {
          next: string | null;
          results: Array<{ id: string; value_date: string; amount: number; type: 'INFLOW' | 'OUTFLOW'; description: string; merchant?: { name?: string } | null; status: string }>;
        };
        const list = transactions.get(acc.externalAccountId) ?? [];
        for (const t of json.results) {
          list.push({
            externalTxnId: t.id,
            postedAt: t.value_date,
            amount: t.type === 'OUTFLOW' ? -Math.abs(t.amount) : Math.abs(t.amount),
            descriptionRaw: t.description,
            counterparty: t.merchant?.name ?? undefined,
            pending: t.status === 'PENDING',
          });
          if (t.value_date > latest) latest = t.value_date;
        }
        transactions.set(acc.externalAccountId, list);
        url = json.next;
      }
    }
    return { accounts, transactions, nextCursor: latest };
  },
};

/* ── Sandbox (tests & demos) ─────────────────────────────────────────────── */

export interface SandboxBankData {
  accounts: NormalizedBankAccount[];
  transactions: Map<string, NormalizedBankTxn[]>;
}

export const makeSandboxBankAdapter = (data: SandboxBankData): BankFeedAdapter => ({
  provider: 'other',
  async sync(): Promise<BankSyncResult> {
    return { ...data, nextCursor: 'sandbox' };
  },
});

export const bankAdapters: Record<string, BankFeedAdapter> = {
  plaid: plaidAdapter,
  belvo: belvoAdapter,
};
