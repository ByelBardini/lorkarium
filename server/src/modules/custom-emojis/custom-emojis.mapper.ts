import type { CustomEmojiDto, CustomEmojiListDto, PlanLimits } from '@lorkarium/contracts';
import { activeEmojiIdsOf } from './custom-emoji.bo';
import type { CustomEmojiPo } from './custom-emoji.po';

/** The content type of every stored picture (the avatar processor writes WebP). */
export const CUSTOM_EMOJI_CONTENT_TYPE = 'image/webp';

/** The bucket key of an emoji's picture: the animated one when it moves, else the only one.
 *
 *  Example: `customEmojiKeyOf(id) // 'custom-emojis/<id>'` */
export function customEmojiKeyOf(emojiId: string): string {
  return `custom-emojis/${emojiId}`;
}

/** The key of the first frame, kept beside an animated picture for a plan without animation.
 *
 *  Example: `stillCustomEmojiKeyOf(id) // 'custom-emojis/<id>-still'` */
export function stillCustomEmojiKeyOf(emojiId: string): string {
  return `custom-emojis/${emojiId}-still`;
}

/** Every key an emoji holds in the bucket.
 *
 *  Example: `customEmojiKeysOf({ id, animated: true }).length // 2` */
export function customEmojiKeysOf(emoji: Pick<CustomEmojiPo, 'id' | 'animated'>): string[] {
  const moving = customEmojiKeyOf(emoji.id);
  return emoji.animated ? [moving, stillCustomEmojiKeyOf(emoji.id)] : [moving];
}

/** The key served for the picture, by what the owner's plan allows now.
 *
 *  Example: `servedCustomEmojiKeyOf(gif, PLAN_LIMITS.narrador) // '<id>-still'` */
export function servedCustomEmojiKeyOf(
  emoji: Pick<CustomEmojiPo, 'id' | 'animated'>,
  limits: PlanLimits,
): string {
  const still = emoji.animated && !limits.animatedCustomEmojis;
  return still ? stillCustomEmojiKeyOf(emoji.id) : customEmojiKeyOf(emoji.id);
}

/** The account's emojis, oldest first, each marked active or not under the plan's ceiling.
 *
 *  Example: `toCustomEmojiList(rows, PLAN_LIMITS.apoiador).limit // 10` */
export function toCustomEmojiList(
  rows: readonly CustomEmojiPo[],
  limits: PlanLimits,
): CustomEmojiListDto {
  const active = activeEmojiIdsOf(rows, limits.maxCustomEmojis);
  return {
    emojis: rows.map((row) => toCustomEmojiDto(row, active.has(row.id), limits)),
    limit: limits.maxCustomEmojis,
  };
}

function toCustomEmojiDto(row: CustomEmojiPo, active: boolean, limits: PlanLimits): CustomEmojiDto {
  return {
    id: row.id,
    name: row.name,
    animated: row.animated && limits.animatedCustomEmojis,
    active,
    createdAt: row.createdAt.toISOString(),
  };
}
