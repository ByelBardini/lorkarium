import { describe, expect, it } from 'vitest';
import { toLibrarySceneDto } from '../../../src/modules/library/library.mapper';
import { ATO_1_ID, librarySceneRow } from '../../support/library-factories';
import { VHARN_SCENE_ID } from '../../support/scenes-factories';

const MAP_ID = '4e5f6a7b-8c9d-4e0f-8a1b-3c4d5e6f7a8b';

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

    expect(toLibrarySceneDto(row, true)).toEqual({
      id: VHARN_SCENE_ID,
      name: 'Salão do Sino',
      folderId: ATO_1_ID,
      visibility: 'private',
      widthCells: 20,
      heightCells: 12,
      background: { assetId: MAP_ID, width: 1400, height: 700 },
      tokenCount: 14,
      updatedAt: '2026-10-01T12:00:00.000Z',
    });
  });

  it('a player gets null for the token count', () => {
    expect(toLibrarySceneDto(librarySceneRow({ tokenCount: 14 }), false).tokenCount).toBeNull();
  });

  it('a background whose asset is gone (no pixels) is null', () => {
    const row = librarySceneRow({ backgroundAssetId: MAP_ID });

    expect(toLibrarySceneDto(row, true).background).toBeNull();
  });
});
