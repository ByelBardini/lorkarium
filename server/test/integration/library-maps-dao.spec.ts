import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { campaigns } from '../../src/modules/campaigns/campaigns.po';
import { SceneFoldersDao } from '../../src/modules/library/scene-folders.dao';
import { sceneFolders } from '../../src/modules/library/scene-folders.po';
import { newLibraryMapPo } from '../support/library-maps-factories';
import { useLibraryMapsTable } from '../support/library-maps-table';

const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

const live = useLibraryMapsTable();

function refusedBy(code: string, constraint: string): object {
  return { cause: { code, constraint } };
}

describe('LibraryMapsDao on Postgres', () => {
  describe('maps', () => {
    it('saves a new map as private, not main, at version 0 and outside any folder', async () => {
      const mundo = await live.createMap(live.vharn);
      expect(mundo).toMatchObject({
        name: 'Mundo',
        campaignId: live.vharn.campaignId,
        folderId: null,
        visibility: 'private',
        isMain: false,
        version: 0,
      });
    });

    it('lists only the maps of the campaign, in creation order and with their asset', async () => {
      const mundo = await live.createMap(live.vharn);
      await live.createMap(live.quelm, { name: 'Quelm' });
      const listed = await live.maps.listOfCampaign(live.vharn.campaignId);
      expect(listed.map((row) => row.map.id)).toEqual([live.vharn.otherMapId, mundo.id]);
      expect(listed[1]?.asset).toMatchObject({ id: mundo.assetId, purpose: 'library_map' });
    });

    it('finds a map of the campaign with its asset', async () => {
      const mundo = await live.createMap(live.vharn);
      const found = await live.maps.findInCampaign(live.vharn.campaignId, mundo.id);
      expect(found?.map.id).toBe(mundo.id);
      expect(found?.asset.id).toBe(mundo.assetId);
    });

    it('does not find a map of campaign A through campaign B', async () => {
      const mundo = await live.createMap(live.vharn);
      expect(await live.maps.findInCampaign(live.quelm.campaignId, mundo.id)).toBeUndefined();
    });

    it('finds a map by its image, only inside the campaign', async () => {
      const mundo = await live.createMap(live.vharn);
      expect((await live.maps.findByAsset(live.vharn.campaignId, mundo.assetId))?.id).toBe(
        mundo.id,
      );
      expect(await live.maps.findByAsset(live.quelm.campaignId, mundo.assetId)).toBeUndefined();
    });

    it('updates only the keys received and stamps updated_at', async () => {
      const longAgo = new Date('2026-01-01T00:00:00Z');
      const mundo = await live.createMap(live.vharn, {
        folderId: live.vharn.folderId,
        visibility: 'public',
        updatedAt: longAgo,
      });
      const renamed = await live.maps.update(live.vharn.campaignId, mundo.id, {
        name: 'Continente',
      });
      expect(renamed).toMatchObject({
        name: 'Continente',
        folderId: live.vharn.folderId,
        visibility: 'public',
      });
      expect(renamed?.updatedAt.getTime()).toBeGreaterThan(longAgo.getTime());
    });

    it('takes a map to the root when the update sends folderId null', async () => {
      const mundo = await live.createMap(live.vharn, { folderId: live.vharn.folderId });
      const moved = await live.maps.update(live.vharn.campaignId, mundo.id, { folderId: null });
      expect(moved?.folderId).toBeNull();
    });

    it('does not update a map of campaign A through campaign B', async () => {
      const mundo = await live.createMap(live.vharn);
      expect(
        await live.maps.update(live.quelm.campaignId, mundo.id, { name: 'Roubado' }),
      ).toBeUndefined();
      expect((await live.maps.findInCampaign(live.vharn.campaignId, mundo.id))?.map.name).toBe(
        'Mundo',
      );
    });

    it('adds one to the version on each bump and returns the new value', async () => {
      const mundo = await live.createMap(live.vharn);
      expect(await live.maps.bumpVersion(live.vharn.campaignId, mundo.id)).toBe(1);
      expect(await live.maps.bumpVersion(live.vharn.campaignId, mundo.id)).toBe(2);
    });

    it('does not bump the version of a map of campaign A through campaign B', async () => {
      const mundo = await live.createMap(live.vharn);
      expect(await live.maps.bumpVersion(live.quelm.campaignId, mundo.id)).toBeUndefined();
      expect((await live.maps.findInCampaign(live.vharn.campaignId, mundo.id))?.map.version).toBe(
        0,
      );
    });

    it('deletes a map of the campaign', async () => {
      const mundo = await live.createMap(live.vharn);
      expect(await live.maps.delete(live.vharn.campaignId, mundo.id)).toBe(true);
      expect(await live.maps.findInCampaign(live.vharn.campaignId, mundo.id)).toBeUndefined();
    });

    it('does not delete a map of campaign A through campaign B', async () => {
      const mundo = await live.createMap(live.vharn);
      expect(await live.maps.delete(live.quelm.campaignId, mundo.id)).toBe(false);
      expect((await live.maps.findInCampaign(live.vharn.campaignId, mundo.id))?.map.id).toBe(
        mundo.id,
      );
    });

    it('moves the maps of one folder to its parent and leaves the others', async () => {
      const inside = await live.createMap(live.vharn, { folderId: live.vharn.folderId });
      const atRoot = await live.createMap(live.vharn);
      const parent = await new SceneFoldersDao(live.connection.db).insert({
        campaignId: live.vharn.campaignId,
        name: 'Mundos',
      });
      await live.maps.moveFromFolder(live.vharn.campaignId, live.vharn.folderId, parent.id);
      expect((await live.maps.findInCampaign(live.vharn.campaignId, inside.id))?.map.folderId).toBe(
        parent.id,
      );
      expect(
        (await live.maps.findInCampaign(live.vharn.campaignId, atRoot.id))?.map.folderId,
      ).toBeNull();
    });

    it('does not move maps of campaign A through campaign B', async () => {
      const inside = await live.createMap(live.vharn, { folderId: live.vharn.folderId });
      await live.maps.moveFromFolder(live.quelm.campaignId, live.vharn.folderId, null);
      expect((await live.maps.findInCampaign(live.vharn.campaignId, inside.id))?.map.folderId).toBe(
        live.vharn.folderId,
      );
    });

    it('keeps the map at the root and its campaign when its folder is deleted', async () => {
      const mundo = await live.createMap(live.vharn, { folderId: live.vharn.folderId });
      await live.connection.db.delete(sceneFolders).where(eq(sceneFolders.id, live.vharn.folderId));
      const kept = await live.maps.findInCampaign(live.vharn.campaignId, mundo.id);
      expect(kept?.map).toMatchObject({ folderId: null, campaignId: live.vharn.campaignId });
    });

    it('refuses a folder of another campaign', async () => {
      await expect(
        live.createMap(live.vharn, { folderId: live.quelm.folderId }),
      ).rejects.toMatchObject(refusedBy(FOREIGN_KEY_VIOLATION, 'library_maps_folder_fk'));
    });

    it('refuses an asset of another campaign', async () => {
      const assetId = await live.assetIdOf(live.quelm.campaignId);
      await expect(
        live.maps.insert(newLibraryMapPo({ campaignId: live.vharn.campaignId, assetId })),
      ).rejects.toMatchObject(refusedBy(FOREIGN_KEY_VIOLATION, 'library_maps_asset_fk'));
    });

    it('refuses an asset already used by another map', async () => {
      const { assetId } = await live.createMap(live.vharn);
      await expect(
        live.maps.insert(newLibraryMapPo({ campaignId: live.vharn.campaignId, assetId })),
      ).rejects.toMatchObject(refusedBy(UNIQUE_VIOLATION, 'library_maps_asset_unique'));
    });

    it.each([
      ['empty', ''],
      ['61 characters', 'x'.repeat(61)],
    ])('refuses a name that is %s', async (_label, name) => {
      await expect(live.createMap(live.vharn, { name })).rejects.toMatchObject(
        refusedBy(CHECK_VIOLATION, 'library_maps_name_length'),
      );
    });

    it('accepts a name of 60 characters', async () => {
      const name = 'x'.repeat(60);
      expect((await live.createMap(live.vharn, { name })).name).toBe(name);
    });

    it('takes every map of the campaign along when the campaign is deleted', async () => {
      const mundo = await live.createMap(live.vharn);
      await live.createRegion(live.vharn, mundo.id, {
        linkKind: 'map',
        targetMapId: live.vharn.otherMapId,
      });
      await live.connection.db.delete(campaigns).where(eq(campaigns.id, live.vharn.campaignId));
      expect(await live.maps.listOfCampaign(live.vharn.campaignId)).toEqual([]);
      expect(await live.regions.listOfMap(live.vharn.campaignId, mundo.id)).toEqual([]);
      expect((await live.maps.listOfCampaign(live.quelm.campaignId)).length).toBe(1);
    });
  });

  describe('the main map', () => {
    it('refuses a second main map in the same campaign', async () => {
      await live.createMap(live.vharn, { isMain: true });
      await expect(live.createMap(live.vharn, { isMain: true })).rejects.toMatchObject(
        refusedBy(UNIQUE_VIOLATION, 'library_maps_one_main_unique'),
      );
    });

    it('accepts one main map in each of two campaigns', async () => {
      await live.createMap(live.vharn, { isMain: true });
      expect((await live.createMap(live.quelm, { isMain: true })).isMain).toBe(true);
    });

    it('accepts many maps that are not main in the same campaign', async () => {
      await live.createMap(live.vharn);
      expect((await live.createMap(live.vharn)).isMain).toBe(false);
    });

    it('finds the main map of the campaign with its asset', async () => {
      await live.createMap(live.quelm, { isMain: true });
      const mundo = await live.createMap(live.vharn, { isMain: true });
      const main = await live.maps.findMainOfCampaign(live.vharn.campaignId);
      expect(main?.map.id).toBe(mundo.id);
      expect(main?.asset.id).toBe(mundo.assetId);
    });

    it('finds nothing in a campaign without a main map', async () => {
      await live.createMap(live.vharn);
      expect(await live.maps.findMainOfCampaign(live.vharn.campaignId)).toBeUndefined();
    });

    it('swaps the main map when the old one is cleared before the new one is set', async () => {
      const old = await live.createMap(live.vharn, { isMain: true });
      const next = await live.createMap(live.vharn);
      await live.maps.clearMain(live.vharn.campaignId);
      expect(await live.maps.setMain(live.vharn.campaignId, next.id)).toBe(true);
      expect((await live.maps.findMainOfCampaign(live.vharn.campaignId))?.map.id).toBe(next.id);
      expect((await live.maps.findInCampaign(live.vharn.campaignId, old.id))?.map.isMain).toBe(
        false,
      );
    });

    it('does not clear the main map of another campaign', async () => {
      const other = await live.createMap(live.quelm, { isMain: true });
      await live.createMap(live.vharn, { isMain: true });
      await live.maps.clearMain(live.vharn.campaignId);
      expect((await live.maps.findMainOfCampaign(live.quelm.campaignId))?.map.id).toBe(other.id);
      expect(await live.maps.findMainOfCampaign(live.vharn.campaignId)).toBeUndefined();
    });

    it('does not set as main a map of campaign A through campaign B', async () => {
      const mundo = await live.createMap(live.vharn);
      expect(await live.maps.setMain(live.quelm.campaignId, mundo.id)).toBe(false);
      expect((await live.maps.findInCampaign(live.vharn.campaignId, mundo.id))?.map.isMain).toBe(
        false,
      );
    });
  });
});
