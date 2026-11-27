import { describe, expect, it } from 'vitest';
import {
  SAVED_TOKEN_DRAG_TYPE,
  carriesSavedToken,
  dropWorldOf,
  savedTokenIdOf,
} from '@/lib/saved-token-drag';

const ZOMBIE_ID = '3c5e7a91-2b4d-4f6a-8c0e-1d3f5a7b9c2e';

function dataOf(entries: Record<string, string>) {
  return { types: Object.keys(entries), getData: (type: string) => entries[type] ?? '' };
}

describe('saved token drag', () => {
  it('a drag of a saved token carries its id', () => {
    const data = dataOf({ [SAVED_TOKEN_DRAG_TYPE]: ZOMBIE_ID, 'text/plain': 'Zumbi' });

    expect(carriesSavedToken(data)).toBe(true);
    expect(savedTokenIdOf(data)).toBe(ZOMBIE_ID);
  });

  it('a drag of a file or a library item is not a saved token', () => {
    const data = dataOf({ Files: '', 'text/plain': 'mapa.png' });

    expect(carriesSavedToken(data)).toBe(false);
    expect(savedTokenIdOf(data)).toBeNull();
  });

  it('a drop at (150, 120) over a host at (50, 20), camera at zoom 2 shifted 10 px, is world (45, 50)', () => {
    const camera = { offsetX: 10, offsetY: 0, zoom: 2 };

    expect(dropWorldOf(camera, { left: 50, top: 20 }, { x: 150, y: 120 })).toEqual({
      x: 45,
      y: 50,
    });
  });
});
