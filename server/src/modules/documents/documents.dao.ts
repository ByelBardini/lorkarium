import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import {
  libraryDocuments,
  libraryDocumentOwners,
  libraryDocumentAssets,
  libraryDocumentActions,
  type DocumentPo,
  type NewDocumentPo,
  type DocumentChangesPo,
  type DocumentActionPo,
} from './documents.po';

export type DocumentSummaryPo = Omit<
  DocumentPo,
  'content' | 'schemaVersion' | 'createdBy' | 'createdAt'
>;
export class DocumentsDao {
  constructor(private readonly db: DatabaseExecutor) {}
  async findInCampaign(campaignId: string, documentId: string): Promise<DocumentPo | undefined> {
    const [row] = await this.db
      .select()
      .from(libraryDocuments)
      .where(and(eq(libraryDocuments.campaignId, campaignId), eq(libraryDocuments.id, documentId)));
    return row;
  }
  async listOfCampaign(campaignId: string): Promise<DocumentSummaryPo[]> {
    const t = libraryDocuments;
    return this.db
      .select({
        id: t.id,
        campaignId: t.campaignId,
        folderId: t.folderId,
        name: t.name,
        visibility: t.visibility,
        version: t.version,
        updatedAt: t.updatedAt,
      })
      .from(t)
      .where(eq(t.campaignId, campaignId))
      .orderBy(t.createdAt, t.id);
  }
  async insert(input: NewDocumentPo): Promise<DocumentPo> {
    const [saved] = await this.db.insert(libraryDocuments).values(input).returning();
    if (!saved) throw new Error(`Document for campaign ${input.campaignId} was not inserted`);
    return saved;
  }
  async update(
    campaignId: string,
    documentId: string,
    changes: DocumentChangesPo,
  ): Promise<DocumentPo> {
    const [saved] = await this.db
      .update(libraryDocuments)
      .set(changes)
      .where(and(eq(libraryDocuments.campaignId, campaignId), eq(libraryDocuments.id, documentId)))
      .returning();
    if (!saved) throw new Error(`Document ${documentId} in campaign ${campaignId} was not updated`);
    return saved;
  }
  async delete(campaignId: string, documentId: string): Promise<void> {
    await this.db
      .delete(libraryDocuments)
      .where(and(eq(libraryDocuments.campaignId, campaignId), eq(libraryDocuments.id, documentId)));
  }
  async moveFromFolder(
    campaignId: string,
    folderId: string,
    parentId: string | null,
  ): Promise<void> {
    await this.db
      .update(libraryDocuments)
      .set({
        folderId: parentId,
        version: sql`${libraryDocuments.version} + 1`,
        updatedAt: sql`now()`,
      })
      .where(
        and(eq(libraryDocuments.campaignId, campaignId), eq(libraryDocuments.folderId, folderId)),
      );
  }
  async ownersOfCampaign(
    campaignId: string,
  ): Promise<(typeof libraryDocumentOwners.$inferSelect)[]> {
    return this.db
      .select()
      .from(libraryDocumentOwners)
      .where(eq(libraryDocumentOwners.campaignId, campaignId));
  }
  async owners(campaignId: string, documentId: string): Promise<string[]> {
    const rows = await this.db
      .select()
      .from(libraryDocumentOwners)
      .where(
        and(
          eq(libraryDocumentOwners.campaignId, campaignId),
          eq(libraryDocumentOwners.documentId, documentId),
        ),
      );
    return rows.map((row) => row.userId);
  }
  async replaceOwners(
    campaignId: string,
    documentId: string,
    ownerIds: readonly string[],
  ): Promise<void> {
    await this.db
      .delete(libraryDocumentOwners)
      .where(
        and(
          eq(libraryDocumentOwners.campaignId, campaignId),
          eq(libraryDocumentOwners.documentId, documentId),
        ),
      );
    if (ownerIds.length)
      await this.db
        .insert(libraryDocumentOwners)
        .values(ownerIds.map((userId) => ({ campaignId, documentId, userId })));
  }
  async references(
    campaignId: string,
    documentId: string,
  ): Promise<(typeof libraryDocumentAssets.$inferSelect)[]> {
    return this.db
      .select()
      .from(libraryDocumentAssets)
      .where(
        and(
          eq(libraryDocumentAssets.campaignId, campaignId),
          eq(libraryDocumentAssets.documentId, documentId),
        ),
      );
  }
  async documentsForAsset(
    campaignId: string,
    assetId: string,
  ): Promise<(typeof libraryDocumentAssets.$inferSelect)[]> {
    return this.db
      .select()
      .from(libraryDocumentAssets)
      .where(
        and(
          eq(libraryDocumentAssets.campaignId, campaignId),
          eq(libraryDocumentAssets.assetId, assetId),
        ),
      );
  }
  async associateAsset(campaignId: string, documentId: string, assetId: string): Promise<void> {
    await this.db
      .insert(libraryDocumentAssets)
      .values({ campaignId, documentId, assetId })
      .onConflictDoNothing();
  }
  async confirmAssets(
    campaignId: string,
    documentId: string,
    assetIds: readonly string[],
  ): Promise<void> {
    const where = and(
      eq(libraryDocumentAssets.campaignId, campaignId),
      eq(libraryDocumentAssets.documentId, documentId),
    );
    await this.db.update(libraryDocumentAssets).set({ inContent: false }).where(where);
    if (assetIds.length)
      await this.db
        .update(libraryDocumentAssets)
        .set({ inContent: true })
        .where(and(where, inArray(libraryDocumentAssets.assetId, [...assetIds])));
  }
  async action(
    campaignId: string,
    userId: string,
    actionId: string,
  ): Promise<DocumentActionPo | undefined> {
    const [row] = await this.db
      .select()
      .from(libraryDocumentActions)
      .where(
        and(
          eq(libraryDocumentActions.campaignId, campaignId),
          eq(libraryDocumentActions.userId, userId),
          eq(libraryDocumentActions.actionId, actionId),
        ),
      );
    return row;
  }
  async recordAction(input: DocumentActionPo): Promise<void> {
    await this.db.insert(libraryDocumentActions).values(input);
  }
}
