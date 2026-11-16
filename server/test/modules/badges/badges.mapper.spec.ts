import { describe, expect, it } from 'vitest';
import {
  BADGE_IMAGE_SHAPE,
  badgeImageKeyOf,
  shownBadgesOf,
  toAdminBadgeDto,
  toBadgeChanges,
  toCatalogEntries,
} from '../../../src/modules/badges/badges.mapper';
import { badgeRow, IMAGE_ID } from '../../support/badges-fakes';

describe('badges mapper', () => {
  it('the admin row keeps position and holders and drops the creation date', () => {
    const dto = toAdminBadgeDto({ ...badgeRow({ position: 2 }), holders: 5 });

    expect(dto).toEqual({
      id: badgeRow().id,
      name: 'Veterano',
      description: 'Jogou 100 sessões',
      imageId: IMAGE_ID,
      position: 2,
      holders: 5,
    });
  });

  it('shownBadgesOf leaves out a badge without an image and keeps the order', () => {
    const first = badgeRow({ id: 'b-1', name: 'Mestre' });
    const without = badgeRow({ id: 'b-2', imageId: null });
    const last = badgeRow({ id: 'b-3', name: 'Lenda' });

    expect(shownBadgesOf([first, without, last]).map((badge) => badge.name)).toEqual([
      'Mestre',
      'Lenda',
    ]);
  });

  it('toCatalogEntries tells which badges have an image', () => {
    expect(
      toCatalogEntries([
        { id: 'a', imageId: IMAGE_ID },
        { id: 'b', imageId: null },
      ]),
    ).toEqual([
      { id: 'a', hasImage: true },
      { id: 'b', hasImage: false },
    ]);
  });

  it('toBadgeChanges carries only the texts that came', () => {
    expect(toBadgeChanges({ name: 'Lenda' })).toEqual({ name: 'Lenda' });
    expect(toBadgeChanges({ description: 'x' })).toEqual({ description: 'x' });
  });

  it('the image lives under badges/ as a still 128 square', () => {
    expect(badgeImageKeyOf('abc')).toBe('badges/abc');
    expect(BADGE_IMAGE_SHAPE).toEqual({ width: 128, height: 128, animated: false });
  });
});
