import { z } from 'zod';
import { savedRollNameKey } from '../dice/saved-roll.dto';
import { TOKEN_FORMS_MAX, tokenFormDto } from './token-form.dto';
import { TOKEN_NAME_MAX_LENGTH, createTokenCommandDto } from './token.dto';

/** Saved tokens one member keeps at one table (the technical ceiling; the plan may give fewer). */
export const SAVED_TOKENS_MAX = 50;
/** Folders of saved tokens one member keeps at one table: one level, no folder inside a folder. */
export const SAVED_TOKEN_FOLDERS_MAX = 20;
export const SAVED_TOKEN_FOLDER_NAME_MAX_LENGTH = 40;

/** The identity of a folder name: no accent, no case, no outer spaces (the saved rolls' rule).
 *
 *  Example: `savedTokenFolderNameKey(' Mortos-Vivos ') // 'mortos-vivos'` */
export const savedTokenFolderNameKey = savedRollNameKey;

/** A form of a saved token: the token's form without id (the spawn gives each copy new ids). */
export const savedTokenFormDto = tokenFormDto.omit({ id: true });
export type SavedTokenFormDto = z.infer<typeof savedTokenFormDto>;

// What a paste carries, minus what belongs to one copy on one grid: the place, the control, the
// combat entry and the veil.
const bodyShape = createTokenCommandDto.omit({
  actionId: true,
  campaignId: true,
  col: true,
  row: true,
  controllerIds: true,
}).shape;

/** The token a member saved, as the spawn sends it again: `activeForm` is the index of the form
 *  it shows (`null` = none).
 *
 *  Example: `savedTokenBodyDto.parse({ name: 'Zumbi', initials: 'ZB', side: 'enemy', width: 1, height: 1, bars: [] })` */
export const savedTokenBodyDto = z
  .strictObject({
    ...bodyShape,
    forms: z.array(savedTokenFormDto).max(TOKEN_FORMS_MAX).default([]),
    activeForm: z.number().int().nonnegative().nullable().default(null),
  })
  .superRefine((body, context) => {
    if (body.activeForm === null || body.activeForm < body.forms.length) return;
    context.addIssue({
      code: 'custom',
      path: ['activeForm'],
      message: `activeForm ${body.activeForm} is past the ${body.forms.length} form(s); expected an index below it or null`,
    });
  });
export type SavedTokenBodyDto = z.infer<typeof savedTokenBodyDto>;
export type SavedTokenBodyInput = z.input<typeof savedTokenBodyDto>;

/** The name of an entry of the list, trimmed, 1 to 60 characters (a token name). */
export const savedTokenNameDto = z.string().trim().min(1).max(TOKEN_NAME_MAX_LENGTH);

/** A saved token as its owner reads it.
 *
 *  Example: `savedTokenDto.parse({ id, name: 'Zumbi', folderId: null, token, planLocked: false })` */
export const savedTokenDto = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  folderId: z.uuid().nullable(),
  token: savedTokenBodyDto,
  /** Past the plan (`savedTokens`, by creation order among the member's): the name and the token
   *  are read only, while spawning, moving to a folder and deleting still pass. */
  planLocked: z.boolean(),
});
export type SavedTokenDto = z.infer<typeof savedTokenDto>;

/** Answer of `GET /campaigns/:campaignId/saved-tokens`: only the session's own, oldest first. */
export const savedTokensResponseDto = z.strictObject({ savedTokens: z.array(savedTokenDto) });
export type SavedTokensResponseDto = z.infer<typeof savedTokensResponseDto>;

/** Body of `POST /campaigns/:campaignId/saved-tokens`; the owner comes from the session.
 *
 *  Example: `createSavedTokenRequestDto.parse({ name: 'Zumbi', token })` */
export const createSavedTokenRequestDto = z.strictObject({
  name: savedTokenNameDto,
  folderId: z.uuid().nullable().optional(),
  token: savedTokenBodyDto,
});
export type CreateSavedTokenRequestDto = z.infer<typeof createSavedTokenRequestDto>;
export type CreateSavedTokenRequestInput = z.input<typeof createSavedTokenRequestDto>;

/** Body of `PATCH /campaigns/:campaignId/saved-tokens/:savedTokenId`: rename, move to a folder
 *  (`null` = out of any) and/or replace the token; at least one key.
 *
 *  Example: `updateSavedTokenRequestDto.parse({ folderId: null })` */
export const updateSavedTokenRequestDto = z
  .strictObject({
    name: savedTokenNameDto.optional(),
    folderId: z.uuid().nullable().optional(),
    token: savedTokenBodyDto.optional(),
  })
  .superRefine((changes, context) => {
    const { name, folderId, token } = changes;
    if (name !== undefined || folderId !== undefined || token !== undefined) return;
    context.addIssue({
      code: 'custom',
      message: 'changes is empty; expected at least one of name, folderId, token',
    });
  });
export type UpdateSavedTokenRequestDto = z.infer<typeof updateSavedTokenRequestDto>;
export type UpdateSavedTokenRequestInput = z.input<typeof updateSavedTokenRequestDto>;

/** Params of the routes of one saved token. */
export const savedTokenParamsDto = z.strictObject({
  campaignId: z.uuid(),
  savedTokenId: z.uuid(),
});

/** A folder of saved tokens as its owner reads it. */
export const savedTokenFolderDto = z.strictObject({ id: z.uuid(), name: z.string() });
export type SavedTokenFolderDto = z.infer<typeof savedTokenFolderDto>;

/** Answer of `GET /campaigns/:campaignId/saved-token-folders`: only the session's own. */
export const savedTokenFoldersResponseDto = z.strictObject({
  folders: z.array(savedTokenFolderDto),
});

/** Body of `POST /campaigns/:campaignId/saved-token-folders` and of the `PATCH` of one folder.
 *
 *  Example: `savedTokenFolderRequestDto.parse({ name: ' Mortos-vivos ' })` */
export const savedTokenFolderRequestDto = z.strictObject({
  name: z.string().trim().min(1).max(SAVED_TOKEN_FOLDER_NAME_MAX_LENGTH),
});
export type SavedTokenFolderRequestDto = z.infer<typeof savedTokenFolderRequestDto>;

/** Params of the routes of one folder of saved tokens. */
export const savedTokenFolderParamsDto = z.strictObject({
  campaignId: z.uuid(),
  folderId: z.uuid(),
});
