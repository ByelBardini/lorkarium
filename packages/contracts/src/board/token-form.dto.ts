import { z } from 'zod';
import { boardCommandShape, boardEventShape } from './board-event.dto';
import { tokenBoxShape, tokenSideLengthDto } from './half-cell.dto';
import { tokenFrameDto } from './token-frame.dto';
import { firstRepeated } from './token-id-group.dto';

/** Forms one token (or its anchor) keeps at most: the keys 1–8 switch to them. */
export const TOKEN_FORMS_MAX = 8;
export const TOKEN_FORM_NAME_MAX_LENGTH = 30;

/** A named form of the token: the image, the frame and the size it takes when switched to
 *  (`null` image = the initials). Bars, conditions and controllers stay the token's.
 *
 *  Example: `tokenFormDto.parse({ id, name: 'Lobo atroz', imageAssetId, width: 2, height: 2, frame: 'round' })` */
export const tokenFormDto = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(1).max(TOKEN_FORM_NAME_MAX_LENGTH),
  imageAssetId: z.uuid().nullable(),
  width: tokenSideLengthDto,
  height: tokenSideLengthDto,
  frame: tokenFrameDto,
});
export type TokenFormDto = z.infer<typeof tokenFormDto>;

/** The forms in order (the first is the base), up to 8, refusing the same id twice.
 *
 *  Example: `tokenFormsDto.parse([dwarf, wolf])` */
export const tokenFormsDto = z
  .array(tokenFormDto)
  .max(TOKEN_FORMS_MAX)
  .superRefine((forms, context) => {
    const repeated = firstRepeated(forms.map((form) => form.id));
    if (repeated === undefined) return;
    context.addIssue({
      code: 'custom',
      message: `form ${repeated} appears more than once; expected distinct form ids`,
    });
  });

/** `token:setForm` (master, or a controller on any layer): the token takes the image and the size
 *  of `formId`. `expect` is the form it must still have (the undo precondition).
 *
 *  Example: `setTokenFormCommandDto.parse({ actionId, campaignId, tokenId, formId })` */
export const setTokenFormCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenId: z.uuid(),
  formId: z.uuid(),
  expect: z.strictObject({ activeFormId: z.uuid().nullable() }).optional(),
});
export type SetTokenFormCommandDto = z.infer<typeof setTokenFormCommandDto>;

/** `token:formChanged`: the grid event carries the new `box`; the cast event (a linked token's
 *  anchor) carries only the image, the frame and the active form, since the size is per grid.
 *
 *  Example: `tokenFormChangedDto.parse(event).box?.width // 2 after turning into a dire wolf` */
export const tokenFormChangedDto = z.strictObject({
  ...boardEventShape,
  tokenId: z.uuid(),
  activeFormId: z.uuid(),
  imageAssetId: z.uuid().nullable(),
  frame: tokenFrameDto,
  box: z.strictObject(tokenBoxShape).optional(),
});
export type TokenFormChangedDto = z.infer<typeof tokenFormChangedDto>;
