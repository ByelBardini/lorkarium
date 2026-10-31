import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { campaigns } from '../../src/modules/campaigns/campaigns.po';
import {
  libraryDocumentActions,
  libraryDocumentAssets,
  libraryDocumentOwners,
  libraryDocuments,
} from '../../src/modules/documents/documents.po';
import { SceneFoldersDao } from '../../src/modules/library/scene-folders.dao';
import { DocumentHttpHarness } from '../support/document-http';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();
const documents = new DocumentHttpHarness(live);
describe('document database campaign constraints', () => {
  it('rejects a folder of campaign B in a document of campaign A', async () => {
    const document = await documents.create();
    const foreign = await new SceneFoldersDao(live.connection.db).insert({
      campaignId: live.quelm.id,
      name: 'Outra mesa',
    });
    await expect(
      live.connection.db
        .update(libraryDocuments)
        .set({ folderId: foreign.id })
        .where(eq(libraryDocuments.id, document.id)),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
    expect(await documents.read(document.id)).toMatchObject({ folderId: null, version: 0 });
  });
  it('rejects an owner without membership in the document campaign', async () => {
    const document = await documents.create();
    const outsider = await live.signUp('Duda');
    await live.joinAsSpectator(outsider, live.quelm);
    await expect(
      live.connection.db
        .insert(libraryDocumentOwners)
        .values({ campaignId: live.vharn.id, documentId: document.id, userId: outsider.id }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
    expect((await documents.read(document.id)).ownerIds).toEqual([]);
  });
  it('rejects a reference to an asset of campaign B in a document of campaign A', async () => {
    const document = await documents.create();
    const asset = await live.sendImage(live.caio, live.quelm);
    await expect(
      live.connection.db
        .insert(libraryDocumentAssets)
        .values({ campaignId: live.vharn.id, documentId: document.id, assetId: asset.id }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
    expect(await live.connection.db.select().from(libraryDocumentAssets)).toEqual([]);
  });
  it('rejects owner and asset associations addressed using a different document campaign', async () => {
    const document = await documents.create();
    const asset = await live.sendImage(live.caio, live.quelm);
    await expect(
      live.connection.db
        .insert(libraryDocumentOwners)
        .values({ campaignId: live.quelm.id, documentId: document.id, userId: live.caio.id }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
    await expect(
      live.connection.db
        .insert(libraryDocumentAssets)
        .values({ campaignId: live.quelm.id, documentId: document.id, assetId: asset.id }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
  });
  it('cascades documents, owners, references and receipts when the campaign is deleted', async () => {
    const document = await documents.administer(await documents.create(), {
      ownerIds: [live.bia.id],
    });
    const asset = await live.sendImage(live.ana, live.vharn);
    await live.connection.db
      .insert(libraryDocumentAssets)
      .values({ campaignId: live.vharn.id, documentId: document.id, assetId: asset.id });
    expect((await live.connection.db.select().from(libraryDocumentActions)).length).toBe(2);
    await live.connection.db.delete(campaigns).where(eq(campaigns.id, live.vharn.id));
    expect(await live.connection.db.select().from(libraryDocuments)).toEqual([]);
    expect(await live.connection.db.select().from(libraryDocumentOwners)).toEqual([]);
    expect(await live.connection.db.select().from(libraryDocumentAssets)).toEqual([]);
    expect(await live.connection.db.select().from(libraryDocumentActions)).toEqual([]);
  });
});
