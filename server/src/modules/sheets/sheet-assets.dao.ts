import { and, eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { sheetAssets } from './sheet-assets.po';

const t = sheetAssets;

/** Which sheets an image was sent to; always filtered by the campaign (critério 14).
 *
 *  Example: `await new SheetAssetsDao(tx).associate(campaignId, sheetId, assetId)` */
export class SheetAssetsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Ties the image to the sheet; tying it twice changes nothing. */
  async associate(campaignId: string, sheetId: string, assetId: string): Promise<void> {
    await this.db.insert(t).values({ campaignId, sheetId, assetId }).onConflictDoNothing();
  }

  async sheetsOfAsset(campaignId: string, assetId: string): Promise<string[]> {
    const rows = await this.db
      .select({ sheetId: t.sheetId })
      .from(t)
      .where(and(eq(t.campaignId, campaignId), eq(t.assetId, assetId)));
    return rows.map((row) => row.sheetId);
  }
}
