/**
 * Production entrypoint: apply pending migrations, then serve the API.
 * DATABASE_URL and PORT come from the host (Railway).
 */
import pg from 'pg';
import { pgConfig, runMigrations } from '../../scripts/migrate.js';
import { buildServer, createSessionRegistry } from './server.js';

async function main() {
  await runMigrations();

  const pool = new pg.Pool({ ...pgConfig(), max: 10 });
  const app = buildServer(pool, createSessionRegistry());

  // Unauthenticated liveness probe (no data, no permissions involved).
  app.get('/health', async () => {
    await pool.query('SELECT 1');
    return { ok: true, service: 'monark-api' };
  });

  // Human-friendly root: this host is an API, not a website.
  app.get('/', async () => ({
    service: 'MONARK Hospitality Financial OS · API',
    status: 'ok',
    note: 'Este servidor es para la app de MONARK, no para navegar. Estado en /health. Todos los datos requieren autenticación.',
  }));

  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`monark-api listening on :${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
