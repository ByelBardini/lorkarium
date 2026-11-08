import { describe, expect, it } from 'vitest';
import { SavedColorAdmissionBo } from '../../../src/modules/saved-colors/saved-colors.bo';

const MAX_SAVED = 24;
const rules = new SavedColorAdmissionBo(MAX_SAVED);

function keptColors(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `#0000${index.toString(16).padStart(2, '0')}`);
}

describe('SavedColorAdmissionBo.mustInsert', () => {
  it('a new color goes in when the account keeps 23', () => {
    expect(rules.mustInsert(keptColors(23), '#ffffff')).toBe(true);
  });

  it('a new color goes in on an empty list', () => {
    expect(rules.mustInsert([], '#ffffff')).toBe(true);
  });

  it('a color already kept does not go in again', () => {
    expect(rules.mustInsert(['#aabbcc', '#336699'], '#336699')).toBe(false);
  });

  it('a color already kept is not refused even at the limit', () => {
    const full = keptColors(24);

    expect(rules.mustInsert(full, full[5] as string)).toBe(false);
  });

  it('a new color at the limit is SAVED_COLORS_LIMIT citing the count and the limit', () => {
    expect(() => rules.mustInsert(keptColors(24), '#ffffff')).toThrow(
      expect.objectContaining({
        code: 'SAVED_COLORS_LIMIT',
        keptCount: 24,
        limit: 24,
        message: expect.stringMatching(/24 saved colors.*at most 24/),
      }),
    );
  });

  it('obeys the limit it receives, not a fixed one', () => {
    expect(() => new SavedColorAdmissionBo(1).mustInsert(['#aabbcc'], '#ffffff')).toThrow(
      expect.objectContaining({ code: 'SAVED_COLORS_LIMIT', keptCount: 1, limit: 1 }),
    );
  });
});
