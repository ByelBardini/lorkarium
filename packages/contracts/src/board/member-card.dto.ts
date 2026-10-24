import { z } from 'zod';
import { boardCommandShape, boardEventShape } from './board-event.dto';

export const MEMBER_CARD_NAME_MAX = 40;
export const MEMBER_CARD_NOTE_MAX = 80;
export const MEMBER_CARD_STAT_MAX = 999;

const MEMBER_CARD_FIELDS = [
  'characterName',
  'armorClass',
  'difficultyClass',
  'noteOne',
  'noteTwo',
] as const;

function cardTextDto(field: string, maxLength: number) {
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

function cardStatDto(field: string) {
  return z
    .number()
    .superRefine((value, context) => {
      if (Number.isInteger(value) && value >= 0 && value <= MEMBER_CARD_STAT_MAX) return;
      context.addIssue({
        code: 'custom',
        message: `${field} ${value} is invalid; expected a whole number from 0 to ${MEMBER_CARD_STAT_MAX}`,
      });
    })
    .nullable();
}

/** A member's card on the table: what the party board shows besides the main token. Every
 *  field is `null` until someone writes it; a `null` name follows the main token's name.
 *
 *  Example: `memberCardDto.parse({ userId, characterName: null, armorClass: 15, … })` */
export const memberCardDto = z.strictObject({
  userId: z.uuid(),
  characterName: z.string().nullable(),
  armorClass: z.number().int().nullable(),
  difficultyClass: z.number().int().nullable(),
  noteOne: z.string().nullable(),
  noteTwo: z.string().nullable(),
  /** The anchor token of the member's character (in the table's cast); absent or `null` = none
   *  yet. The server always sends it. */
  anchorTokenId: z.uuid().nullable().optional(),
});
export type MemberCardDto = z.infer<typeof memberCardDto>;

/** The card fields to change: an absent field stays, `null` (or a text of only spaces) clears it.
 *
 *  Example: `memberCardChangesDto.parse({ characterName: ' Lyra ' })` → `{ characterName: 'Lyra' }` */
export const memberCardChangesDto = z
  .strictObject({
    characterName: cardTextDto('characterName', MEMBER_CARD_NAME_MAX).optional(),
    armorClass: cardStatDto('armorClass').optional(),
    difficultyClass: cardStatDto('difficultyClass').optional(),
    noteOne: cardTextDto('noteOne', MEMBER_CARD_NOTE_MAX).optional(),
    noteTwo: cardTextDto('noteTwo', MEMBER_CARD_NOTE_MAX).optional(),
  })
  .superRefine((changes, context) => {
    if (Object.keys(changes).length > 0) return;
    context.addIssue({
      code: 'custom',
      message: `changes is empty; expected at least one of ${MEMBER_CARD_FIELDS.join(', ')}`,
    });
  });
export type MemberCardChangesDto = z.infer<typeof memberCardChangesDto>;
export type MemberCardChangesInput = z.input<typeof memberCardChangesDto>;

/** `member:updateCard`: the owner or a master changes the card of `memberId`. Who asks comes
 *  from the connection, never from here (§7.3).
 *
 *  Example: `updateMemberCardCommandDto.parse({ actionId, campaignId, memberId, changes: { armorClass: 15 } })` */
export const updateMemberCardCommandDto = z.strictObject({
  ...boardCommandShape,
  memberId: z.uuid(),
  changes: memberCardChangesDto,
});
export type UpdateMemberCardCommandDto = z.infer<typeof updateMemberCardCommandDto>;

/** `member:cardChanged`: the whole card after the change, to the whole table, with a version. */
export const memberCardChangedDto = z.strictObject({ ...boardEventShape, card: memberCardDto });
export type MemberCardChangedDto = z.infer<typeof memberCardChangedDto>;
