import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { libraryDocumentTabs } from '../../src/modules/documents/document-tabs.po';
import { libraryDocuments } from '../../src/modules/documents/documents.po';
import { useLibraryMapsTable, type FurnishedCampaign } from '../support/library-maps-table';

const live = useLibraryMapsTable();

async function addTab(campaign: FurnishedCampaign, name = 'Capítulo'): Promise<string> {
  const [tab] = await live.connection.db
    .insert(libraryDocumentTabs)
    .values({
      campaignId: campaign.campaignId,
      documentId: campaign.documentId,
      name,
      position: 50,
      content: {},
    })
    .returning();
  if (!tab) throw new Error('no tab inserted');
  return tab.id;
}

async function regionLinkedTo(tabId: string): Promise<string> {
  const map = await live.createMap(live.vharn);
  const region = await live.createRegion(live.vharn, map.id, {
    linkKind: 'document',
    targetDocumentId: live.vharn.documentId,
    targetDocumentTabId: tabId,
  });
  return region.id;
}

describe('a region linked to a tab of a document', () => {
  it('deleting the tab leaves the region linked to the document', async () => {
    const tabId = await addTab(live.vharn);
    const regionId = await regionLinkedTo(tabId);
    await live.connection.db.delete(libraryDocumentTabs).where(eq(libraryDocumentTabs.id, tabId));
    expect(await live.storedRegion(regionId)).toMatchObject({
      campaignId: live.vharn.campaignId,
      linkKind: 'document',
      targetDocumentId: live.vharn.documentId,
      targetDocumentTabId: null,
    });
  });

  it('deleting the document leaves "link removed", with no target left behind', async () => {
    const regionId = await regionLinkedTo(await addTab(live.vharn));
    await live.connection.db
      .delete(libraryDocuments)
      .where(eq(libraryDocuments.id, live.vharn.documentId));
    expect(await live.storedRegion(regionId)).toMatchObject({
      linkKind: 'document',
      targetDocumentId: null,
      targetDocumentTabId: null,
    });
  });

  it('the table refuses a tab of another campaign', async () => {
    const foreignTab = await addTab(live.quelm);
    await expect(regionLinkedTo(foreignTab)).rejects.toMatchObject({
      cause: { code: '23503', constraint: 'library_map_regions_target_document_tab_fk' },
    });
  });

  it('the table refuses a tab on a link of another kind', async () => {
    const tabId = await addTab(live.vharn);
    const map = await live.createMap(live.vharn);
    await expect(
      live.createRegion(live.vharn, map.id, {
        linkKind: 'scene',
        targetSceneId: live.vharn.sceneId,
        targetDocumentTabId: tabId,
      }),
    ).rejects.toMatchObject({
      cause: { code: '23514', constraint: 'library_map_regions_link_tab' },
    });
  });

  it('the appearances bring the name of the tab', async () => {
    const tabId = await addTab(live.vharn);
    await regionLinkedTo(tabId);
    const [row] = await live.regions.listAppearances(live.vharn.campaignId, live.vharn.documentId);
    expect(row).toMatchObject({ tabName: 'Capítulo', tabVisibility: 'document' });
  });

  it('documentTabsIn finds nothing through another campaign', async () => {
    const tabId = await addTab(live.vharn);
    const { MapLinkTargetsDao } =
      await import('../../src/modules/library-maps/map-link-targets.dao');
    const dao = new MapLinkTargetsDao(live.connection.db);
    await expect(dao.documentTabsIn(live.quelm.campaignId, [tabId])).resolves.toEqual([]);
    await expect(dao.documentTabsIn(live.vharn.campaignId, [tabId])).resolves.toMatchObject([
      { id: tabId, name: 'Capítulo', documentId: live.vharn.documentId },
    ]);
  });
});
