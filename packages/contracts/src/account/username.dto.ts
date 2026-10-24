import { z } from 'zod';

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

/** The stable name of a person's color (the ping and the initials); the hex lives in the client.
 *
 *  Example: `memberColorDto.parse('rose') // 'rose'` */
export const memberColorDto = z.enum(MEMBER_COLOR_NAMES);

export type MemberColorDto = z.infer<typeof memberColorDto>;
