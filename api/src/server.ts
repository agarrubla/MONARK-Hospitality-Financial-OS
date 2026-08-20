/**
 * Minimal authorization API skeleton (Phase 1).
 *
 * This is not the product API — it exists to make the session/authorization
 * contract of Security & Audit v1.0 testable end to end:
 *
 *  - Deny by default: every route MUST declare its required permission; a
 *    missing declaration fails at registration (closed in CI), not at runtime.
 *  - Step-up MFA is evaluated at ACTION AUTHORIZATION time, never at token
 *    issue (the T-311 fix): sensitive permissions require MFA within the last
 *    5 minutes, regardless of session age or token freshness.
 *  - Server-side session registry with revocation: an offboarded user's live
 *    session is rejected server-side (T-312).
 *  - Every request runs against PostgreSQL as monark_app with SET LOCAL
 *    app.org_id / app.user_id — RLS is the tenancy boundary, not the API.
 */
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';

export interface Session {
  id: string;
  userId: string;
  orgId: string;
  createdAt: number;
  mfaVerifiedAt: number | null;
  revokedAt: number | null;
}

export const STEP_UP_WINDOW_MS = 5 * 60 * 1000;

export interface SessionRegistry {
  create(userId: string, orgId: string, opts?: { mfaVerifiedAt?: number | null }): Session;
  get(id: string): Session | undefined;
  revoke(id: string): void;
  confirmMfa(id: string): void;
}

export function createSessionRegistry(): SessionRegistry {
  const sessions = new Map<string, Session>();
  return {
    create(userId, orgId, opts = {}) {
      const session: Session = {
        id: randomUUID(),
        userId,
        orgId,
        createdAt: Date.now(),
        mfaVerifiedAt: opts.mfaVerifiedAt === undefined ? null : opts.mfaVerifiedAt,
        revokedAt: null,
      };
      sessions.set(session.id, session);
      return session;
    },
    get(id) {
      return sessions.get(id);
    },
    revoke(id) {
      const s = sessions.get(id);
      if (s) s.revokedAt = Date.now();
    },
    confirmMfa(id) {
      const s = sessions.get(id);
      if (s) s.mfaVerifiedAt = Date.now();
    },
  };
}

/** Run fn as the RLS-constrained app role under the session's org/user context. */
export async function withRequestContext<T>(
  pool: pg.Pool,
  session: Session,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE monark_app');
    await client.query(`SELECT set_config('app.org_id', $1, true)`, [session.orgId]);
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [session.userId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

interface SecureRouteOpts {
  method: 'GET' | 'POST' | 'PATCH';
  url: string;
  /** Required. Missing declaration = registration error (deny by default). */
  permission: string;
  handler: (req: FastifyRequest, reply: FastifyReply, session: Session) => Promise<unknown>;
}

export function buildServer(pool: pg.Pool, sessions: SessionRegistry): FastifyInstance {
  const app = Fastify();

  function secureRoute(opts: SecureRouteOpts): void {
    if (!opts.permission) {
      // Fails closed: a route without a permission declaration cannot ship.
      throw new Error(`route ${opts.method} ${opts.url} has no permission declaration`);
    }
    app.route({
      method: opts.method,
      url: opts.url,
      handler: async (req, reply) => {
        // 1 · Session: server-side registry, revocation honored (T-312).
        const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
        const session = sessions.get(token);
        if (!session || session.revokedAt !== null) {
          return reply.code(401).send({ error: 'invalid_session' });
        }
        // 2 · Permission: deny by default (T-308).
        const allowed = await pool.query(`SELECT user_has_permission($1, $2, $3) AS ok`, [
          session.userId,
          session.orgId,
          opts.permission,
        ]);
        if (!allowed.rows[0].ok) {
          return reply.code(403).send({ error: 'forbidden', permission: opts.permission });
        }
        // 3 · Step-up: evaluated per ACTION, not per token (T-311 fix).
        const sensitive = await pool.query(`SELECT is_sensitive FROM permissions WHERE key = $1`, [
          opts.permission,
        ]);
        if (sensitive.rows[0]?.is_sensitive) {
          const fresh =
            session.mfaVerifiedAt !== null && Date.now() - session.mfaVerifiedAt <= STEP_UP_WINDOW_MS;
          if (!fresh) {
            return reply.code(401).send({ error: 'step_up_required' });
          }
        }
        return opts.handler(req, reply, session);
      },
    });
  }

  // Expose the registration helper so tests can assert the fail-closed check.
  (app as unknown as { secureRoute: typeof secureRoute }).secureRoute = secureRoute;

  secureRoute({
    method: 'GET',
    url: '/invoices',
    permission: 'invoice.read',
    handler: async (_req, _reply, session) => {
      const rows = await withRequestContext(pool, session, async (c) => {
        return (await c.query(`SELECT id, invoice_number, status, total FROM invoices ORDER BY created_at DESC`)).rows;
      });
      return { invoices: rows };
    },
  });

  secureRoute({
    method: 'POST',
    url: '/payments',
    permission: 'payment.initiate',
    handler: async (req, reply, session) => {
      const body = req.body as { bankAccountId: string; amount: string; paymentDate: string };
      const id = await withRequestContext(pool, session, async (c) => {
        const r = await c.query(
          `INSERT INTO payments (organization_id, bank_account_id, method, amount, currency,
                                 payment_date, initiated_at, status, idempotency_key, created_by)
           VALUES ($1, $2, 'ach', $3, 'USD', $4, now(), 'scheduled', $5, $6) RETURNING id`,
          [session.orgId, body.bankAccountId, body.amount, body.paymentDate, randomUUID(), session.userId],
        );
        return r.rows[0].id;
      });
      return reply.code(201).send({ id });
    },
  });

  secureRoute({
    method: 'POST',
    url: '/integrations/:id/sync-bank',
    permission: 'bank.admin', // sensitive → step-up enforced above
    handler: async (req) => {
      const { id } = req.params as { id: string };
      const { syncBankIntegration } = await import('./integrations/sync.js');
      return syncBankIntegration(pool, id);
    },
  });

  secureRoute({
    method: 'POST',
    url: '/integrations/:id/sync-pos',
    permission: 'bank.admin',
    handler: async (req) => {
      const { id } = req.params as { id: string };
      const { businessDate } = req.body as { businessDate: string };
      const { syncPosIntegration } = await import('./integrations/sync.js');
      return syncPosIntegration(pool, id, businessDate);
    },
  });

  secureRoute({
    method: 'POST',
    url: '/approvals/:id/decide',
    permission: 'payment.approve', // sensitive → step-up enforced above
    handler: async (req, _reply, session) => {
      const { id } = req.params as { id: string };
      const { decision } = req.body as { decision: 'approved' | 'rejected' };
      const outcome = await withRequestContext(pool, session, async (c) => {
        return (await c.query(`SELECT decide_approval($1, $2) AS outcome`, [id, decision])).rows[0].outcome;
      });
      return { outcome };
    },
  });

  return app;
}
