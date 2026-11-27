import { savedTokenBodyDto } from '@lorkarium/contracts';
import { cell } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { SPAWN_PREVIEW_ID, spawnGhostOf, spawnLandingOf } from '@/renderer/spawn-ghost';

const CELLS = { widthCells: 20, heightCells: 12 };
const PORTRAIT = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

function body(overrides: Record<string, unknown> = {}) {
  return savedTokenBodyDto.parse({
    name: 'Zumbi',
    initials: 'ZB',
    side: 'enemy',
    width: 1,
    height: 1,
    bars: [{ label: 'PV', current: 6, max: 12, color: '#cc2222', visibility: 'everyone' }],
    ...overrides,
  });
}

function worldAt(col: number, row: number) {
  return { x: col * CELL_WORLD_SIZE, y: row * CELL_WORLD_SIZE };
}

describe('spawnGhostOf', () => {
  it('the preview is the token itself: initials, ring of its side, size and first bar', () => {
    const { token } = spawnGhostOf(body({ width: 2, height: 2 }));

    expect(token).toMatchObject({
      id: SPAWN_PREVIEW_ID,
      initials: 'ZB',
      ring: 'enemy',
      width: 2,
      height: 2,
      art: null,
      bar: { fraction: 0.5, state: 'normal', color: '#cc2222' },
    });
  });

  it('with a portrait it draws the image in the saved frame', () => {
    const { token } = spawnGhostOf(body({ imageAssetId: PORTRAIT, frame: 'round' }));

    expect(token.art).toEqual({
      url: `/api/assets/${PORTRAIT}`,
      frame: 'round',
      flipX: false,
      flipY: false,
    });
  });

  it('the preview picks, selects and drags nothing', () => {
    const { token } = spawnGhostOf(body());

    expect([token.pickable, token.selected, token.draggable]).toEqual([false, false, false]);
  });
});

describe('spawnLandingOf', () => {
  it('a 1×1 preview lands on the cell under the pointer', () => {
    const spawnGhost = spawnGhostOf(body());

    expect(spawnLandingOf({ grid: { cells: CELLS }, spawnGhost }, worldAt(7.6, 3.2))).toEqual(
      cell(7, 3),
    );
  });

  it('a 3×3 preview at the right edge would leave the scene: no landing', () => {
    const spawnGhost = spawnGhostOf(body({ width: 3, height: 3 }));

    expect(spawnLandingOf({ grid: { cells: CELLS }, spawnGhost }, worldAt(19.5, 5))).toBeNull();
  });

  it('with nothing armed there is no landing', () => {
    expect(spawnLandingOf({ grid: { cells: CELLS }, spawnGhost: null }, worldAt(5, 5))).toBeNull();
  });
});
