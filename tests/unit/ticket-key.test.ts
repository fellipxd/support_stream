import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFIX, formatKey, looksLikeKey, parseKey } from '@/server/tickets/keys';

/** docs/DATA_MODEL.md — keys are human-readable, padded, immutable and searchable. */
describe('ticket keys', () => {
  it('pads to six digits', () => {
    expect(formatKey('SUP', 1)).toBe('SUP-000001');
    expect(formatKey('SUP', 251)).toBe('SUP-000251');
    expect(formatKey('PAY', 231)).toBe('PAY-000231');
  });

  it('does not truncate once past a million', () => {
    expect(formatKey('SUP', 1_234_567)).toBe('SUP-1234567');
  });

  it('round-trips through the parser', () => {
    const key = formatKey('SCH', 124);
    expect(parseKey(key)).toEqual({ prefix: 'SCH', value: 124 });
  });

  it('accepts lower-case input and normalises it', () => {
    expect(parseKey('sup-000042')).toEqual({ prefix: 'SUP', value: 42 });
  });

  it('rejects things that are not keys', () => {
    for (const input of [
      '',
      'SUP',
      'SUP-',
      '-000001',
      'S-1',
      'SUP_000001',
      'DROP TABLE',
      '../etc/passwd',
    ]) {
      expect(parseKey(input), input).toBeNull();
      expect(looksLikeKey(input), input).toBe(false);
    }
  });

  it('defaults to the SUP prefix', () => {
    expect(DEFAULT_PREFIX).toBe('SUP');
  });

  it('sorts lexicographically in creation order within a prefix', () => {
    const keys = [3, 1, 20, 2].map((n) => formatKey('SUP', n)).sort();
    expect(keys).toEqual(['SUP-000001', 'SUP-000002', 'SUP-000003', 'SUP-000020']);
  });
});
