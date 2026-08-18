/**
 * §4 (API layer) · T-308 (HTTP deny-by-default), T-311 (step-up MFA at action
 * time), T-312 (revoked session rejected server-side) + the fail-closed
 * permission-declaration check.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer, createSessionRegistry, STEP_UP_WINDOW_MS } from '../api/src/server.js';
import { createInvoice, createOrg, createPayment, pool } from './helpers.js';

let app: FastifyInstance;
const sessions = createSessionRegistry();

beforeAll(async () => {
  app = buildServer(pool, sessions);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('authorization API', () => {
  it('rejects routes registered without a permission declaration (fails closed)', () => {
    const secureRoute = (app as unknown as { secureRoute: (o: object) => void }).secureRoute;
    expect(() =>
      secureRoute({ method: 'GET', url: '/oops', permission: '', handler: async () => ({}) }),
    ).toThrow(/no permission declaration/);
  });

  it('T-308 · viewer calling payment.initiate gets 403, deny-by-default', async () => {
    const f = await createOrg();
    const viewer = sessions.create(f.users.viewer, f.org);
    const res = await app.inject({
      method: 'POST',
      url: '/payments',
      headers: { authorization: `Bearer ${viewer.id}` },
      payload: { bankAccountId: f.account, amount: '100.00', paymentDate: '2026-09-01' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().permission).toBe('payment.initiate');
    // The same viewer can read (has invoice.read): the deny is per-permission.
    const read = await app.inject({
      method: 'GET',
      url: '/invoices',
      headers: { authorization: `Bearer ${viewer.id}` },
    });
    expect(read.statusCode).toBe(200);
  });

  it('T-311 · sensitive action without fresh step-up MFA forces the challenge', async () => {
    const f = await createOrg();
    const invoice = await createInvoice({ fixture: f, invoiceDate: '2026-08-10', subtotal: 700 });
    const payment = await createPayment({
      fixture: f, amount: 700, date: '2026-09-01',
      approvers: [], allocations: [{ invoice, amount: 700 }], settle: false,
    });
    // A pending step for the CFO to decide via the API.
    const approvalId = (
      await pool.query(
        `INSERT INTO approvals (organization_id, subject_type, subject_id, step, approver_id, policy_snapshot)
         VALUES ($1, 'payment', $2, 1, $3, '{}'::jsonb) RETURNING id`,
        [f.org, payment, f.users.cfo],
      )
    ).rows[0].id;

    // The mobile quick-unlock bug: token is fresh, but MFA happened long ago.
    // Step-up is evaluated at action authorization, so the age of the TOKEN
    // is irrelevant — the stale MFA forces a challenge.
    const staleMfa = sessions.create(f.users.cfo, f.org, {
      mfaVerifiedAt: Date.now() - STEP_UP_WINDOW_MS - 1000,
    });
    const challenged = await app.inject({
      method: 'POST',
      url: `/approvals/${approvalId}/decide`,
      headers: { authorization: `Bearer ${staleMfa.id}` },
      payload: { decision: 'approved' },
    });
    expect(challenged.statusCode).toBe(401);
    expect(challenged.json().error).toBe('step_up_required');
    // The decision did NOT happen.
    expect(
      (await pool.query(`SELECT decision FROM approvals WHERE id = $1`, [approvalId])).rows[0].decision,
    ).toBe('pending');

    // After completing step-up, the same session may act.
    sessions.confirmMfa(staleMfa.id);
    const approved = await app.inject({
      method: 'POST',
      url: `/approvals/${approvalId}/decide`,
      headers: { authorization: `Bearer ${staleMfa.id}` },
      payload: { decision: 'approved' },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().outcome).toBe('approved');
  });

  it('T-312 · an offboarded user\'s live session is rejected server-side', async () => {
    const f = await createOrg();
    const clerk = sessions.create(f.users.clerk, f.org, { mfaVerifiedAt: Date.now() });
    // The session works…
    const ok = await app.inject({
      method: 'POST',
      url: '/payments',
      headers: { authorization: `Bearer ${clerk.id}` },
      payload: { bankAccountId: f.account, amount: '50.00', paymentDate: '2026-09-01' },
    });
    expect(ok.statusCode).toBe(201);
    // …until offboarding force-revokes it in the server-side registry.
    sessions.revoke(clerk.id);
    const rejected = await app.inject({
      method: 'POST',
      url: '/payments',
      headers: { authorization: `Bearer ${clerk.id}` },
      payload: { bankAccountId: f.account, amount: '50.00', paymentDate: '2026-09-01' },
    });
    expect(rejected.statusCode).toBe(401);
    expect(rejected.json().error).toBe('invalid_session');
  });
});
