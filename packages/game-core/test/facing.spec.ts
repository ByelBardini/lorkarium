import { describe, expect, it } from 'vitest';
import { facingToward, facingVector, normalizeFacing, snapFacing, turnFacing } from '../src/facing';

const ORIGIN = { x: 0, y: 0 };

describe('facingToward', () => {
  it.each([
    ['below', 0, { x: 0, y: 5 }],
    ['to the left', 90, { x: -3, y: 0 }],
    ['above', 180, { x: 0, y: -2 }],
    ['to the right', 270, { x: 4, y: 0 }],
    ['down and to the left', 45, { x: -1, y: 1 }],
  ])('a point %s gives %s', (_where, expected, target) => {
    expect(facingToward(ORIGIN, target)).toBe(expected);
  });

  it('the same point has no direction, so it gives null', () => {
    expect(facingToward({ x: 2, y: 3 }, { x: 2, y: 3 })).toBeNull();
  });
});

describe('facingVector', () => {
  it('0 points down the screen', () => {
    const vector = facingVector(0);
    expect(vector.x).toBeCloseTo(0);
    expect(vector.y).toBeCloseTo(1);
  });

  it('90 points left, clockwise on screen', () => {
    const vector = facingVector(90);
    expect(vector.x).toBeCloseTo(-1);
    expect(vector.y).toBeCloseTo(0);
  });
});

describe('turnFacing', () => {
  it('turning 45 back from 0 wraps to 315', () => {
    expect(turnFacing(0, -45)).toBe(315);
  });

  it('turning 90 from 315 passes through 0 to 45', () => {
    expect(turnFacing(315, 90)).toBe(45);
  });
});

describe('snapFacing', () => {
  it.each([
    [22, 0],
    [23, 45],
    [350, 0],
    [100, 90],
  ])('%s snaps to %s with a 45° step, never 360', (value, expected) => {
    expect(snapFacing(value, 45)).toBe(expected);
  });
});

describe('normalizeFacing', () => {
  it('a negative angle wraps around: -90 is 270', () => {
    expect(normalizeFacing(-90)).toBe(270);
  });

  it('a fraction rounds, and 359.6 rounds to 0 instead of 360', () => {
    expect(normalizeFacing(359.6)).toBe(0);
  });
});
