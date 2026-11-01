import { z } from 'zod';

export const CHARACTER_NOTE_MAX = 80;
export const CHARACTER_STAT_MAX = 999;

/** A free text of a character (an annotation): trimmed, at most `maxLength`, and a text of only
 *  spaces clears it (`null`).
 *
 *  Example: `characterTextDto('noteOne', 80).parse('  ')` → `null` */
export function characterTextDto(field: string, maxLength: number) {
  return z
    .string()
    .trim()
    .superRefine((text, context) => {
      if (text.length <= maxLength) return;
      context.addIssue({
        code: 'custom',
        message: `${field} has ${text.length} characters; expected at most ${maxLength}`,
      });
    })
    .nullable()
    .transform((text) => (text ? text : null));
}

/** A number of the character's card (CA, CD): a whole number from 0 to `CHARACTER_STAT_MAX`.
 *
 *  Example: `characterStatDto('armorClass').parse(15)` → `15` */
export function characterStatDto(field: string) {
  return z
    .number()
    .superRefine((value, context) => {
      if (Number.isInteger(value) && value >= 0 && value <= CHARACTER_STAT_MAX) return;
      context.addIssue({
        code: 'custom',
        message: `${field} ${value} is invalid; expected a whole number from 0 to ${CHARACTER_STAT_MAX}`,
      });
    })
    .nullable();
}
