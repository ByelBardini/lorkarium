import { and, eq, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import {
  sheetTemplates,
  type NewSheetTemplatePo,
  type SheetTemplateChangesPo,
  type SheetTemplatePo,
  type SheetTemplateSummaryPo,
} from './sheet-templates.po';

/** The sheet templates of a table; every query filters by the campaign (§2.6). */
export class SheetTemplatesDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async findInCampaign(
    campaignId: string,
    templateId: string,
  ): Promise<SheetTemplatePo | undefined> {
    const [row] = await this.db
      .select()
      .from(sheetTemplates)
      .where(this.oneOf(campaignId, templateId));
    return row;
  }

  /** The library rows, without the code, in creation order. */
  async listOfCampaign(campaignId: string): Promise<SheetTemplateSummaryPo[]> {
    const t = sheetTemplates;
    return this.db
      .select({
        id: t.id,
        campaignId: t.campaignId,
        folderId: t.folderId,
        name: t.name,
        version: t.version,
        updatedAt: t.updatedAt,
      })
      .from(t)
      .where(eq(t.campaignId, campaignId))
      .orderBy(t.createdAt, t.id);
  }

  async insert(input: NewSheetTemplatePo): Promise<SheetTemplatePo> {
    const [saved] = await this.db.insert(sheetTemplates).values(input).returning();
    if (!saved) throw new Error(`Sheet template for campaign ${input.campaignId} was not inserted`);
    return saved;
  }

  async update(
    campaignId: string,
    templateId: string,
    changes: SheetTemplateChangesPo,
  ): Promise<SheetTemplatePo> {
    const [saved] = await this.db
      .update(sheetTemplates)
      .set(changes)
      .where(this.oneOf(campaignId, templateId))
      .returning();
    if (!saved) throw new Error(`Sheet template ${templateId} of ${campaignId} was not updated`);
    return saved;
  }

  async delete(campaignId: string, templateId: string): Promise<void> {
    await this.db.delete(sheetTemplates).where(this.oneOf(campaignId, templateId));
  }

  /** The templates of a deleted folder go to its parent; the code did not change, so neither
   *  does the version an open editor saves against. */
  async moveFromFolder(
    campaignId: string,
    folderId: string,
    parentId: string | null,
  ): Promise<void> {
    await this.db
      .update(sheetTemplates)
      .set({ folderId: parentId, updatedAt: sql`now()` })
      .where(and(eq(sheetTemplates.campaignId, campaignId), eq(sheetTemplates.folderId, folderId)));
  }

  private oneOf(campaignId: string, templateId: string) {
    return and(eq(sheetTemplates.campaignId, campaignId), eq(sheetTemplates.id, templateId));
  }
}
