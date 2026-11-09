import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { DocumentsDao } from '../../src/modules/documents/documents.dao';
import { libraryDocuments } from '../../src/modules/documents/documents.po';
import { ImagePresentationsDao } from '../../src/modules/library/image-presentations.dao';
import { libraryImages } from '../../src/modules/library/library-images.po';
import { MapLinkTargetsDao } from '../../src/modules/library-maps/map-link-targets.dao';
import { scenes } from '../../src/modules/scenes/scenes.po';
import { useLibraryMapsTable } from '../support/library-maps-table';
import { newUserPo } from '../support/auth-factories';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { campaignMembers } from '../../src/modules/campaigns/campaign-members.po';

const live = useLibraryMapsTable();
const dao = () => new MapLinkTargetsDao(live.connection.db);

describe('MapLinkTargetsDao', () => {
  it('finds no document, grid, map or image when asked for no id', async () => {
    const { campaignId } = live.vharn;
    await expect(dao().documentsIn(campaignId, [])).resolves.toEqual([]);
    await expect(dao().scenesIn(campaignId, [])).resolves.toEqual([]);
    await expect(dao().mapsIn(campaignId, [])).resolves.toEqual([]);
    await expect(dao().imagesIn(campaignId, [])).resolves.toEqual([]);
  });

  it('documentsIn answers what decides who reads it, with no owner', async () => {
    const { campaignId, documentId } = live.vharn;
    await expect(dao().documentsIn(campaignId, [documentId])).resolves.toEqual([
      {
        id: documentId,
        name: 'Diário',
        visibility: 'private',
        hiddenByFolder: false,
        ownerIds: [],
        version: 0,
      },
    ]);
  });

  it('documentsIn brings every owner', async () => {
    const { campaignId, documentId } = live.vharn;
    const db = live.connection.db;
    const owners = await Promise.all(
      ['bia', 'caio'].map(async (name) => {
        const user = await new UsersDao(db).insert(newUserPo({ email: `${name}@mesa.com` }));
        await db.insert(campaignMembers).values({ campaignId, userId: user.id, role: 'player' });
        return user.id;
      }),
    );
    await new DocumentsDao(db).replaceOwners(campaignId, documentId, owners);

    const [row] = await dao().documentsIn(campaignId, [documentId]);

    expect([...(row?.ownerIds ?? [])].sort()).toEqual([...owners].sort());
  });

  it('documentsIn keeps the public visibility it reads', async () => {
    const { campaignId, documentId } = live.vharn;
    const db = live.connection.db;
    await db
      .update(libraryDocuments)
      .set({ visibility: 'public' })
      .where(eq(libraryDocuments.id, documentId));
    await expect(dao().documentsIn(campaignId, [documentId])).resolves.toMatchObject([
      { visibility: 'public' },
    ]);
  });

  it('scenesIn answers the id, the name and the visibility', async () => {
    const { campaignId, sceneId } = live.vharn;
    await live.connection.db
      .update(scenes)
      .set({ visibility: 'public' })
      .where(eq(scenes.id, sceneId));
    await expect(dao().scenesIn(campaignId, [sceneId])).resolves.toEqual([
      { id: sceneId, name: 'Salão', visibility: 'public', hiddenByFolder: false },
    ]);
  });

  it('mapsIn answers the id, the name, the visibility and the main mark', async () => {
    const { campaignId, otherMapId } = live.vharn;
    await live.maps.setMain(campaignId, otherMapId);
    await expect(dao().mapsIn(campaignId, [otherMapId])).resolves.toEqual([
      {
        id: otherMapId,
        name: 'Masmorra',
        visibility: 'private',
        isMain: true,
        hiddenByFolder: false,
      },
    ]);
  });

  it('imagesIn says the image is not being presented', async () => {
    const { campaignId, imageId } = live.vharn;
    await expect(dao().imagesIn(campaignId, [imageId])).resolves.toEqual([
      {
        id: imageId,
        name: 'Brasão',
        visibility: 'private',
        isPresented: false,
        hiddenByFolder: false,
      },
    ]);
  });

  it('imagesIn marks only the image being presented', async () => {
    const { campaignId, imageId } = live.vharn;
    const db = live.connection.db;
    const [other] = await db
      .insert(libraryImages)
      .values({ campaignId, assetId: await live.assetIdOf(campaignId), name: 'Outra' })
      .returning();
    const change = { presentationId: crypto.randomUUID(), imageId, nameAtPresentation: 'Brasão' };
    await new ImagePresentationsDao(db).save(campaignId, change, new Date());

    const rows = await dao().imagesIn(campaignId, [imageId, other?.id ?? '']);

    expect(rows.find(({ id }) => id === imageId)?.isPresented).toBe(true);
    expect(rows.find(({ id }) => id === other?.id)?.isPresented).toBe(false);
  });

  it('never answers an item of another table, of any kind', async () => {
    const { campaignId } = live.vharn;
    const { documentId, sceneId, otherMapId, imageId } = live.quelm;
    await expect(dao().documentsIn(campaignId, [documentId])).resolves.toEqual([]);
    await expect(dao().scenesIn(campaignId, [sceneId])).resolves.toEqual([]);
    await expect(dao().mapsIn(campaignId, [otherMapId])).resolves.toEqual([]);
    await expect(dao().imagesIn(campaignId, [imageId])).resolves.toEqual([]);
  });
});
