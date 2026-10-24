import { stableHash } from './stable-hash';

/** How many cover drawings and tones exist; the contract's `campaignCoverDto` bounds match these. */
export const COVER_DRAWINGS = 3;
export const COVER_TONES = 4;

/** A drawn campaign cover: `drawing` 0..2 picks the art, `tone` 1..4 the `chart-1..4` color. */
export type DrawnCover = Readonly<{ drawing: number; tone: number }>;

/** The cover of a campaign that never chose one, drawn from its id so it looks the same on every
 *  screen and on the server (the same numbers the client's `coverFor` always gave).
 *
 *  Example: `defaultCoverOf(campaign.id) // { drawing: 1, tone: 3 }` */
export function defaultCoverOf(campaignId: string): DrawnCover {
  const hash = stableHash(campaignId);
  return { drawing: hash % COVER_DRAWINGS, tone: (hash % COVER_TONES) + 1 };
}
