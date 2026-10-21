import { describe, expect, it } from 'vitest';
import { coneOf, type Cone } from '../src/cone.vo';
import { distanceToBox, insideCone, withinField, type ViewField } from '../src/view-field';

function cone(direction: number, angle: number): Cone {
  const value = coneOf(direction, angle);
  if (!value) throw new Error(`cone ${String(direction)} / ${String(angle)} is every side`);
  return value;
}

const APEX = { x: 5.5, y: 5.5 };
const LYRA_BOX = { x: 5, y: 5, width: 1, height: 1 };
const LOOKING_RIGHT = cone(0, 90);

describe('insideCone', () => {
  it('a point ahead is inside and a point behind is outside', () => {
    expect(insideCone(LOOKING_RIGHT, APEX, { x: 8.5, y: 5.5 })).toBe(true);
    expect(insideCone(LOOKING_RIGHT, APEX, { x: 2.5, y: 5.5 })).toBe(false);
  });

  it('a point exactly on the edge (45°) is inside, just past it is outside', () => {
    expect(insideCone(LOOKING_RIGHT, APEX, { x: 8.5, y: 8.5 })).toBe(true);
    expect(insideCone(LOOKING_RIGHT, APEX, { x: 8.5, y: 8.6 })).toBe(false);
  });

  it('the apex itself is inside', () => {
    expect(insideCone(LOOKING_RIGHT, APEX, APEX)).toBe(true);
  });

  it('a cone crossing 0° holds 346° and leaves out 27°', () => {
    const acrossZero = cone(350, 40);

    expect(insideCone(acrossZero, APEX, { x: 9.5, y: 4.5 })).toBe(true);
    expect(insideCone(acrossZero, APEX, { x: 9.5, y: 7.5 })).toBe(false);
  });

  it('a 270° cone holds straight up and leaves out 198°', () => {
    const wide = cone(0, 270);

    expect(insideCone(wide, APEX, { x: 5.5, y: 2.5 })).toBe(true);
    expect(insideCone(wide, APEX, { x: 2.5, y: 4.5 })).toBe(false);
  });

  it('no cone (every side) holds any point', () => {
    expect(insideCone(null, APEX, { x: 2.5, y: 5.5 })).toBe(true);
  });
});

describe('distanceToBox', () => {
  it.each([
    [{ x: 5.5, y: 5.2 }, 0],
    [{ x: 8, y: 5.5 }, 2],
    [{ x: 4, y: 4 }, Math.SQRT2],
  ])('%o is %s from the 1 × 1 box at (5, 5)', (point, distance) => {
    expect(distanceToBox(LYRA_BOX, point)).toBeCloseTo(distance, 12);
  });
});

describe('withinField', () => {
  const eyeField: ViewField = { cone: LOOKING_RIGHT, around: LYRA_BOX };

  it.each([
    ['right behind (0.5)', { x: 4.5, y: 5.5 }],
    ['exactly 1 cell behind (the edge counts)', { x: 4, y: 5.5 }],
    ['on the back diagonal (0.71)', { x: 4.5, y: 4.5 }],
  ])('a point %s is felt by the ring', (_, point) => {
    expect(withinField(eyeField, APEX, point)).toBe(true);
  });

  it.each([
    ['2 cells behind (1.5)', { x: 3.5, y: 5.5 }],
    ['past the ring corner (1.13)', { x: 4.2, y: 4.2 }],
  ])('a point %s is outside the field', (_, point) => {
    expect(withinField(eyeField, APEX, point)).toBe(false);
  });

  it('a point in the cone is within the field', () => {
    expect(withinField(eyeField, APEX, { x: 20, y: 5.5 })).toBe(true);
  });

  it('a lantern (no ring) leaves out the point right behind its holder', () => {
    const lantern: ViewField = { cone: LOOKING_RIGHT, around: null };

    expect(withinField(lantern, APEX, { x: 4.5, y: 5.5 })).toBe(false);
  });
});
