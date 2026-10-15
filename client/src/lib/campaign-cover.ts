export const COVER_VARIANTS = 3;
export const COVER_TONES = 4;

/** Which decorative cover a campaign gets: `variant` picks the drawing, `tone` the `chart-1..4` color. */
export type CampaignCover = Readonly<{ variant: number; tone: number }>;

/** A stable cover for a campaign id, so the same campaign looks the same everywhere.
 *
 *  Example: `coverFor(campaign.id) // { variant: 1, tone: 3 }` */
export function coverFor(campaignId: string): CampaignCover {
  let hash = 0;
  for (const char of campaignId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return { variant: hash % COVER_VARIANTS, tone: (hash % COVER_TONES) + 1 };
}
