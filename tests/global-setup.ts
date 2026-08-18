import { execSync } from 'node:child_process';
import pg from 'pg';

const ADMIN_URL = process.env.ADMIN_DATABASE_URL ?? 'postgres://monark:monark@localhost:5432/monark_dev';
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://monark:monark@localhost:5432/monark_test';

export default async function setup() {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', ['monark_test']);
  if (exists.rowCount === 0) {
    await admin.query('CREATE DATABASE monark_test');
  }
  await admin.end();
  execSync('npx tsx scripts/migrate.ts --reset', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
