/**
 * POS settings endpoints — the app's Ajustes screen: connect a POS with a
 * token, list it, replace the token, disconnect. Tokens must land encrypted
 * and stay invisible to the app DB role.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildProductApp } from '../api/src/app.js';
import { decryptCreds } from '../api/src/secrets.js';
import { resolveCredentialsFor } from '../api/src/integrations/sync.js';
import { pool, uniq } from './helpers.js';

let app: FastifyInstance;
let token = '';
let locationId = '';
let integrationId = '';
const email = `${uniq('pos-owner')}@example.com`;
const synced: string[] = [];

beforeAll(async () => {
  process.env.MONARK_SECRET_KEY = 'test-secret-key';
  app = buildProductApp(pool, {
    verifyPos: async (provider, merchantId, creds) =>
      creds.api_token === 'token-bueno'
        ? { ok: true, name: 'Casa de Prueba' }
        : { ok: false, error: 'El proveedor rechazó el token.' },
    syncAfterConnect: (id) => synced.push(id),
  });
  await app.ready();

  const reg = await app.inject({
    method: 'POST', url: '/auth/register',
    payload: { email, password: 'secreta123', orgName: 'POS Org' },
  });
  token = reg.json().token;
  const loc = await app.inject({
    method: 'POST', url: '/locations', payload: { name: 'Centro', code: 'CENTRO' },
    headers: { authorization: `Bearer ${token}` },
  });
  locationId = loc.json().id ?? (await state()).locations[0].id;
});

afterAll(async () => {
  await app.close();
});

const call = (method: 'GET' | 'POST', url: string, payload?: object) =>
  app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
const state = async () => (await call('GET', '/state')).json();

describe('POS settings', () => {
  it('rejects a bad token without storing anything', async () => {
    const res = await call('POST', '/integrations', {
      provider: 'clover', merchantId: 'MERCH1', apiToken: 'token-malo', locationId,
    });
    expect(res.statusCode).toBe(400);
    expect((await call('GET', '/integrations')).json().integrations).toHaveLength(0);
  });

  it('connects a POS with a verified token and kicks a backfill', async () => {
    const res = await call('POST', '/integrations', {
      provider: 'clover', merchantId: 'MERCH1', apiToken: 'token-bueno', locationId, timezone: 'America/New_York',
    });
    expect(res.statusCode).toBe(200);
    integrationId = res.json().id;
    expect(res.json().merchantName).toBe('Casa de Prueba');
    expect(synced).toContain(integrationId);

    const list = (await call('GET', '/integrations')).json().integrations;
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe('connected');
    expect(JSON.stringify(list[0])).not.toContain('token-bueno');
  });

  it('stores the token encrypted, resolvable only by the service layer', async () => {
    const row = (
      await pool.query(`SELECT ref, ciphertext FROM integration_secrets WHERE ref LIKE 'db:%MERCH1'`)
    ).rows[0];
    expect(row).toBeDefined();
    expect(row.ciphertext).not.toContain('token-bueno');
    expect(decryptCreds(row.ciphertext).api_token).toBe('token-bueno');
    const resolved = await resolveCredentialsFor(pool, row.ref);
    expect(resolved.api_token).toBe('token-bueno');
  });

  it('hides integration_secrets from the app DB role entirely', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SET LOCAL ROLE monark_app');
      await expect(c.query('SELECT * FROM integration_secrets')).rejects.toThrow(/permission denied/);
      await c.query('ROLLBACK');
    } finally {
      c.release();
    }
  });

  it('replaces the token in place (same integration, new secret)', async () => {
    const res = await call('POST', '/integrations', {
      provider: 'clover', merchantId: 'MERCH1', apiToken: 'token-bueno', locationId,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(integrationId);
    expect((await call('GET', '/integrations')).json().integrations).toHaveLength(1);
  });

  it('disconnects and deletes the stored secret', async () => {
    const res = await call('POST', `/integrations/${integrationId}/disconnect`, {});
    expect(res.statusCode).toBe(200);
    const list = (await call('GET', '/integrations')).json().integrations;
    expect(list[0].status).toBe('disconnected');
    const secrets = await pool.query(`SELECT 1 FROM integration_secrets WHERE ref LIKE 'db:%MERCH1'`);
    expect(secrets.rowCount).toBe(0);
  });

  it('bank link-token fails in Spanish while Plaid platform keys are missing', async () => {
    const saved = process.env.MONARK_VAULT;
    delete process.env.MONARK_VAULT;
    try {
      const res = await call('POST', '/bank/link-token', {});
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('conexión bancaria');
    } finally {
      if (saved !== undefined) process.env.MONARK_VAULT = saved;
    }
  });

  it('refuses a location from another organization', async () => {
    const other = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { email: `${uniq('other')}@example.com`, password: 'secreta123', orgName: 'Otra Org' },
    });
    const otherToken = other.json().token;
    const res = await app.inject({
      method: 'POST', url: '/integrations',
      payload: { provider: 'clover', merchantId: 'MERCH2', apiToken: 'token-bueno', locationId },
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('device linking', () => {
  it('issues a single-use code and redeems it for the device credentials', async () => {
    const deviceEmail = `${uniq('device')}@monark.local`;
    const devicePass = 'clave-dispositivo-123';
    const reg = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { email: deviceEmail, password: devicePass, orgName: 'Link Org' },
    });
    const tok = reg.json().token;

    const bad = await app.inject({
      method: 'POST', url: '/auth/link-code',
      payload: { email: deviceEmail, password: 'incorrecta' },
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(bad.statusCode).toBe(401);

    const gen = await app.inject({
      method: 'POST', url: '/auth/link-code',
      payload: { email: deviceEmail, password: devicePass },
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(gen.statusCode).toBe(200);
    const code = gen.json().code;
    expect(code).toHaveLength(8);

    const redeem = await app.inject({ method: 'POST', url: '/auth/link-redeem', payload: { code } });
    expect(redeem.statusCode).toBe(200);
    expect(redeem.json()).toEqual({ email: deviceEmail, password: devicePass });

    // single use
    const again = await app.inject({ method: 'POST', url: '/auth/link-redeem', payload: { code } });
    expect(again.statusCode).toBe(404);
  });
});

describe('month close', () => {
  it('locks a past month and the DB then refuses financial writes into it', async () => {
    const close = await call('POST', '/periods/close', { month: '2026-07' });
    if (close.statusCode !== 200) console.log('CLOSE ERROR:', close.body);
    expect(close.statusCode).toBe(200);
    const st = await state();
    expect(st.periods.some((p: { month: string; status: string }) => p.month.startsWith('2026-07') && p.status === 'locked')).toBe(true);

    // A financial write into the locked month must be rejected by the DB.
    const inv = await call('POST', '/invoices', {
      vendorName: 'Proveedor Julio', locationId, number: 'JUL-001',
      invoiceDate: '2026-07-10', expenseDate: '2026-07-10',
      categoryId: st.categories[0].id, subtotal: 100, tax: 0,
    });
    expect(inv.statusCode).toBeGreaterThanOrEqual(400);

    const reopen = await call('POST', '/periods/reopen', { month: '2026-07' });
    if (reopen.statusCode !== 200) console.log('REOPEN ERROR:', reopen.body);
    expect(reopen.statusCode).toBe(200);
    const inv2 = await call('POST', '/invoices', {
      vendorName: 'Proveedor Julio', locationId, number: 'JUL-001',
      invoiceDate: '2026-07-10', expenseDate: '2026-07-10',
      categoryId: st.categories[0].id, subtotal: 100, tax: 0,
    });
    if (inv2.statusCode !== 200) console.log('INV2 ERROR:', inv2.body);
    expect(inv2.statusCode).toBe(200);
  });

  it('refuses closing the current or future month', async () => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const res = await call('POST', '/periods/close', { month: ym });
    expect(res.statusCode).toBe(400);
  });
});
