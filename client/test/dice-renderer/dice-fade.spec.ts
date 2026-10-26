import { describe, expect, it } from 'vitest';
import { DICE_FADE_MS, DICE_REST_HOLD_MS, diceOpacityAt } from '@/dice-renderer/dice-fade';

const SETTLE_MS = 2400;

describe('diceOpacityAt', () => {
  it('the hold and the fade are the plan defaults: 3 s still, gone in 0.6 s', () => {
    expect([DICE_REST_HOLD_MS, DICE_FADE_MS]).toEqual([3000, 600]);
  });

  it.each([0, SETTLE_MS, SETTLE_MS + 3000])('at %i ms the throw is fully opaque', (tMs) => {
    expect(diceOpacityAt(SETTLE_MS, tMs)).toBe(1);
  });

  it('halfway through the fade (settle + 3300) the opacity is 0.5', () => {
    expect(diceOpacityAt(SETTLE_MS, SETTLE_MS + 3300)).toBeCloseTo(0.5, 9);
  });

  it('at settle + 3600 the throw has left the scene (null)', () => {
    expect(diceOpacityAt(SETTLE_MS, SETTLE_MS + 3600)).toBeNull();
  });

  it('a die that never moved (settle 0) fades at 3000 ms like any other', () => {
    expect(diceOpacityAt(0, 3150)).toBeCloseTo(0.75, 9);
  });

  it('a negative settle is refused with the value received', () => {
    expect(() => diceOpacityAt(-1, 0)).toThrow(/Dice settle -1 ms is invalid/);
  });
});
