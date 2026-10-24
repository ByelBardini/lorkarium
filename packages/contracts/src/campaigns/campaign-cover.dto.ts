import { z } from 'zod';

// The bounds match `COVER_DRAWINGS` (3) and `COVER_TONES` (4) of the game-core, which draws the
// default cover; contracts depends only on zod, so the numbers are repeated here.
const COVER_DRAWING_MAX = 2;
const COVER_TONE_MAX = 4;

/** A cover drawn by the client: one of the drawings in one of the `chart-1..4` tones. */
export const drawnCampaignCoverDto = z.strictObject({
  kind: z.literal('drawn'),
  drawing: z.number().int().min(0).max(COVER_DRAWING_MAX),
  tone: z.number().int().min(1).max(COVER_TONE_MAX),
});

export type DrawnCampaignCoverDto = z.infer<typeof drawnCampaignCoverDto>;

/** A cover from an image the master sent to the campaign (`purpose = cover`). */
export const imageCampaignCoverDto = z.strictObject({
  kind: z.literal('image'),
  assetId: z.uuid(),
});

/** The campaign cover, drawn or an image; a campaign that never chose gets its id's drawing.
 *
 *  Example: `campaignCoverDto.parse({ kind: 'drawn', drawing: 1, tone: 3 })` */
export const campaignCoverDto = z.discriminatedUnion('kind', [
  drawnCampaignCoverDto,
  imageCampaignCoverDto,
]);

export type CampaignCoverDto = z.infer<typeof campaignCoverDto>;
