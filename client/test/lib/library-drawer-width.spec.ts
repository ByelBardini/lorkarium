import { describe, expect, it } from 'vitest';
import {
  LIBRARY_DRAWER_DEFAULT_WIDTH,
  LIBRARY_DRAWER_WIDE_WIDTH,
  clampLibraryDrawerWidth,
  isWideLibraryDrawer,
} from '@/lib/library-drawer-width';

describe('clampLibraryDrawerWidth', () => {
  it('keeps a width that fits the room', () => {
    expect(clampLibraryDrawerWidth(500, 1600)).toBe(500);
  });

  it('raises a width under 320 px to 320', () => {
    expect(clampLibraryDrawerWidth(200, 1600)).toBe(320);
  });

  it('caps the width at 70% of the room, in whole pixels', () => {
    expect(clampLibraryDrawerWidth(1500, 1200)).toBe(840);
    expect(clampLibraryDrawerWidth(1500, 1001)).toBe(700);
  });

  it('caps the width at 1100 px on a very wide room', () => {
    expect(clampLibraryDrawerWidth(3000, 4000)).toBe(1100);
  });

  it.each([Number.NaN, -40, Number.POSITIVE_INFINITY])(
    'a width of %s falls back to the default',
    (width) => {
      expect(clampLibraryDrawerWidth(width, 1600)).toBe(LIBRARY_DRAWER_DEFAULT_WIDTH);
    },
  );

  it('a room narrower than 320 px gets the whole room', () => {
    expect(clampLibraryDrawerWidth(500, 280)).toBe(280);
  });
});

describe('isWideLibraryDrawer', () => {
  it('is wide from 720 px on, where the tree and the panel fit side by side', () => {
    expect(isWideLibraryDrawer(719)).toBe(false);
    expect(isWideLibraryDrawer(720)).toBe(true);
  });

  it('"Ampliar" lands on a wide width and the default is narrow', () => {
    expect(isWideLibraryDrawer(LIBRARY_DRAWER_WIDE_WIDTH)).toBe(true);
    expect(isWideLibraryDrawer(LIBRARY_DRAWER_DEFAULT_WIDTH)).toBe(false);
  });
});
