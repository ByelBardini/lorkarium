import { z } from 'zod';
import { paletteOrHexDto } from '../color/hex-color.dto';

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

/** The @ of an account: unique and immutable, trimmed and lowercased before it is checked.
 *
 *  Example: `usernameDto.parse(' Bia.Rola ') // 'bia.rola'` */
export const usernameDto = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .min(USERNAME_MIN_LENGTH, {
        error: (issue) =>
          `Username "${String(issue.input)}" is too short: expected ${USERNAME_MIN_LENGTH} to ${USERNAME_MAX_LENGTH} characters.`,
      })
      .max(USERNAME_MAX_LENGTH, {
        error: (issue) =>
          `Username "${String(issue.input)}" is too long: expected ${USERNAME_MIN_LENGTH} to ${USERNAME_MAX_LENGTH} characters.`,
      })
      .regex(/^[a-z0-9._]+$/, {
        error: (issue) =>
          `Username "${String(issue.input)}" has a character out of the format: expected only a-z 0-9 . _`,
      }),
  );

export type UsernameDto = z.infer<typeof usernameDto>;

// Repeats `MEMBER_COLORS` of the game-core, in the same order: contracts depends only on zod, so it
// cannot import it. The server maps one to the other; a spec on each side pins the order.
export const MEMBER_COLOR_NAMES = [
  'gold',
  'steel',
  'ember',
  'moss',
  'violet',
  'rose',
  'teal',
  'bone',
] as const;

/** One name of the fixed palette of a person's color, for the exhaustive readers.
 *
 *  Example: `memberPaletteDto.parse('rose') // 'rose'` */
export const memberPaletteDto = z.enum(MEMBER_COLOR_NAMES);

export type MemberPaletteDto = z.infer<typeof memberPaletteDto>;

/** A person's color (the ping and the initials): a stable name, whose tone lives in the client, or
 *  a custom hex.
 *
 *  Example: `memberColorDto.parse('#FFAA00') // '#ffaa00'` */
export const memberColorDto = paletteOrHexDto(MEMBER_COLOR_NAMES);

export type MemberColorDto = z.infer<typeof memberColorDto>;
