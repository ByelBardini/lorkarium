import { describe, expect, it } from 'vitest';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { tokenCenterOf, tokenContains, tokenWorldRect } from '@/renderer/token-box';

const C = CELL_WORLD_SIZE;
const HORSE = { col: 1, row: 2, width: 2, height: 1 };

describe('token box in world px', () => {
  it('a 2×1 token at (1, 2) covers two cells across and one down', () => {
    expect(tokenWorldRect(HORSE)).toEqual({ x: C, y: 2 * C, width: 2 * C, height: C });
  });

  it('its center is the middle of each side on its own', () => {
    expect(tokenCenterOf(HORSE)).toEqual({ x: 2 * C, y: 2.5 * C });
  });

  it('a point in its second cell is inside, and the far edge belongs to the next token', () => {
    expect(tokenContains(HORSE, { x: 2.5 * C, y: 2.5 * C })).toBe(true);
    expect(tokenContains(HORSE, { x: 3 * C, y: 2.5 * C })).toBe(false);
    expect(tokenContains(HORSE, { x: 2 * C, y: 3 * C })).toBe(false);
  });

  it('a half-cell token at (1.5, 0) covers only that half cell', () => {
    const rat = { col: 1.5, row: 0, width: 0.5, height: 0.5 };
    expect(tokenContains(rat, { x: 1.75 * C, y: 0.25 * C })).toBe(true);
    expect(tokenContains(rat, { x: 1.25 * C, y: 0.25 * C })).toBe(false);
  });
});
