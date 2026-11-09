import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { libraryDocuments } from '../../src/modules/documents/documents.po';
import { libraryImages } from '../../src/modules/library/library-images.po';
import { libraryMaps } from '../../src/modules/library-maps/library-maps.po';
import { scenes } from '../../src/modules/scenes/scenes.po';
import { CITY_GEOMETRY, KINGDOM_GEOMETRY } from '../support/library-maps-factories';
import { useLibraryMapsTable, type FurnishedCampaign } from '../support/library-maps-table';

const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';

const live = useLibraryMapsTable();

function refusedBy(code: string, constraint: string): object {
  return { cause: { code, constraint } };
}

const LINK_TARGETS = [
  {
    kind: 'document',
    column: 'targetDocumentId',
    constraint: 'library_map_regions_target_document_fk',
    idOf: (table: FurnishedCampaign) => table.documentId,
    erase: (id: string) =>
      live.connection.db.delete(libraryDocuments).where(eq(libraryDocuments.id, id)),
  },
  {
    kind: 'scene',
    column: 'targetSceneId',
    constraint: 'library_map_regions_target_scene_fk',
    idOf: (table: FurnishedCampaign) => table.sceneId,
    erase: (id: string) => live.connection.db.delete(scenes).where(eq(scenes.id, id)),
  },
  {
    kind: 'map',
    column: 'targetMapId',
    constraint: 'library_map_regions_target_map_fk',
    idOf: (table: FurnishedCampaign) => table.otherMapId,
    erase: (id: string) => live.connection.db.delete(libraryMaps).where(eq(libraryMaps.id, id)),
  },
  {
    kind: 'image',
    column: 'targetImageId',
    constraint: 'library_map_regions_target_image_fk',
    idOf: (table: FurnishedCampaign) => table.imageId,
    erase: (id: string) => live.connection.db.delete(libraryImages).where(eq(libraryImages.id, id)),
  },
] as const;

