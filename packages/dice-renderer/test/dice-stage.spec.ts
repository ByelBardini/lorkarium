import { describe, expect, it } from 'vitest';
import { DICE_OVERLAY_Z_INDEX, diceStageScaleOf, labelRightOf } from '../src/dice-stage';

describe('DICE_OVERLAY_Z_INDEX', () => {
  it('sits above the pages over the room (z-30) and below the dialogs (z-50)', () => {
    expect(DICE_OVERLAY_Z_INDEX).toBeGreaterThan(30);
    expect(DICE_OVERLAY_Z_INDEX).toBeLessThan(50);
  });
});

describe('diceStageScaleOf', () => {
  it('a 16:9 box in a 1920 × 1080 window: 1920 px over a box 28.44 units wide', () => {
    expect(diceStageScaleOf(16 / 9, { width: 1920, height: 1080 })).toBeCloseTo(67.5, 9);
  });

  it('the same box in a portrait window shrinks to fit the width', () => {
    expect(diceStageScaleOf(16 / 9, { width: 1080, height: 1920 })).toBeCloseTo(1080 / 28.4444, 2);
  });

  it('a portrait roller (aspect 0.5) in a 1000 × 1000 window fits by the height: 1000 / 32', () => {
    expect(diceStageScaleOf(0.5, { width: 1000, height: 1000 })).toBeCloseTo(31.25, 9);
  });

  it('a window with no side is refused by the box fit', () => {
    expect(() => diceStageScaleOf(1, { width: 0, height: 800 })).toThrow(RangeError);
  });
});

describe('labelRightOf', () => {
  it('up +y on a face looking +z reads to the right along +x', () => {
    expect(labelRightOf({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 })).toEqual({ x: 1, y: 0, z: 0 });
  });

  it('a face looking up (+y) with its top toward −z reads along +x, like the window seen from above', () => {
    const right = labelRightOf({ x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 });
    expect(right.x).toBeCloseTo(1, 9);
    expect(right.y).toBeCloseTo(0, 9);
    expect(right.z).toBeCloseTo(0, 9);
  });
});
