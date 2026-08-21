/**
 * AI invoice reading — the AI ONLY PROPOSES. It extracts fields from a photo
 * or PDF of a supplier invoice with visible confidence; the human reviews and
 * approves. Nothing here writes to the ledger. Fields the AI cannot clearly
 * read come back null — inventing financial data is forbidden.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { resolveCredentials } from '../integrations/sync.js';

const InvoiceExtraction = z.object({
  legible: z.boolean().describe('false if the document is not a supplier invoice or is unreadable'),
  vendor_name: z.string().nullable(),
  invoice_number: z.string().nullable(),
  invoice_date: z.string().nullable().describe('YYYY-MM-DD'),
  due_date: z.string().nullable().describe('YYYY-MM-DD'),
  subtotal: z.number().nullable().describe('pre-tax amount'),
  tax: z.number().nullable(),
  total: z.number().nullable(),
  description: z.string().nullable().describe('one short line summarizing what was purchased'),
  category_name: z.string().nullable().describe('EXACTLY one name from the provided category list, or null'),
  confidence: z.number().describe('0 to 1: overall confidence in the extracted fields'),
  notes: z.string().nullable().describe('anything the reviewer should double-check'),
});

export type InvoiceProposal = z.infer<typeof InvoiceExtraction>;

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function extractInvoice(
  fileBase64: string,
  mimeType: string,
  categories: string[],
): Promise<InvoiceProposal> {
  const creds = resolveCredentials('anthropic');
  const client = new Anthropic({ apiKey: creds.api_key });

  const prompt =
    `Extract the data from this supplier invoice for a restaurant's accounts payable.\n` +
    `Rules:\n` +
    `- NEVER guess or invent: any field you cannot clearly read must be null.\n` +
    `- Amounts are plain numbers in the invoice's currency (no symbols).\n` +
    `- subtotal excludes tax; total = subtotal + tax when both are visible.\n` +
    `- category_name must be EXACTLY one of: ${categories.join(' | ')} — or null if unclear.\n` +
    `- If the document is not an invoice (menu, flyer, unreadable photo), set legible=false.\n` +
    `- confidence reflects the WHOLE extraction; lower it if anything is blurry or ambiguous.`;

  const media = mimeType === 'application/pdf'
    ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } } as const)
    : ({ type: 'image', source: { type: 'base64', media_type: mimeType as 'image/jpeg', data: fileBase64 } } as const);

  if (mimeType !== 'application/pdf' && !IMAGE_TYPES.has(mimeType)) {
    throw new Error(`formato no soportado: ${mimeType}`);
  }

  const response = await client.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 4096,
    output_config: { format: zodOutputFormat(InvoiceExtraction), effort: 'medium' },
    messages: [{ role: 'user', content: [media, { type: 'text', text: prompt }] }],
  });

  if (!response.parsed_output) throw new Error('la IA no devolvió una extracción válida');
  return response.parsed_output;
}
