import { z } from 'zod';

export const CAMPAIGN_TAGS_MAX = 8;
export const CAMPAIGN_TAG_MAX_LENGTH = 24;

/** The identity of a tag: no accent, no case, no outer spaces, so "Horror" and "horror " repeat.
 *
 *  Example: `campaignTagKey(' Mistério ') // 'misterio'` */
export function campaignTagKey(tag: string): string {
  return tag
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** The tags without repeats (by `campaignTagKey`), keeping the first spelling and the order.
 *
 *  Example: `uniqueCampaignTags(['Horror', 'horror']) // ['Horror']` */
export function uniqueCampaignTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = campaignTagKey(tag);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Free tags of a campaign: trimmed, 1 to 24 characters, repeats dropped, then at most 8.
 *
 *  Example: `campaignTagsDto.parse([' sandbox', 'Sandbox']) // ['sandbox']` */
export const campaignTagsDto = z
  .array(z.string().trim().min(1).max(CAMPAIGN_TAG_MAX_LENGTH))
  .transform(uniqueCampaignTags)
  .pipe(z.array(z.string()).max(CAMPAIGN_TAGS_MAX));
