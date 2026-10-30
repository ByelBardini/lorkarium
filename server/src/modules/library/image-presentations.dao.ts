import { eq, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { libraryImagePresentations, type ImagePresentationPo } from './image-presentations.po';
export type PresentationChange = Readonly<{
  presentationId: string;
  imageId: string;
  nameAtPresentation: string;
}> | null;
export class ImagePresentationsDao {
  constructor(private readonly db: DatabaseExecutor) {}
  async findOfCampaign(campaignId: string): Promise<ImagePresentationPo | undefined> {
    const [row] = await this.db
      .select()
      .from(libraryImagePresentations)
      .where(eq(libraryImagePresentations.campaignId, campaignId));
    return row;
  }
  async save(
    campaignId: string,
    change: PresentationChange,
    changedAt: Date,
  ): Promise<ImagePresentationPo> {
    const fields = {
      presentationId: change?.presentationId ?? null,
      imageId: change?.imageId ?? null,
      nameAtPresentation: change?.nameAtPresentation ?? null,
      changedAt,
    };
    const [saved] = await this.db
      .insert(libraryImagePresentations)
      .values({ campaignId, version: 1, ...fields })
      .onConflictDoUpdate({
        target: libraryImagePresentations.campaignId,
        set: { ...fields, version: sql`${libraryImagePresentations.version} + 1` },
      })
      .returning();
    if (!saved) throw new Error(`Presentation save returned no row for campaign ${campaignId}`);
    return saved;
  }
}
