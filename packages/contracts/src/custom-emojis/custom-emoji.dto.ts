import { z } from 'zod';
import { isCatalogEmoteName } from '../emotes/emote-catalog';

/** 2 MiB: the largest picture `POST /api/account/custom-emojis` accepts, before decoding. */
export const CUSTOM_EMOJI_MAX_BYTES = 2 * 1024 * 1024;

/** Side in pixels of the stored picture: a square, cropped by the client (1:1). */
export const CUSTOM_EMOJI_SIDE = 128;

/** How many custom emojis one message carries at most (the codes past it stay text). */
export const CUSTOM_EMOJIS_PER_MESSAGE_MAX = 20;

/** The picture types the server reads; a GIF stays animated only on a plan with
 *  `animatedCustomEmojis`. */
export const CUSTOM_EMOJI_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

/** The name written between colons, as typed in the message (`:festa:`). */
export const CUSTOM_EMOJI_NAME_PATTERN = /^[a-z0-9_]{2,32}$/u;

const namePattern = z
  .string()
  .regex(CUSTOM_EMOJI_NAME_PATTERN, 'expected 2 to 32 of a-z, 0-9 or _');

/** A name the account may give its emoji: the pattern, and none of the catalog (`doge`).
 *
 *  Example: `customEmojiNameDto.safeParse('doge').success // false` */
export const customEmojiNameDto = namePattern.refine((name) => !isCatalogEmoteName(name), {
  message: 'expected a name outside the emote catalog',
});

/** Query of `POST /api/account/custom-emojis` (the body is the picture itself).
 *
 *  Example: `customEmojiCreateQueryDto.parse({ name: 'festa' })` */
export const customEmojiCreateQueryDto = z.strictObject({ name: customEmojiNameDto });
export type CustomEmojiCreateQueryDto = z.infer<typeof customEmojiCreateQueryDto>;

/** Body of `PATCH /api/account/custom-emojis/:emojiId`.
 *
 *  Example: `customEmojiRenameDto.parse({ name: 'festa2' })` */
export const customEmojiRenameDto = z.strictObject({ name: customEmojiNameDto });
export type CustomEmojiRenameDto = z.infer<typeof customEmojiRenameDto>;

/** Path params of the routes of one emoji (own, admin, and the picture). */
export const customEmojiParamsDto = z.strictObject({ emojiId: z.uuid() });
export type CustomEmojiParamsDto = z.infer<typeof customEmojiParamsDto>;

/** Path params of `DELETE /api/admin/users/:userId/custom-emojis/:emojiId`. */
export const adminCustomEmojiParamsDto = z.strictObject({ userId: z.uuid(), emojiId: z.uuid() });
export type AdminCustomEmojiParamsDto = z.infer<typeof adminCustomEmojiParamsDto>;

/** One emoji of the account. `active` is false past the plan's ceiling (the newest ones): kept,
 *  but no message draws it. `animated` is what the picture is now, for the owner's plan.
 *
 *  Example: `customEmojiDto.parse(row).active` */
export const customEmojiDto = z.strictObject({
  id: z.uuid(),
  name: namePattern,
  animated: z.boolean(),
  active: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type CustomEmojiDto = z.infer<typeof customEmojiDto>;

/** Answer of `GET /api/account/custom-emojis` and of every change: the emojis, oldest first,
 *  and the plan's ceiling (`null` = none).
 *
 *  Example: `customEmojiListDto.parse(body).emojis.filter((emoji) => emoji.active)` */
export const customEmojiListDto = z.strictObject({
  emojis: z.array(customEmojiDto),
  limit: z.number().int().nonnegative().nullable(),
});
export type CustomEmojiListDto = z.infer<typeof customEmojiListDto>;

/** A custom emoji a message uses: its `:name:` and the picture (`GET /api/custom-emojis/:id`). */
export const customEmojiRefDto = z.strictObject({ name: namePattern, emojiId: z.uuid() });
export type CustomEmojiRefDto = z.infer<typeof customEmojiRefDto>;

/** The custom emojis of one message, from the sender's account, resolved by the server.
 *
 *  Example: `customEmojiRefsDto.parse([{ name: 'festa', emojiId }])` */
export const customEmojiRefsDto = z.array(customEmojiRefDto).max(CUSTOM_EMOJIS_PER_MESSAGE_MAX);
export type CustomEmojiRefsDto = z.infer<typeof customEmojiRefsDto>;

/** The error codes of the custom emoji routes. */
export const CUSTOM_EMOJI_ERROR_CODES = {
  notFound: 'CUSTOM_EMOJI_NOT_FOUND',
  nameTaken: 'CUSTOM_EMOJI_NAME_TAKEN',
  tooLarge: 'CUSTOM_EMOJI_TOO_LARGE',
} as const;
