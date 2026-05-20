import { describe, expect, it } from 'vitest';
import { toLocalInput, toISO } from './dates';

describe('dates helpers', () => {
  it('roundtrips local -> ISO -> local (timezone-independent)', () => {
    const local = '2026-05-20T10:30';
    expect(toLocalInput(toISO(local))).toBe(local);
  });

  it('toISO produces a UTC ISO string ending in Z', () => {
    expect(toISO('2026-05-20T10:30')).toMatch(/Z$/);
  });

  it('toLocalInput formats to YYYY-MM-DDTHH:mm (16 chars, no seconds)', () => {
    const out = toLocalInput(toISO('2026-01-05T09:05'));
    expect(out).toBe('2026-01-05T09:05');
    expect(out).toHaveLength(16);
  });
});
