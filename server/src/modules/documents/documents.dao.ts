import { and, eq, exists, getTableColumns, or, sql } from 'drizzle-orm';
import { hiddenByFolderSql } from '../../database/hidden-by-folder-sql';
import type { DatabaseExecutor } from '../../database/transaction';
import {
  libraryDocuments,
  libraryDocumentOwners,
  libraryDocumentActions,
  type DocumentPo,
  type NewDocumentPo,
  type DocumentChangesPo,
  type DocumentActionPo,
} from './documents.po';
import { libraryDocumentAssets } from './document-assets.po';

export type DocumentSummaryPo = Omit<DocumentPo, 'createdBy' | 'createdAt'>;
/** A document as its gates read it: the row and whether a private folder above it hides it. */
export type DocumentRow = DocumentPo & Readonly<{ hiddenByFolder: boolean }>;
const HIDDEN_BY_FOLDER = hiddenByFolderSql('"library_documents"."folder_id"');
export class DocumentsDao {
  constructor(private readonly db: DatabaseExecutor) {}
  async findInCampaign(campaignId: string, documentId: string): Promise<DocumentRow | undefined> {
    const [row] = await this.db
      .select({ ...getTableColumns(libraryDocuments), hiddenByFolder: HIDDEN_BY_FOLDER })
      .from(libraryDocuments)
      .where(and(eq(libraryDocuments.campaignId, campaignId), eq(libraryDocuments.id, documentId)));
    return row;
  }
  /** The documents that show `assetId`, as their library cover or in a tab, as their gates read
   *  them: one query for the image read, which asks nothing more when no document has it. */
  async withAsset(campaignId: string, assetId: string): Promise<DocumentRow[]> {
    const d = libraryDocuments;
    const a = libraryDocumentAssets;
    const inATab = this.db
      .select({ one: sql`1` })
      .from(a)
      .where(and(eq(a.campaignId, campaignId), eq(a.documentId, d.id), eq(a.assetId, assetId)));
    return this.db
      .select({ ...getTableColumns(d), hiddenByFolder: HIDDEN_BY_FOLDER })
      .from(d)
      .where(and(eq(d.campaignId, campaignId), or(eq(d.previewAssetId, assetId), exists(inATab))));
  }
  /** The library lines of the table, without the folder chain: the caller decides it over the
   *  folders it already read. */
  async listOfCampaign(campaignId: string): Promise<DocumentSummaryPo[]> {
    const t = libraryDocuments;
    return this.db
      .select({
        id: t.id,
        campaignId: t.campaignId,
        folderId: t.folderId,
        name: t.name,
        visibility: t.visibility,
        previewSummary: t.previewSummary,
        previewAssetId: t.previewAssetId,
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
