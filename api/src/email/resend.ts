/**
 * Outbound email via Resend. Credentials live in the vault under ref
 * `resend` = { api_key, from }. Sending is best-effort: a failed
 * notification never blocks the financial action it reports.
 */
import { resolveCredentials } from '../integrations/sync.js';

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  let creds: Record<string, string>;
  try {
    creds = resolveCredentials('resend');
  } catch {
    return false; // email not configured yet — silently skip
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${creds.api_key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: creds.from, to: [to], subject, html }),
    });
    if (!res.ok) console.error(`resend ${res.status}: ${await res.text()}`);
    return res.ok;
  } catch (err) {
    console.error('resend send failed:', (err as Error).message);
    return false;
  }
}
