import { CAMPAIGN_TAGS_MAX, CAMPAIGN_TAG_MAX_LENGTH, campaignTagKey } from '@lorkarium/contracts';

/** Adds a typed tag: trimmed, and ignored when blank, too long, repeated (by `campaignTagKey`, so
 *  no case nor accent) or past `CAMPAIGN_TAGS_MAX`. Returns the same array when nothing changes.
 *
 *  Example: `addTag(['Mistério'], ' misterio ') // ['Mistério']` */
export function addTag(tags: readonly string[], typed: string): readonly string[] {
  const tag = typed.trim();
  if (!canAddTag(tags, tag)) return tags;
  return [...tags, tag];
}

/** Takes the last tag out (Backspace on the empty field); no tag leaves the same array.
 *
 *  Example: `removeLastTag(['Horror', 'Sandbox']) // ['Horror']` */
export function removeLastTag(tags: readonly string[]): readonly string[] {
  return tags.length === 0 ? tags : tags.slice(0, -1);
}

/** Takes one tag out by its spelling.
 *
 *  Example: `removeTag(['Horror', 'Sandbox'], 'Horror') // ['Sandbox']` */
export function removeTag(tags: readonly string[], tag: string): readonly string[] {
  return tags.filter((kept) => kept !== tag);
}

/** Whether one more tag fits (the field hides itself at the limit).
 *
 *  Example: `hasRoomForTag(eightTags) // false` */
export function hasRoomForTag(tags: readonly string[]): boolean {
  return tags.length < CAMPAIGN_TAGS_MAX;
}

function canAddTag(tags: readonly string[], tag: string): boolean {
  if (tag === '' || tag.length > CAMPAIGN_TAG_MAX_LENGTH) return false;
  if (!hasRoomForTag(tags)) return false;
  const key = campaignTagKey(tag);
  return !tags.some((existing) => campaignTagKey(existing) === key);
}
