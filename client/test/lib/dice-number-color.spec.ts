import { describe, expect, it } from 'vitest';
import { MEMBER_COLORS } from '@lorkarium/game-core';
import { contrastRatioOf, diceNumberColorOf } from '@/lib/dice-number-color';
import { memberColorCss } from '@/lib/member-color';

describe('diceNumberColorOf', () => {
  it.each(['gold', 'violet'] as const)(
    'without texture, %s gets the dark number #1a1a1a',
    (color) => {
      expect(diceNumberColorOf({ color, textureId: null, numberColor: null })).toBe('#1a1a1a');
    },
  );

  it.each(MEMBER_COLORS)('without texture, the number on %s reads at contrast ≥ 4.5', (color) => {
    const number = diceNumberColorOf({ color, textureId: null, numberColor: null });
    expect(contrastRatioOf(number, memberColorCss(color))).toBeGreaterThanOrEqual(4.5);
  });

  it('with a texture and no choice, the number is white', () => {
    expect(diceNumberColorOf({ color: 'gold', textureId: 'tex-1', numberColor: null })).toBe(
      '#ffffff',
    );
  });

  it('with a texture and a choice, the number is the choice', () => {
    expect(diceNumberColorOf({ color: 'gold', textureId: 'tex-1', numberColor: '#ff3300' })).toBe(
      '#ff3300',
    );
  });

  it('without texture a leftover choice is ignored and the contrast stays automatic', () => {
    expect(diceNumberColorOf({ color: 'gold', textureId: null, numberColor: '#ffffff' })).toBe(
      '#1a1a1a',
    );
  });
});

describe('contrastRatioOf', () => {
  it('black on white is the WCAG maximum, 21', () => {
    expect(contrastRatioOf('#000000', '#ffffff')).toBeCloseTo(21, 9);
  });

  it('the order of the colors does not matter', () => {
    expect(contrastRatioOf('#e0b25c', '#1a1a1a')).toBe(contrastRatioOf('#1a1a1a', '#e0b25c'));
  });

  it('a color that is not #rrggbb is refused with the value received', () => {
    expect(() => contrastRatioOf('#fff', '#000000')).toThrow(
      'Color "#fff" is invalid: expected #rrggbb.',
    );
  });
});
