import { describe, expect, it } from 'vitest';
import { boardKeyOf, readingOrder, stepFrom } from '@/lib/board-keys';

const PLAIN = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };

describe('boardKeyOf', () => {
  it.each([
    [']', 'next'],
    ['[', 'previous'],
    ['ArrowUp', 'up'],
    ['ArrowDown', 'down'],
    ['ArrowLeft', 'left'],
    ['ArrowRight', 'right'],
    ['Enter', 'open'],
    ['Delete', 'delete'],
    ['Backspace', 'delete'],
    ['q', 'turnBack'],
    ['E', 'turnOn'],
    ['Tab', null],
    ['x', null],
  ])('%s → %s', (key, action) => {
    expect(boardKeyOf({ key, ...PLAIN })).toBe(action);
  });

  it('an arrow with Ctrl or Alt belongs to the browser', () => {
    expect(boardKeyOf({ key: 'ArrowUp', ...PLAIN, ctrlKey: true })).toBeNull();
    expect(boardKeyOf({ key: 'ArrowUp', ...PLAIN, altKey: true })).toBeNull();
  });
});

describe('readingOrder', () => {
  it('sorts by row, then column, then name', () => {
    const tokens = [
      { id: 'c', name: 'Caio', col: 1, row: 2 },
      { id: 'b', name: 'Bia', col: 5, row: 0 },
      { id: 'a', name: 'Ana', col: 1, row: 2 },
    ];
    expect(readingOrder(tokens).map(({ id }) => id)).toEqual(['b', 'a', 'c']);
  });
});

describe('stepFrom', () => {
  const order = ['a', 'b', 'c'];

  it.each([
    [null, 'next', 'a'],
    [null, 'previous', 'c'],
    ['a', 'next', 'b'],
    ['c', 'next', 'a'],
    ['a', 'previous', 'c'],
    ['gone', 'next', 'a'],
  ] as const)('from %s, %s selects %s', (current, direction, expected) => {
    expect(stepFrom(order, current, direction)).toBe(expected);
  });

  it('with no token there is nothing to select', () => {
    expect(stepFrom([], null, 'next')).toBeNull();
  });
});
