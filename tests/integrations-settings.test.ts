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
