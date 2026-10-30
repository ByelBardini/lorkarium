import { describe, expect, it } from 'vitest';
import { splitTabsToFit, tabsThatFit } from '@/lib/tab-overflow';

describe('tabsThatFit', () => {
  it('fits every tab while they all fit at the minimum width', () => {
    expect(tabsThatFit({ width: 400, count: 3, minWidth: 112, moreWidth: 52 })).toBe(3);
  });
  it('fits every tab before the strip is measured', () => {
    expect(tabsThatFit({ width: 0, count: 9, minWidth: 112, moreWidth: 52 })).toBe(9);
  });
  it('keeps room for the "+N" button once some tabs do not fit', () => {
    expect(tabsThatFit({ width: 500, count: 6, minWidth: 112, moreWidth: 52 })).toBe(4);
  });
  it('always fits at least one tab', () => {
    expect(tabsThatFit({ width: 60, count: 4, minWidth: 112, moreWidth: 52 })).toBe(1);
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
