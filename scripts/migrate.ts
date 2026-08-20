/**
 * Minimal SQL migration runner.
 *
 * Applies db/migrations/*.sql in lexical order inside one transaction each,
 * recording applied files in schema_migrations. `--reset` drops the public
 * schema (and app roles' grants with it) and re-applies everything from zero —
 * the same path CI uses, so a fresh database is always reproducible.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://monark:monark@localhost:5432/monark_dev';

/** SSL for managed hosts; plain for localhost/internal networking. */
export function pgConfig(url: string = DATABASE_URL): pg.ClientConfig {
  const local = url.includes('localhost') || url.includes('127.0.0.1') || url.includes('.internal');
  return { connectionString: url, ssl: local ? undefined : { rejectUnauthorized: false } };
}

export async function runMigrations({ reset = false } = {}): Promise<void> {
  const client = new pg.Client(pgConfig());
  await client.connect();
  try {
    if (reset) {
      await client.query('DROP SCHEMA IF EXISTS public CASCADE');
      await client.query('CREATE SCHEMA public');
      await client.query('GRANT ALL ON SCHEMA public TO CURRENT_USER');
      await client.query('GRANT USAGE ON SCHEMA public TO PUBLIC');
      console.log('schema reset');
    }
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const applied = new Set(
      (await client.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename),
    );
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`FAILED ${file}`);
        throw err;
      }
    }
    console.log('migrations up to date');
  } finally {
    await client.end();
  }
}

// Run directly (npm run db:migrate / db:reset); importable for boot-time use.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMigrations({ reset: process.argv.includes('--reset') }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
