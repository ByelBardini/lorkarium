import { describe, expect, it } from 'vitest';
import { awayLabelOf } from '@/lib/away-label';

const SERVER_AT = '2026-10-22T12:04:00.000Z';
const MINUTE = 60_000;

describe('awayLabelOf', () => {
  it('away 4 minutes before the server time reads "ausente há 4 min"', () => {
    expect(awayLabelOf('2026-10-22T12:00:00.000Z', SERVER_AT, 0)).toBe('ausente há 4 min');
  });

  it('less than a minute reads "ausente agora"', () => {
    expect(awayLabelOf('2026-10-22T12:03:30.000Z', SERVER_AT, 0)).toBe('ausente agora');
  });

  it('60 minutes read "ausente há 1 h"', () => {
    expect(awayLabelOf('2026-10-22T11:04:00.000Z', SERVER_AT, 0)).toBe('ausente há 1 h');
  });

  it('the time passed in the browser since the server time adds to the count', () => {
    expect(awayLabelOf('2026-10-22T12:00:00.000Z', SERVER_AT, 3 * MINUTE)).toBe('ausente há 7 min');
  });

  it('an awaySince after the server time (clocks apart) reads "ausente agora", never negative', () => {
    expect(awayLabelOf('2026-10-22T12:10:00.000Z', SERVER_AT, 0)).toBe('ausente agora');
  });
});
