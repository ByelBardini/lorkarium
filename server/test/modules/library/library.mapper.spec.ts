import { PLAN_LIMITS } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { planRanksOf, toLibrarySceneDto } from '../../../src/modules/library/library.mapper';
import { ATO_1_ID, librarySceneRow } from '../../support/library-factories';
import { VHARN_SCENE_ID } from '../../support/scenes-factories';

const MAP_ID = '4e5f6a7b-8c9d-4e0f-8a1b-3c4d5e6f7a8b';
const FIRST = { rank: 0, limits: PLAN_LIMITS.free };

describe('toLibrarySceneDto', () => {
  it('the master gets the card with the token count and the background pixels', () => {
    const row = librarySceneRow({
      name: 'Salão do Sino',
      folderId: ATO_1_ID,
      backgroundAssetId: MAP_ID,
      backgroundWidth: 1400,
      backgroundHeight: 700,
      tokenCount: 14,
    });

    expect(toLibrarySceneDto(row, true, FIRST)).toEqual({
      id: VHARN_SCENE_ID,
      name: 'Salão do Sino',
      folderId: ATO_1_ID,
      visibility: 'private',
      widthCells: 20,
      heightCells: 12,
      background: { assetId: MAP_ID, width: 1400, height: 700 },
      tokenCount: 14,
      planLocked: false,
      updatedAt: '2026-10-01T12:00:00.000Z',
    });
  });

  it('a player gets null for the token count', () => {
    const card = toLibrarySceneDto(librarySceneRow({ tokenCount: 14 }), false, FIRST);
    expect(card.tokenCount).toBeNull();
  });

  it('a background whose asset is gone (no pixels) is null', () => {
    const row = librarySceneRow({ backgroundAssetId: MAP_ID });

    expect(toLibrarySceneDto(row, true, FIRST).background).toBeNull();
  });

  it.each([
    [2, false],
    [3, true],
    [4, true],
  ])('grid of rank %i at a free table (3 grids) has planLocked %s', (rank, locked) => {
    const place = { rank, limits: PLAN_LIMITS.free };

    expect(toLibrarySceneDto(librarySceneRow(), true, place).planLocked).toBe(locked);
  });

  it('the 41st grid of an amigo_do_dono table is not locked: its ceiling is the technical one', () => {
    const place = { rank: 40, limits: PLAN_LIMITS.amigo_do_dono };

    expect(toLibrarySceneDto(librarySceneRow(), true, place).planLocked).toBe(false);
  });
});

describe('planRanksOf', () => {
  it('ranks each item by its place in the list read oldest first', () => {
    const placeOf = planRanksOf(
      [{ id: 'salao' }, { id: 'torre' }, { id: 'cripta' }],
      PLAN_LIMITS.free,
    );

    expect(placeOf('cripta')).toEqual({ rank: 2, limits: PLAN_LIMITS.free });
    expect(placeOf('salao').rank).toBe(0);
  });

  it('an id that is not in the list throws, citing it', () => {
    const placeOf = planRanksOf([{ id: 'salao' }], PLAN_LIMITS.free);

    expect(() => placeOf('quelm')).toThrow(
      /item quelm is not in the ranked list; expected one of its 1 ids/,
    );
  });
});
