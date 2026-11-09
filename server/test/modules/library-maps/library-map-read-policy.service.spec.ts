import { beforeEach, describe, expect, it } from 'vitest';
import { LibraryMapReadPolicy } from '../../../src/modules/library-maps/library-map-read-policy.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, QUELM_ID, VHARN_ID } from '../../support/campaigns-factories';
import {
  LibraryMapReadSnapshotFake,
  WORLD_MAP_ASSET_ID,
  worldMapPo,
} from '../../support/library-map-read-fakes';

const READERS = [
  ['player', BIA_ID],
  ['spectator', CAIO_ID],
] as const;

describe('LibraryMapReadPolicy', () => {
  let snapshot: LibraryMapReadSnapshotFake;
  let policy: LibraryMapReadPolicy;

  beforeEach(() => {
    snapshot = new LibraryMapReadSnapshotFake();
    policy = new LibraryMapReadPolicy(snapshot.run);
  });

  const canRead = (userId: string): Promise<boolean> =>
    policy.canRead(userId, VHARN_ID, WORLD_MAP_ASSET_ID);

  it('the master reads a private map that is not the main one', async () => {
    snapshot.maps.rows.push(worldMapPo());
    expect(await canRead(ANA_ID)).toBe(true);
  });

  it.each(READERS)('a %s reads a public map', async (_role, userId) => {
    snapshot.maps.rows.push(worldMapPo({ visibility: 'public' }));
    expect(await canRead(userId)).toBe(true);
    expect(snapshot.snapshots).toBe(1);
  });

  it.each(READERS)('a %s reads a private map while it is the main one', async (_role, userId) => {
    snapshot.maps.rows.push(worldMapPo({ isMain: true }));
    expect(await canRead(userId)).toBe(true);
  });

  it.each(READERS)('a %s cannot read a private map', async (_role, userId) => {
    snapshot.maps.rows.push(worldMapPo());
    expect(await canRead(userId)).toBe(false);
  });

  it('a map that stops being the main one stops being read on the next request', async () => {
    const main = worldMapPo({ isMain: true });
    snapshot.maps.rows.push(main);
    expect(await canRead(BIA_ID)).toBe(true);

    snapshot.maps.rows[0] = { ...main, isMain: false };

    expect(await canRead(BIA_ID)).toBe(false);
  });

  it('an image no map uses yet is read only by the master', async () => {
    expect(await canRead(ANA_ID)).toBe(true);
    expect(await canRead(BIA_ID)).toBe(false);
    expect(await canRead(CAIO_ID)).toBe(false);
  });

  it('a public map of another campaign authorizes nothing in this one', async () => {
    snapshot.maps.rows.push(worldMapPo({ campaignId: QUELM_ID, visibility: 'public' }));
    expect(await canRead(BIA_ID)).toBe(false);
  });

  it('a reader outside the campaign is refused before the map is looked up', async () => {
    snapshot.maps.rows.push(worldMapPo({ campaignId: QUELM_ID, visibility: 'public' }));
    await expect(policy.canRead(BIA_ID, QUELM_ID, WORLD_MAP_ASSET_ID)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_FOUND',
    });
  });
});
