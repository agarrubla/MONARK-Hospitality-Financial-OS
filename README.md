# MONARK Hospitality Financial OS — Backend (Phase 1)

Financial operating system for multi-location hospitality groups. This repo
implements Phase 1 of the design handoff: the PostgreSQL 16 schema, the
database-enforced financial-integrity layer, security (RLS / RBAC / audit),
and the Financial Integrity test suite wired into CI as a release blocker.

## The core invariant

**One transaction = one financial event.**

- The **invoice** is the only accrual event: `expense_date` → `expense_month`
  (generated column) drives the P&L.
- The **payment** is the only cash event: `payment_date` → `payment_month`
  drives cash flow.
- `payment_matches` is the only bridge. Bank transactions are **evidence,
  never entries** — matching one to a payment clears its direct category by
  trigger, so the same dollar can never count twice.
- Canonical example (T-000): a $5,000 August invoice paid in September is one
  August expense + one September cash outflow. **Never a second September
  expense.**

## Layout

```
db/migrations/        SQL migrations 001–020 (schema → triggers → RLS → grants → seed → views)
scripts/migrate.ts    Minimal migration runner (npm run db:migrate / db:reset)
tests/                Financial Integrity suite (Vitest, real PostgreSQL, no mocks)
api/src/server.ts     Minimal authorization API (deny-by-default, step-up MFA, session registry)
.github/workflows/    CI: migrations from zero + full suite = release blocker
```

## Running locally

Requires Node 22+ and PostgreSQL 16 (Homebrew `postgresql@16` or
`docker compose up -d db`).

```bash
npm install
createdb monark_dev   # user/password: monark/monark (or use docker-compose)
npm run db:reset      # apply all migrations from zero
npm test              # T-000 + the full 52-scenario suite (67 assertions total)
```

`DATABASE_URL` / `TEST_DATABASE_URL` override the defaults
(`postgres://monark:monark@localhost:5432/monark_dev` and `..._test`).

## What the database enforces (not the app)

- **10 duplicate guards** as unique constraints/indexes: invoice number per
  vendor (normalized — the T-406 fix), document sha256, bank `external_txn_id`
  and `dedupe_hash` (canonicalized in one shared function — the T-209 fix),
  payment `idempotency_key`, one-debit-one-payment, POS day, one-deposit-one-window.
- **Allocation invariants**: Σ matches ≤ payment amount always, = when the
  payment is processing/settled (deferred constraint trigger); Σ per invoice
  ≤ invoice total (excluding failed/voided payments); `amount_paid` /
  `payment_date` / paid statuses are trigger-maintained and rejected on
  direct writes.
- **Approval gates**: payments cannot reach processing/settled without a
  satisfied chain; >$10K requires an owner-role approval (not delegable);
  self-approval rejected at the row level; approver eligibility (role,
  membership, location) re-checked **at decision time** (F-02).
- **Period locks**: writes whose financial date falls in a locked
  `financial_periods` row are rejected; payment-state maintenance and match
  evidence are exempt (matches book nothing).
- **Void cascade** (T-106 fix): voiding an invoice cancels its dependent
  scheduled payments in the same transaction, with both audit rows.
- **Immutability**: bank transactions never change amount/date/description and
  are never deleted; corrections append reversal rows. Financial tables have
  no DELETE grant, for anyone.
- **Audit**: every change writes a hash-chained, append-only `audit_logs` row
  in the same transaction (changed fields only, sensitive fields redacted to
  name+hash — F-07). `verify_audit_chain(org)` re-walks the chain; UPDATE and
  DELETE are blocked by trigger even for the table owner.
- **Tenancy**: RLS on every tenant table keyed on `app.org_id`; location-bearing
  tables intersect the caller's location grants. The app role has no BYPASSRLS.
  The AI role (`monark_ai`) is read-only + `ai_insights` INSERT: the AI
  proposes with confidence and evidence; it structurally cannot approve, pay,
  or write financial records.

## Documented deviations / additions vs the spec

- `invoices.reversal_of_id` was added (spec §0 requires append-only reversal
  corrections; T-110 credit memos need a negative reversal invoice, so the
  `total > 0` CHECK is relaxed to `total > 0 OR (reversal row AND total < 0)`).
- `uuidv7()` is a polyfill function (PG16 has no native uuidv7; PG18 does).
- Transfer pairing (T-208) is represented as both legs `excluded`; a dedicated
  pair table can come with the reconciliation UI phase.
- T-311/T-312 (step-up MFA, session revocation) are enforced in the API layer
  (`api/src/server.ts`) — sessions and MFA don't exist inside PostgreSQL.
- T-412's structural fix (feed identity verification at connection time) is
  still gated before GA; the compensating nightly detector
  (`detect_cross_account_duplicates`) is live, as the test report requires.

## CI as release gate

`.github/workflows/ci.yml` boots a clean `postgres:16`, applies every
migration from zero, runs T-000 first and then the full suite. Any failure
blocks the release. (Push this repo to GitHub to activate it.)
