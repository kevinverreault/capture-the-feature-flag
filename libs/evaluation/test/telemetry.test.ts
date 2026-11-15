import { describe, expect, it } from 'vitest';
import { minuteOf, minuteStartMs, seenContextKey } from '../src/index.js';

describe('telemetry helpers', () => {
  it('gives the start of the minute a moment falls in', () => {
    expect(minuteOf(new Date('2026-11-15T12:34:56.789Z'))).toBe('2026-11-15T12:34:00.000Z');
    expect(minuteOf(Date.parse('2026-11-15T12:34:00.000Z'))).toBe('2026-11-15T12:34:00.000Z');
    expect(minuteStartMs(Date.parse('2026-11-15T12:34:59.999Z'))).toBe(Date.parse('2026-11-15T12:34:00.000Z'));
    expect(minuteStartMs(-1)).toBe(-60_000);
  });

  it('identifies a seen context by its attributes, and gives none to a context without any', () => {
    expect(seenContextKey({ user_id: 'alice', country: 'CA' })).toBe(
      seenContextKey({ country: 'CA', user_id: 'alice' }),
    );
    expect(seenContextKey({ user_id: 'alice' })).not.toBe(seenContextKey({ user_id: 'alice', country: 'CA' }));
    expect(seenContextKey({ country: 'CA' })).not.toBe(seenContextKey({ user_id: 'CA' }));
    expect(seenContextKey({})).toBeNull();
  });
});
