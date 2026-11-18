import { and, count, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DatabaseExecutor } from '../../database/transaction';
import { tokenSheets } from './sheets.po';
import {
  sheetTemplates,
  type NewSheetTemplatePo,
  type SheetTemplateChangesPo,
  type SheetTemplatePo,
  type SheetTemplateSummaryPo,
} from './sheet-templates.po';

// The template being ranked, joined to the templates of its table born before it.
const rankedTemplate = alias(sheetTemplates, 'ranked_template');

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

  /** How many templates the table has, what the owner's plan limits.
   *
   *  Example: `await dao.countOfCampaign(campaignId) // 1` */
  async countOfCampaign(campaignId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(sheetTemplates)
      .where(eq(sheetTemplates.campaignId, campaignId));
    return row?.total ?? 0;
  }

  /** How many templates of the table were born before this one, by `(created_at, id)`: what the
   *  owner's plan ranks it by (`PlanLimitsBo.requireEditable`). Call it on the `tx` DAO after the
   *  lock of the write; a template of another table or a missing one counts 0.
   *
   *  Example: `await dao.rankOf(campaignId, templateId) // 1: the 2nd template` */
  async rankOf(campaignId: string, templateId: string): Promise<number> {
    const t = sheetTemplates;
    const ranked = and(
      eq(rankedTemplate.campaignId, campaignId),
      eq(rankedTemplate.id, templateId),
    );
    const [row] = await this.db
      .select({ total: count() })
      .from(t)
      .innerJoin(rankedTemplate, ranked)
      .where(
        and(
          eq(t.campaignId, campaignId),
          sql`(${t.createdAt}, ${t.id}) < (${rankedTemplate.createdAt}, ${rankedTemplate.id})`,
        ),
      );
    return row?.total ?? 0;
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

  /** The sheets of the table whose template's manifest declares `assetId` (the JSONB `@>` of
   *  `manifest -> 'assets'`), in creation order: who reads one of them reads the asset.
   *
   *  Example: `await templates.sheetIdsUsingAsset(vharnId, fontId) // ['<lyra sheet>']` */
  async sheetIdsUsingAsset(campaignId: string, assetId: string): Promise<string[]> {
    const declared = JSON.stringify([{ assetId }]);
    const rows = await this.db
      .select({ id: tokenSheets.id })
      .from(tokenSheets)
      .innerJoin(
        sheetTemplates,
        and(
          eq(sheetTemplates.campaignId, tokenSheets.campaignId),
          eq(sheetTemplates.id, tokenSheets.templateId),
        ),
      )
      .where(
        and(
          eq(tokenSheets.campaignId, campaignId),
          sql`${sheetTemplates.manifest} -> 'assets' @> ${declared}::jsonb`,
        ),
      )
      .orderBy(tokenSheets.createdAt, tokenSheets.id);
    return rows.map(({ id }) => id);
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
