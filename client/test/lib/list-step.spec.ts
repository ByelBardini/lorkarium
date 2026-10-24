import { describe, expect, it } from 'vitest';
import { steppedIndex } from '@/lib/list-step';

describe('steppedIndex', () => {
  it.each([
    ['ArrowDown', 2, 3],
    ['ArrowUp', 2, 1],
    ['Home', 5, 0],
    ['End', 1, 10],
  ])('%s from %s goes to %s in a list of 11', (key, active, next) => {
    expect(steppedIndex(key, active, 11)).toBe(next);
  });

  it('ArrowDown with nothing picked starts at the top', () => {
    expect(steppedIndex('ArrowDown', -1, 11)).toBe(0);
  });

  it('ArrowUp with nothing picked starts at the bottom', () => {
    expect(steppedIndex('ArrowUp', -1, 11)).toBe(10);
  });

  it('ArrowDown on the last item stays on it', () => {
    expect(steppedIndex('ArrowDown', 10, 11)).toBe(10);
  });

  it('ArrowUp on the first item stays on it', () => {
    expect(steppedIndex('ArrowUp', 0, 11)).toBe(0);
  });

  it('a key that does not step answers null', () => {
    expect(steppedIndex('Enter', 2, 11)).toBeNull();
  });

  it('an empty list answers null even for an arrow', () => {
    expect(steppedIndex('ArrowDown', -1, 0)).toBeNull();
  });
});
