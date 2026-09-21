import type { Tx } from '../db/client';

/**
 * Human-readable ticket keys (docs/DATA_MODEL.md). Allocation happens inside the
 * ticket-creation transaction under a row lock, so keys are gapless and can never collide
 * even under concurrent submission.
 */
export const DEFAULT_PREFIX = 'SUP';
const PAD = 6;

export function formatKey(prefix: string, value: number): string {
  return `${prefix}-${String(value).padStart(PAD, '0')}`;
}

export function parseKey(key: string): { prefix: string; value: number } | null {
  const match = /^([A-Z][A-Z0-9]{1,9})-(\d{1,12})$/.exec(key.trim().toUpperCase());
  if (!match || !match[1] || !match[2]) return null;
  return { prefix: match[1], value: Number(match[2]) };
}

export function looksLikeKey(input: string): boolean {
  return parseKey(input) !== null;
}

/** Reserves the next key for a prefix. MUST be called inside a transaction. */
export async function reserveKey(tx: Tx, prefix = DEFAULT_PREFIX): Promise<string> {
  const normalised = prefix.trim().toUpperCase();
  const rows = await tx.$queryRaw<Array<{ nextValue: number }>>`
    INSERT INTO "TicketCounter" ("prefix", "nextValue") VALUES (${normalised}, 2)
    ON CONFLICT ("prefix") DO UPDATE SET "nextValue" = "TicketCounter"."nextValue" + 1
    RETURNING "nextValue"
  `;
  // RETURNING yields the counter's new value; the number reserved by this call is one less.
  const next = rows[0]?.nextValue ?? 2;
  return formatKey(normalised, next - 1);
}