describe('LibraryMapRegionsDao on Postgres', () => {
  describe('regions', () => {
    let mapId: string;

    beforeEach(async () => {
      mapId = (await live.createMap(live.vharn)).id;
    });

    it('saves a region without a link, visible and with no description', async () => {
      const reino = await live.createRegion(live.vharn, mapId);
      expect(reino).toMatchObject({
        name: 'Reino de Vharn',
        description: '',
        geometry: KINGDOM_GEOMETRY,
        color: '#aa3300',
        hidden: false,
        linkKind: null,
        targetDocumentId: null,
        targetSceneId: null,
        targetMapId: null,
        targetImageId: null,
      });
    });

    it('gives back a pin geometry as it was saved', async () => {
      const cidade = await live.createRegion(live.vharn, mapId, { geometry: CITY_GEOMETRY });
      expect(
        (await live.regions.findInMap(live.vharn.campaignId, mapId, cidade.id))?.geometry,
      ).toEqual(CITY_GEOMETRY);
    });

    it.each(LINK_TARGETS)('saves a region linked to a $kind', async (target) => {
      const id = target.idOf(live.vharn);
      const linked = await live.createRegion(live.vharn, mapId, {
        linkKind: target.kind,
        [target.column]: id,
      });
      expect(linked).toMatchObject({ linkKind: target.kind, [target.column]: id });
    });

    it('accepts a link to the map the region is on, which only the service refuses', async () => {
      const own = await live.createRegion(live.vharn, mapId, {
        linkKind: 'map',
        targetMapId: mapId,
      });
      expect(own.targetMapId).toBe(mapId);
    });

    it('lists only the regions of that map, in creation order', async () => {
      const first = await live.createRegion(live.vharn, mapId, { name: 'Primeira' });
      const second = await live.createRegion(live.vharn, mapId, { name: 'Segunda' });
      await live.createRegion(live.vharn, live.vharn.otherMapId, { name: 'De outro mapa' });
      const listed = await live.regions.listOfMap(live.vharn.campaignId, mapId);
      expect(listed.map((row) => row.id)).toEqual([first.id, second.id]);
    });

    it('does not list the regions of a map of campaign A through campaign B', async () => {
      await live.createRegion(live.vharn, mapId);
      expect(await live.regions.listOfMap(live.quelm.campaignId, mapId)).toEqual([]);
    });

    it('finds a region only through its own map and campaign', async () => {
      const reino = await live.createRegion(live.vharn, mapId);
      expect((await live.regions.findInMap(live.vharn.campaignId, mapId, reino.id))?.id).toBe(
        reino.id,
      );
      expect(
        await live.regions.findInMap(live.vharn.campaignId, live.vharn.otherMapId, reino.id),
      ).toBeUndefined();
      expect(await live.regions.findInMap(live.quelm.campaignId, mapId, reino.id)).toBeUndefined();
    });

    it('counts the regions of one map', async () => {
      await live.createRegion(live.vharn, mapId);
      await live.createRegion(live.vharn, mapId);
      await live.createRegion(live.vharn, live.vharn.otherMapId);
      expect(await live.regions.countOfMap(live.vharn.campaignId, mapId)).toBe(2);
      expect(await live.regions.countOfMap(live.quelm.campaignId, mapId)).toBe(0);
    });

    it('updates only the keys received and stamps updated_at', async () => {
      const longAgo = new Date('2026-01-01T00:00:00Z');
      const reino = await live.createRegion(live.vharn, mapId, { updatedAt: longAgo });
      const hidden = await live.regions.update(live.vharn.campaignId, mapId, reino.id, {
        hidden: true,
      });
      expect(hidden).toMatchObject({ hidden: true, name: 'Reino de Vharn', color: '#aa3300' });
      expect(hidden?.updatedAt.getTime()).toBeGreaterThan(longAgo.getTime());
    });

    it('replaces a link when the kind and every target are sent together', async () => {
      const reino = await live.createRegion(live.vharn, mapId, {
        linkKind: 'document',
        targetDocumentId: live.vharn.documentId,
      });
      const relinked = await live.regions.update(live.vharn.campaignId, mapId, reino.id, {
        linkKind: 'scene',
        targetDocumentId: null,
        targetSceneId: live.vharn.sceneId,
      });
      expect(relinked).toMatchObject({
        linkKind: 'scene',
        targetDocumentId: null,
        targetSceneId: live.vharn.sceneId,
      });
    });

    it('does not update a region through another map or campaign', async () => {
      const reino = await live.createRegion(live.vharn, mapId);
      const changes = { name: 'Roubado' };
      expect(
        await live.regions.update(live.quelm.campaignId, mapId, reino.id, changes),
      ).toBeUndefined();
      expect(
        await live.regions.update(live.vharn.campaignId, live.vharn.otherMapId, reino.id, changes),
      ).toBeUndefined();
      expect((await live.storedRegion(reino.id))?.name).toBe('Reino de Vharn');
    });

    it('deletes a region of the map', async () => {
      const reino = await live.createRegion(live.vharn, mapId);
      expect(await live.regions.delete(live.vharn.campaignId, mapId, reino.id)).toBe(true);
      expect(await live.storedRegion(reino.id)).toBeUndefined();
    });

    it('does not delete a region through another map or campaign', async () => {
      const reino = await live.createRegion(live.vharn, mapId);
      expect(await live.regions.delete(live.quelm.campaignId, mapId, reino.id)).toBe(false);
      expect(
        await live.regions.delete(live.vharn.campaignId, live.vharn.otherMapId, reino.id),
      ).toBe(false);
      expect(await live.storedRegion(reino.id)).toBeDefined();
    });

    it('goes away with its map', async () => {
      const reino = await live.createRegion(live.vharn, mapId);
      await live.maps.delete(live.vharn.campaignId, mapId);
      expect(await live.storedRegion(reino.id)).toBeUndefined();
    });

    it('deletes a map whose own region links to it', async () => {
      const own = await live.createRegion(live.vharn, mapId, {
        linkKind: 'map',
        targetMapId: mapId,
      });
      expect(await live.maps.delete(live.vharn.campaignId, mapId)).toBe(true);
      expect(await live.storedRegion(own.id)).toBeUndefined();
    });

    it.each(LINK_TARGETS)(
      'keeps the region, its campaign and the kind when the $kind is deleted',
      async (target) => {
        const linked = await live.createRegion(live.vharn, mapId, {
          linkKind: target.kind,
          [target.column]: target.idOf(live.vharn),
        });
        await target.erase(target.idOf(live.vharn));
        expect(await live.storedRegion(linked.id)).toMatchObject({
          campaignId: live.vharn.campaignId,
          mapId,
          linkKind: target.kind,
          targetDocumentId: null,
          targetSceneId: null,
          targetMapId: null,
          targetImageId: null,
        });
      },
    );

    it.each(LINK_TARGETS)('refuses a $kind of another campaign', async (target) => {
      await expect(
        live.createRegion(live.vharn, mapId, {
          linkKind: target.kind,
          [target.column]: target.idOf(live.quelm),
        }),
      ).rejects.toMatchObject(refusedBy(FOREIGN_KEY_VIOLATION, target.constraint));
    });

    it('refuses a map of another campaign as the map of the region', async () => {
      await expect(live.createRegion(live.vharn, live.quelm.otherMapId)).rejects.toMatchObject(
        refusedBy(FOREIGN_KEY_VIOLATION, 'library_map_regions_map_fk'),
      );
    });

    it('refuses two targets at once', async () => {
      await expect(
        live.createRegion(live.vharn, mapId, {
          linkKind: 'document',
          targetDocumentId: live.vharn.documentId,
          targetSceneId: live.vharn.sceneId,
        }),
      ).rejects.toMatchObject(refusedBy(CHECK_VIOLATION, 'library_map_regions_link_target'));
    });

    it('refuses a target that does not match the kind', async () => {
      await expect(
        live.createRegion(live.vharn, mapId, {
          linkKind: 'scene',
          targetDocumentId: live.vharn.documentId,
        }),
      ).rejects.toMatchObject(refusedBy(CHECK_VIOLATION, 'library_map_regions_link_target'));
    });

    it('refuses a target with no kind', async () => {
      await expect(
        live.createRegion(live.vharn, mapId, { targetDocumentId: live.vharn.documentId }),
      ).rejects.toMatchObject(refusedBy(CHECK_VIOLATION, 'library_map_regions_link_target'));
    });

    it('accepts a kind with no target, the state of a removed link', async () => {
      const removed = await live.createRegion(live.vharn, mapId, { linkKind: 'image' });
      expect(removed).toMatchObject({ linkKind: 'image', targetImageId: null });
    });

    it.each([
      ['an empty name', { name: '' }, 'library_map_regions_name_length'],
      ['a name of 61 characters', { name: 'x'.repeat(61) }, 'library_map_regions_name_length'],
      [
        'a description of 501 characters',
        { description: 'x'.repeat(501) },
        'library_map_regions_description_length',
      ],
      ['a color in capitals', { color: '#AA3300' }, 'library_map_regions_color_hex'],
      ['a palette name as color', { color: 'ember' }, 'library_map_regions_color_hex'],
    ])('refuses %s', async (_label, overrides, constraint) => {
      await expect(live.createRegion(live.vharn, mapId, overrides)).rejects.toMatchObject(
        refusedBy(CHECK_VIOLATION, constraint),
      );
    });

    it('accepts a name of 60 and a description of 500 characters', async () => {
      const longest = { name: 'x'.repeat(60), description: 'y'.repeat(500) };
      expect(await live.createRegion(live.vharn, mapId, longest)).toMatchObject(longest);
    });
  });

  describe('listAppearances', () => {
    it('brings the regions linked to that document, with what decides who sees them', async () => {
      const mundo = await live.createMap(live.vharn, {
        name: 'Mundo',
        isMain: true,
        visibility: 'public',
      });
      const reino = await live.createRegion(live.vharn, mundo.id, {
        name: 'Reino',
        hidden: true,
        linkKind: 'document',
        targetDocumentId: live.vharn.documentId,
      });
      expect(
        await live.regions.listAppearances(live.vharn.campaignId, live.vharn.documentId),
      ).toEqual([
        {
          mapId: mundo.id,
          mapName: 'Mundo',
          mapVisibility: 'public',
          mapIsMain: true,
          mapHiddenByFolder: false,
          regionId: reino.id,
          regionName: 'Reino',
          regionHidden: true,
          tabName: null,
          tabVisibility: null,
        },
      ]);
    });

    it('leaves out regions without a link or linked to something else', async () => {
      const mundo = await live.createMap(live.vharn);
      await live.createRegion(live.vharn, mundo.id, { name: 'Sem link' });
      await live.createRegion(live.vharn, mundo.id, {
        linkKind: 'scene',
        targetSceneId: live.vharn.sceneId,
      });
      expect(
        await live.regions.listAppearances(live.vharn.campaignId, live.vharn.documentId),
      ).toEqual([]);
    });

    it('lists the appearances of the document ordered by map', async () => {
      const link = { linkKind: 'document', targetDocumentId: live.vharn.documentId } as const;
      const first = await live.createRegion(live.vharn, live.vharn.otherMapId, {
        ...link,
        name: 'Na masmorra',
      });
      const mundo = await live.createMap(live.vharn);
      const second = await live.createRegion(live.vharn, mundo.id, { ...link, name: 'No mundo' });
      const appearances = await live.regions.listAppearances(
        live.vharn.campaignId,
        live.vharn.documentId,
      );
      expect(appearances.map((row) => row.regionId)).toEqual([first.id, second.id]);
    });

    it('does not list the appearances of a document of campaign A through campaign B', async () => {
      const mundo = await live.createMap(live.vharn);
      await live.createRegion(live.vharn, mundo.id, {
        linkKind: 'document',
        targetDocumentId: live.vharn.documentId,
      });
      expect(
        await live.regions.listAppearances(live.quelm.campaignId, live.vharn.documentId),
      ).toEqual([]);
    });
  });
});
