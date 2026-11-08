import { z } from 'zod';
import { hexColorDto } from '../color/hex-color.dto';

// The bounds match `COVER_DRAWINGS` (3) and `COVER_TONES` (4) of the game-core, which draws the
// default cover; contracts depends only on zod, so the numbers are repeated here.
const COVER_DRAWING_MAX = 2;
const COVER_TONE_MAX = 4;

/** The tone of a drawn cover: one of the `chart-1..4` tones by number, or a custom color.
 *
 *  Example: `campaignCoverToneDto.parse('#336699') // '#336699'` */
export const campaignCoverToneDto = z.union([
  z.number().int().min(1).max(COVER_TONE_MAX),
  hexColorDto,
]);

export type CampaignCoverToneDto = z.infer<typeof campaignCoverToneDto>;

/** A cover drawn by the client: one of the drawings in a chart tone or a custom color. */
export const drawnCampaignCoverDto = z.strictObject({
  kind: z.literal('drawn'),
  drawing: z.number().int().min(0).max(COVER_DRAWING_MAX),
  tone: campaignCoverToneDto,
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
