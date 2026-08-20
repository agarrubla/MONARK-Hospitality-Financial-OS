/**
 * Product API — the full user journey the mobile app drives:
 * register → login → first location → invoice → approve → pay → state.
 * Runs against the real schema; the invariant must hold end to end.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildProductApp } from '../api/src/app.js';
import { pool, uniq } from './helpers.js';

let app: FastifyInstance;
let token = '';
let locationId = '';
let categoryId = '';
let invoiceId = '';
const email = `${uniq('owner')}@example.com`;

beforeAll(async () => {
  app = buildProductApp(pool);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const call = (method: 'GET' | 'POST', url: string, payload?: object) =>
  app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });

describe('product API journey', () => {
  it('registers an organization and issues a session', async () => {
    const res = await call('POST', '/auth/register', { email, password: 'secreta123', orgName: 'La Cabaña' });
    expect(res.statusCode).toBe(200);
    token = res.json().token;
    expect(token).toHaveLength(64);
  });

  it('logs in with the same credentials (uniform error for bad ones)', async () => {
    const bad = await call('POST', '/auth/login', { email, password: 'incorrecta' });
    expect(bad.statusCode).toBe(401);
    const ok = await call('POST', '/auth/login', { email, password: 'secreta123' });
    expect(ok.statusCode).toBe(200);
    token = ok.json().token;
  });

  it('starts empty and creates the first location', async () => {
    let state = (await call('GET', '/state')).json();
    expect(state.locations).toHaveLength(0);
    expect(state.invoices).toHaveLength(0);
    expect(state.categories.length).toBeGreaterThan(5);
    const loc = await call('POST', '/locations', { name: 'La Cabaña Centro', code: 'centro' });
    expect(loc.statusCode).toBe(200);
    state = (await call('GET', '/state')).json();
    expect(state.locations).toHaveLength(1);
    expect(state.locations[0].code).toBe('CENTRO');
    locationId = state.locations[0].id;
    categoryId = state.categories[0].id;
  });

  it('creates an invoice (new vendor inline) and blocks duplicates', async () => {
    const res = await call('POST', '/invoices', {
      vendorName: 'Carnes del Valle', locationId, number: 'F-001',
      invoiceDate: '2026-08-10', expenseDate: '2026-08-10',
      categoryId, description: 'Pedido semanal', subtotal: 500, tax: 40,
    });
    expect(res.statusCode).toBe(200);
    invoiceId = res.json().id;

    const state = (await call('GET', '/state')).json();
    const dup = await call('POST', '/invoices', {
      vendorId: state.vendors[0].id, locationId, number: 'f-001 ',
      invoiceDate: '2026-08-10', expenseDate: '2026-08-10',
      categoryId, subtotal: 500, tax: 40,
    });
    expect(dup.statusCode).toBe(409); // normalized duplicate guard

    expect(state.invoices).toHaveLength(1);
    expect(state.invoices[0].status).toBe('pending_approval');
  });

  it('approves and pays in a later month — expense stays in AUG, cash lands in SEP', async () => {
    await call('POST', `/invoices/${invoiceId}/decision`, { action: 'approve' });
    const paid = await call('POST', `/invoices/${invoiceId}/pay`, { date: '2026-09-05', method: 'ach', ref: 'transf-1' });
    expect(paid.statusCode).toBe(200);

    const state = (await call('GET', '/state')).json();
    const inv = state.invoices[0];
    expect(inv.status).toBe('paid');
    expect(inv.paymentDate).toBe('2026-09-05');
    expect(state.payments).toHaveLength(1);
    expect(state.payments[0].amount).toBe(540);

    // DB truth: one AUG expense, one SEP cash event, never a SEP expense.
    const org = (await pool.query(`SELECT organization_id FROM invoices WHERE id = $1`, [invoiceId])).rows[0].organization_id;
    const pl = await pool.query(
      `SELECT expense_month::text AS m, sum(expense_amount)::float8 AS v FROM v_pl_by_month WHERE organization_id = $1 GROUP BY 1`,
      [org],
    );
    expect(pl.rows).toEqual([{ m: '2026-08-01', v: 500 }]); // line subtotal in AUG only
    const cash = await pool.query(
      `SELECT cash_month::text AS m, sum(amount)::float8 AS v FROM v_cash_flow_by_month WHERE organization_id = $1 AND direction = 'out' GROUP BY 1`,
      [org],
    );
    expect(cash.rows).toEqual([{ m: '2026-09-01', v: 540 }]);
  });

  it('records a POS day once (duplicate day rejected in Spanish)', async () => {
    const res = await call('POST', '/pos-days', { locationId, date: '2026-08-16', gross: 1200, discounts: 50, tax: 96, tips: 80 });
    expect(res.statusCode).toBe(200);
    const dup = await call('POST', '/pos-days', { locationId, date: '2026-08-16', gross: 999, discounts: 0, tax: 0, tips: 0 });
    expect(dup.statusCode).toBe(409);
    const state = (await call('GET', '/state')).json();
    expect(state.posDays).toHaveLength(1);
    expect(state.posDays[0].gross).toBe(1200);
  });

  it('another organization sees none of it (RLS)', async () => {
    const other = await call('POST', '/auth/register', {
      email: `${uniq('other')}@example.com`, password: 'secreta123', orgName: 'Otro Negocio',
    });
    const otherToken = other.json().token;
    const state = (
      await app.inject({ method: 'GET', url: '/state', headers: { authorization: `Bearer ${otherToken}` } })
    ).json();
    expect(state.invoices).toHaveLength(0);
    expect(state.locations).toHaveLength(0);
    expect(state.posDays).toHaveLength(0);
  });
});
