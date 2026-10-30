import { describe, expect, it } from 'vitest';
import {
  createLibraryImageRequestDto,
  updateLibraryImageRequestDto,
  imagePresentationStateDto,
  campaignLibraryDto,
  libraryDto,
  ASSET_MAX_SIDE,
} from '../../src';
const id = '00000000-0000-4000-8000-000000000001';
describe('library images contracts', () => {
  it('trims image names and accepts the root', () =>
    expect(
      createLibraryImageRequestDto.parse({ name: '  Retrato  ', assetId: id, folderId: null }),
    ).toEqual({ name: 'Retrato', assetId: id, folderId: null }));
  it.each(['', '   ', 'a'.repeat(61)])('refuses invalid name %s', (name) =>
    expect(createLibraryImageRequestDto.safeParse({ name, assetId: id }).success).toBe(false),
  );
  it('refuses an empty patch and forged identity', () => {
    expect(updateLibraryImageRequestDto.safeParse({}).success).toBe(false);
    expect(
      createLibraryImageRequestDto.safeParse({ name: 'Retrato', assetId: id, userId: id }).success,
    ).toBe(false);
  });
  it('refuses negative presentation versions', () =>
    expect(
      imagePresentationStateDto.safeParse({
        campaignId: id,
        version: -1,
        at: '2026-10-29T00:00:00.000Z',
        presentation: null,
      }).success,
    ).toBe(false));
  it('keeps legacy scenes strict and separate from the aggregate', () => {
    const legacy = { activeSceneId: null, folders: [], scenes: [] };
    expect(libraryDto.parse(legacy)).toEqual(legacy);
    expect(campaignLibraryDto.parse({ ...legacy, images: [], documents: [] })).toEqual({
      ...legacy,
      images: [],
      documents: [],
    });
    expect(libraryDto.safeParse({ ...legacy, images: [] }).success).toBe(false);
  });
  it('keeps static library images at 4096 pixels', () =>
    expect(ASSET_MAX_SIDE.library_image).toBe(4096));
});
