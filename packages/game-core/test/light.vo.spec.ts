import { describe, expect, it } from 'vitest';
import { lightFits, lightRange, sceneLight } from '../src/light.vo';

const SCENE_20_BY_12 = { widthCells: 20, heightCells: 12 };

function torchAt(x: number, y: number) {
  return sceneLight({ x, y, range: lightRange(4, 4), lit: true });
}

describe('lightRange', () => {
  it('a torch of bright 4 and dim 4 is kept as sent, frozen', () => {
    const range = lightRange(4, 4);
    expect(range).toEqual({ bright: 4, dim: 4 });
    expect(Object.isFrozen(range)).toBe(true);
  });

  it('a faint candle with bright 0 and dim 6 is accepted', () => {
    expect(lightRange(0, 6)).toEqual({ bright: 0, dim: 6 });
  });

  it('the widest light, 100 and 100, is accepted', () => {
    expect(lightRange(100, 100)).toEqual({ bright: 100, dim: 100 });
  });

  it('a bright of 101 is refused citing the value and 0 to 100 cells', () => {
    expect(() => lightRange(101, 0)).toThrow(
      'Light bright 101 is invalid: expected 0 to 100 cells.',
    );
  });

  it.each([
    [4, -1, 'dim -1'],
    [Number.NaN, 4, 'bright NaN'],
  ])('a light of %s and %s is refused citing %s', (bright, dim, shown) => {
    expect(() => lightRange(bright, dim)).toThrow(new RegExp(`Light ${shown}.*0 to 100 cells`));
  });
});

describe('sceneLight', () => {
  it('a lit torch at (5.5, 3) is kept as sent, frozen', () => {
    const light = torchAt(5.5, 3);
    expect(light).toEqual({ x: 5.5, y: 3, range: { bright: 4, dim: 4 }, lit: true });
    expect(Object.isFrozen(light)).toBe(true);
  });

  it('an x of -1 is refused citing the axis, the value and a finite number ≥ 0', () => {
    expect(() => torchAt(-1, 3)).toThrow('Light x -1 is invalid: expected a finite number ≥ 0.');
  });

  it('a y of Infinity is refused citing the axis and the value', () => {
    expect(() => torchAt(2, Number.POSITIVE_INFINITY)).toThrow(/Light y Infinity is invalid/);
  });
});

describe('lightFits', () => {
  it.each([
    [0, 0],
    [20, 12],
  ])('a light at (%s, %s) fits, the scene edge counts', (x, y) => {
    expect(lightFits(SCENE_20_BY_12, torchAt(x, y))).toBe(true);
  });

  it('a light at (20.01, 5) is past the right edge and does not fit', () => {
    expect(lightFits(SCENE_20_BY_12, torchAt(20.01, 5))).toBe(false);
  });
});
