/**
 * Credential storage for user-managed integrations (the app's settings
 * screen). Tokens are encrypted with AES-256-GCM before they touch the
 * database; the key (MONARK_SECRET_KEY) lives only in the service
 * environment. The app DB role has no grants on integration_secrets, so a
 * hijacked session still cannot read ciphertext, let alone tokens.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';

function key(): Buffer {
  const raw = process.env.MONARK_SECRET_KEY;
  if (!raw) throw new Error('MONARK_SECRET_KEY is not set — cannot handle integration credentials');
  return createHash('sha256').update(raw).digest();
}

export function encryptCreds(creds: Record<string, string>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(creds), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

export function decryptCreds(ciphertext: string): Record<string, string> {
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')) as Record<string, string>;
}

export async function saveSecret(
  pool: pg.Pool,
  ref: string,
  organizationId: string,
  creds: Record<string, string>,
): Promise<void> {
  await pool.query(
    `INSERT INTO integration_secrets (ref, organization_id, ciphertext)
     VALUES ($1, $2, $3)
     ON CONFLICT (ref) DO UPDATE SET ciphertext = EXCLUDED.ciphertext
     WHERE integration_secrets.organization_id = EXCLUDED.organization_id`,
    [ref, organizationId, encryptCreds(creds)],
  );
}

export async function loadSecret(pool: pg.Pool, ref: string): Promise<Record<string, string> | null> {
  const row = (await pool.query(`SELECT ciphertext FROM integration_secrets WHERE ref = $1`, [ref])).rows[0];
  return row ? decryptCreds(row.ciphertext) : null;
}
