import { describe, expect, it } from 'vitest';
import { presenceOf } from '@/lib/member-presence';

describe('presenceOf', () => {
  it('a member online is online', () => {
    expect(presenceOf({ online: true, awaySince: null })).toBe('online');
  });

  it('a member offline is offline', () => {
    expect(presenceOf({ online: false, awaySince: null })).toBe('offline');
  });

  it('a member online with awaySince is away', () => {
    expect(presenceOf({ online: true, awaySince: '2026-10-22T12:00:00.000Z' })).toBe('away');
  });
});
