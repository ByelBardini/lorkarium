import { describe, expect, it } from 'vitest';
import { splitTabsToFit, tabsThatFit } from '@/lib/tab-overflow';

describe('tabsThatFit', () => {
  const strip = { minWidth: 112, moreWidth: 52, gap: 0 };

  it('fits every tab while they all fit at the minimum width', () => {
    expect(tabsThatFit({ ...strip, width: 400, count: 3 })).toBe(3);
  });
  it('fits every tab before the strip is measured', () => {
    expect(tabsThatFit({ ...strip, width: 0, count: 9 })).toBe(9);
  });
  it('keeps room for the "+N" button once some tabs do not fit', () => {
    expect(tabsThatFit({ ...strip, width: 500, count: 6 })).toBe(4);
  });
  it('always fits at least one tab', () => {
    expect(tabsThatFit({ ...strip, width: 60, count: 4 })).toBe(1);
  });
  it('counts the gaps between the tabs before saying they all fit', () => {
    // 3 × 112 = 336 fits in 340, but 2 gaps of 4 push the strip to 344.
    expect(tabsThatFit({ ...strip, gap: 4, width: 340, count: 3 })).toBe(2);
  });
  it('counts the gap before the "+N" button, so the last tab is not drawn under it', () => {
    // 4 tabs + 3 gaps + the gap and the button = 448 + 12 + 4 + 52 = 516 > 510.
    expect(tabsThatFit({ ...strip, gap: 4, width: 510, count: 6 })).toBe(3);
  });
});

describe('splitTabsToFit', () => {
  const keys = ['grupo', 'torre', 'estrada', 'carta', 'diario'];

  it('shows everything when all fit', () => {
    expect(splitTabsToFit(keys, 5, ['grupo'])).toEqual({ shown: keys, hidden: [] });
  });
  it('fills the room in order and hides the rest', () => {
    expect(splitTabsToFit(keys, 3, ['grupo'])).toEqual({
      shown: ['grupo', 'torre', 'estrada'],
      hidden: ['carta', 'diario'],
    });
  });
  it('keeps the tab shown visible even when it comes last', () => {
    expect(splitTabsToFit(keys, 3, ['grupo', 'diario'])).toEqual({
      shown: ['grupo', 'torre', 'diario'],
      hidden: ['estrada', 'carta'],
    });
  });
  it('draws the pinned tabs past the room', () => {
    expect(splitTabsToFit(keys, 1, ['grupo', 'carta'])).toEqual({
      shown: ['grupo', 'carta'],
      hidden: ['torre', 'estrada', 'diario'],
    });
  });
});
