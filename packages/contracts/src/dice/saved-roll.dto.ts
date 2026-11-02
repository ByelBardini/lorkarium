import { z } from 'zod';
import { DICE_ROLL_LABEL_MAX_LENGTH, DICE_ROLL_PARTS_MAX, diceRollPartDto } from './dice.dto';

/** A saved roll's name becomes the roll label, so both share the ceiling. */
export const SAVED_ROLL_NAME_MAX_LENGTH = DICE_ROLL_LABEL_MAX_LENGTH;
/** Saved rolls one member keeps at one table. */
export const SAVED_ROLLS_MAX = 50;
/** Folders one member keeps at one table: one level, no folder inside a folder. */
export const SAVED_ROLL_FOLDERS_MAX = 50;

/** The identity of a saved roll name: no accent, no case, no outer spaces, so "Acerto" and
 *  " acérto" repeat for the same member.
 *
 *  Example: `savedRollNameKey(' Bênção ') // 'bencao'` */
export function savedRollNameKey(name: string): string {
  return name
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** A saved roll name: trimmed, 1 to 40 characters. */
export const savedRollNameDto = z.string().trim().min(1).max(SAVED_ROLL_NAME_MAX_LENGTH);

/** The pieces a saved roll sums, 1 to 10 (a copy, never a reference to another saved roll). */
export const savedRollPartsDto = z.array(diceRollPartDto).min(1).max(DICE_ROLL_PARTS_MAX);

/** A saved roll as its owner reads it.
 *
 *  Example: `savedRollDto.parse({ id, name: 'Acerto', parts: [{ label: null, expression: '1d20+5' }] })` */
export const savedRollDto = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  folderId: z.uuid().nullable(),
  parts: z.array(z.strictObject({ label: z.string().nullable(), expression: z.string() })),
});
export type SavedRollDto = z.infer<typeof savedRollDto>;

/** Answer of `GET /campaigns/:campaignId/saved-rolls`: only the session's own, oldest first. */
export const savedRollsResponseDto = z.strictObject({ savedRolls: z.array(savedRollDto) });
export type SavedRollsResponseDto = z.infer<typeof savedRollsResponseDto>;

/** Body of `POST /campaigns/:campaignId/saved-rolls`; the owner comes from the session.
 *
 *  Example: `createSavedRollRequestDto.parse({ name: ' Acerto ', parts: [{ label: null, expression: '1d20+5' }] })` */
export const createSavedRollRequestDto = z.strictObject({
  name: savedRollNameDto,
  folderId: z.uuid().nullable().optional(),
  parts: savedRollPartsDto,
});
export type CreateSavedRollRequestDto = z.infer<typeof createSavedRollRequestDto>;

/** Body of `PATCH /campaigns/:campaignId/saved-rolls/:savedRollId`: rename, replace the pieces
 *  and/or move to a folder (`null` = out of any); at least one key.
 *
 *  Example: `updateSavedRollRequestDto.parse({ name: 'Acerto com espada' })` */
export const updateSavedRollRequestDto = z
  .strictObject({
    name: savedRollNameDto.optional(),
    folderId: z.uuid().nullable().optional(),
    parts: savedRollPartsDto.optional(),
  })
  .superRefine((changes, context) => {
    const { name, folderId, parts } = changes;
    if (name !== undefined || folderId !== undefined || parts !== undefined) return;
    context.addIssue({
      code: 'custom',
      message: 'changes is empty; expected at least one of name, folderId, parts',
    });
  });
export type UpdateSavedRollRequestDto = z.infer<typeof updateSavedRollRequestDto>;

/** Params of the routes of one saved roll. */
export const savedRollParamsDto = z.strictObject({ campaignId: z.uuid(), savedRollId: z.uuid() });

/** A folder of saved rolls as its owner reads it.
 *
 *  Example: `savedRollFolderDto.parse({ id, name: 'Magias' })` */
export const savedRollFolderDto = z.strictObject({ id: z.uuid(), name: z.string() });
export type SavedRollFolderDto = z.infer<typeof savedRollFolderDto>;

/** Answer of `GET /campaigns/:campaignId/saved-roll-folders`: only the session's own, oldest first. */
export const savedRollFoldersResponseDto = z.strictObject({
  folders: z.array(savedRollFolderDto),
});

/** Body of `POST /campaigns/:campaignId/saved-roll-folders` and of the `PATCH` of one folder.
 *
 *  Example: `savedRollFolderRequestDto.parse({ name: ' Magias ' })` */
export const savedRollFolderRequestDto = z.strictObject({ name: savedRollNameDto });
export type SavedRollFolderRequestDto = z.infer<typeof savedRollFolderRequestDto>;

/** Params of the routes of one folder. */
export const savedRollFolderParamsDto = z.strictObject({
  campaignId: z.uuid(),
  folderId: z.uuid(),
});
