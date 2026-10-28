import { formBoxIn, type SceneSize, type TokenBox } from '@lorkarium/game-core';
import { StaleUndoError } from '../board/board.error';
import type { TokenFrameDto } from '@lorkarium/contracts';
import { OutOfSceneError, TokenFormNotFoundError } from './tokens.error';

/** A kept form as the rules read it: its id, its image, its frame and its size. */
export type FormRef = Readonly<{
  id: string;
  imageAssetId: string | null;
  frame: TokenFrameDto;
  width: number;
  height: number;
}>;

/** What a token shows now: the form it is in (or none), its image, its frame and its box. */
export type ShownForm = Readonly<{
  activeFormId: string | null;
  imageAssetId: string | null;
  frame: TokenFrameDto;
}> &
  TokenBox;

/** An edit of the look by hand: the image and the frame (absent = kept), the size and, when the
 *  list is replaced, the ids of the forms that stay. */
export type FormEdit = Readonly<{
  imageAssetId?: string | null;
  frame?: TokenFrameDto;
  width: number;
  height: number;
  formIds?: readonly string[];
}>;

/** The form a token keeps after an edit by hand: changing the image, the frame or the size leaves
 *  it without one (the "on the map" mark must not lie), and so does dropping that form from the
 *  list.
 *
 *  Example: `activeFormAfterEdit(lyra.token, { width: 2, height: 2 }) // null: the size changed` */
export function activeFormAfterEdit(shown: ShownForm, edit: FormEdit): string | null {
  const { activeFormId } = shown;
  if (activeFormId === null) return null;
  if (edit.formIds && !edit.formIds.includes(activeFormId)) return null;
  if (edit.imageAssetId !== undefined && edit.imageAssetId !== shown.imageAssetId) return null;
  if (edit.frame !== undefined && edit.frame !== shown.frame) return null;
  if (edit.width !== shown.width || edit.height !== shown.height) return null;
  return activeFormId;
}

/** The kept form `formId`, or TOKEN_FORM_NOT_FOUND citing the token and the id (another token's
 *  form too).
 *
 *  Example: `const wolf = requireForm(lyra.token.id, lyra.forms, command.formId)` */
export function requireForm<F extends FormRef>(
  tokenId: string,
  forms: readonly F[],
  formId: string,
): F {
  const found = forms.find((form) => form.id === formId);
  if (!found) throw new TokenFormNotFoundError(tokenId, formId);
  return found;
}

/** The undo precondition of a form switch: no `expected` (a normal switch) always passes.
 *
 *  Example: `requireActiveForm(row.token.id, command.expect, row.token.activeFormId)` */
export function requireActiveForm(
  tokenId: string,
  expected: Readonly<{ activeFormId: string | null }> | undefined,
  actual: string | null,
): void {
  if (!expected || expected.activeFormId === actual) return;
  throw new StaleUndoError(`token ${tokenId}`, formText(expected.activeFormId), formText(actual));
}

/** The box the token takes in `form`: the top-left corner stays and steps back into the scene;
 *  a form larger than the scene is OUT_OF_SCENE.
 *
 *  Example: `formBoxOf(scene, lyra.token, wolf) // { col: 8, row: 4, width: 2, height: 2 }` */
export function formBoxOf(scene: SceneSize, box: TokenBox, form: FormRef): TokenBox {
  const size = { width: form.width, height: form.height };
  if (size.width > scene.widthCells || size.height > scene.heightCells) {
    throw new OutOfSceneError(box, size, scene);
  }
  return formBoxIn(scene, box, size);
}

/** Whether switching changes nothing: the token is in that form, with its image, frame and box.
 *
 *  Example: `if (isShowing(lyra.token, wolf, box)) return unchanged` */
export function isShowing(shown: ShownForm, form: FormRef, box: TokenBox): boolean {
  const sameBox =
    shown.col === box.col &&
    shown.row === box.row &&
    shown.width === box.width &&
    shown.height === box.height;
  const sameLook = shown.imageAssetId === form.imageAssetId && shown.frame === form.frame;
  return shown.activeFormId === form.id && sameLook && sameBox;
}

function formText(formId: string | null): string {
  return formId === null ? 'no form' : `form ${formId}`;
}
