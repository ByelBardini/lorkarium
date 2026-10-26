import { z } from 'zod';
import { avatarLinkRequestDto } from './avatar.dto';

/** Side in pixels of the stored dice texture: the server crops the center into a still 512 × 512
 *  WebP (an animated GIF keeps only its first frame). The input limit and types are the photo's. */
export const DICE_TEXTURE_SIDE = 512;

/** The color of the numbers on one's dice: `#rrggbb`, kept in lowercase.
 *
 *  Example: `diceNumberColorDto.parse('#FFAA00') // '#ffaa00'` */
export const diceNumberColorDto = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^#[0-9a-f]{6}$/, { error: (issue) => `${String(issue.input)}: expected #rrggbb` });

export type DiceNumberColorDto = z.infer<typeof diceNumberColorDto>;

/** Body of `POST /api/account/dice-texture/link`: the same `{ url }` as the photo's link. */
export const diceTextureLinkRequestDto = avatarLinkRequestDto;

export type DiceTextureLinkRequestDto = z.infer<typeof diceTextureLinkRequestDto>;

/** Path params of `GET /api/dice-textures/:diceTextureId`. */
export const diceTextureParamsDto = z.strictObject({ diceTextureId: z.uuid() });

export type DiceTextureParamsDto = z.infer<typeof diceTextureParamsDto>;
