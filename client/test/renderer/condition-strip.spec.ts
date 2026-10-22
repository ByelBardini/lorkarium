import { describe, expect, it } from 'vitest';
import { conditionStripOf } from '@/renderer/condition-strip';
import type { ConditionMarkView } from '@/renderer/token-view';

const POISON: ConditionMarkView = { icon: 'flask-conical', tone: 'harm', remainingRounds: 2 };

function marks(count: number, mark: ConditionMarkView = POISON): ConditionMarkView[] {
  return Array.from({ length: count }, () => mark);
}

// A 1×1 token is 64 world px; its icon is 13 px (the badge of before, 2 × 6.5).
const ONE_CELL = { width: 64, height: 64 };
const THREE_CELLS = { width: 192, height: 192 };

describe('conditionStripOf', () => {
  it('a 1×1 token with 3 conditions at zoom 1 hangs 3 icons of 13 px just under its cell', () => {
    const strip = conditionStripOf({ ...ONE_CELL, conditions: marks(3), zoom: 1 });
    expect(strip).toMatchObject({ band: 'icons', top: 66, height: 13, iconSize: 13, more: null });
    expect(strip.band === 'icons' && strip.icons).toHaveLength(3);
  });

  it('the icons sit centered under the token, 3 px apart', () => {
    const strip = conditionStripOf({ ...ONE_CELL, conditions: marks(3), zoom: 1 });
    // 3 × 13 + 2 × 3 = 45 wide, from 9.5 to 54.5.
    expect(strip.band === 'icons' && strip.icons.map(({ x }) => x)).toEqual([16, 32, 48]);
  });

  it('a 1×1 token fits 5 icons', () => {
    const strip = conditionStripOf({ ...ONE_CELL, conditions: marks(5), zoom: 1 });
    expect(strip.band === 'icons' && [strip.icons.length, strip.more]).toEqual([5, null]);
  });

  it('a 1×1 token with 7 shows 4 icons and "+3" in the fifth place', () => {
    const strip = conditionStripOf({ ...ONE_CELL, conditions: marks(7), zoom: 1 });
    expect(strip.band === 'icons' && strip.icons).toHaveLength(4);
    expect(strip.band === 'icons' && strip.more).toEqual({ count: 3, x: 64 });
  });

  it('a 3×3 token fits all 7 (its icons are 26 px, already with their rounds at zoom 1)', () => {
    const strip = conditionStripOf({ ...THREE_CELLS, conditions: marks(7), zoom: 1 });
    expect(strip.band === 'detailed' && [strip.icons.length, strip.more]).toEqual([7, null]);
  });

  it('at zoom 0.5 (an icon of 6.5 px on screen) the strip turns into up to 4 dots in order, each in its tone', () => {
    const conditions: ConditionMarkView[] = [
      { icon: 'lock', tone: 'incapacitating', remainingRounds: 1 },
      { icon: 'skull', tone: 'harm', remainingRounds: null },
      { icon: 'zap', tone: 'harm', remainingRounds: 3 },
      { icon: 'sparkles', tone: 'benefit', remainingRounds: null },
      { icon: 'sun', tone: 'benefit', remainingRounds: null },
    ];
    const strip = conditionStripOf({ ...ONE_CELL, conditions, zoom: 0.5 });
    expect(strip.band).toBe('dots');
    expect(strip.band === 'dots' && strip.dots.map(({ tone }) => tone)).toEqual([
      'incapacitating',
      'harm',
      'harm',
      'benefit',
    ]);
  });

  it('the dots keep their size on screen: their height in the world grows as the zoom falls', () => {
    const strip = conditionStripOf({ ...ONE_CELL, conditions: marks(2), zoom: 0.25 });
    expect(strip).toMatchObject({ band: 'dots', top: 66, height: 24 });
  });

  it('at zoom 2 (26 px on screen) each icon carries its rounds, and one without limit none', () => {
    const endless: ConditionMarkView = { icon: 'sun', tone: 'benefit', remainingRounds: null };
    const strip = conditionStripOf({ ...ONE_CELL, conditions: [POISON, endless], zoom: 2 });
    expect(strip.band).toBe('detailed');
    expect(strip.band === 'detailed' && strip.icons.map(({ rounds }) => rounds)).toEqual([2, null]);
  });

  it('with plain icons the rounds are not written', () => {
    const strip = conditionStripOf({ ...ONE_CELL, conditions: [POISON], zoom: 1 });
    expect(strip.band === 'icons' && strip.icons[0]?.rounds).toBeNull();
  });

  it.each([1, 2])('a condition on its last round is marked as ending at zoom %s', (zoom) => {
    const last: ConditionMarkView = { ...POISON, remainingRounds: 1 };
    const strip = conditionStripOf({ ...ONE_CELL, conditions: [last, POISON], zoom });
    const icons = strip.band === 'icons' || strip.band === 'detailed' ? strip.icons : [];
    expect(icons.map(({ ending }) => ending)).toEqual([true, false]);
  });

  it('no condition is no strip, with no height (the name stays where it was)', () => {
    expect(conditionStripOf({ ...ONE_CELL, conditions: [], zoom: 1 })).toEqual({
      band: 'none',
      height: 0,
    });
  });

  it.each([
    [{ width: 0, height: 64, zoom: 1 }, 'width 0'],
    [{ width: 64, height: 64, zoom: -1 }, 'zoom -1'],
  ])('a size or zoom not above zero is refused, naming it', (size, named) => {
    expect(() => conditionStripOf({ ...size, conditions: marks(1) })).toThrow(RangeError);
    expect(() => conditionStripOf({ ...size, conditions: marks(1) })).toThrow(named);
  });
});
