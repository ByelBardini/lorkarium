import type { TokenFormDto } from '@lorkarium/contracts';
import type { TokenAudience } from './token-access.bo';
import { activeFormAfterEdit, type ShownForm } from './token-forms.bo';
import type { TokenUpdatePo } from './tokens.dao';
import type { CharacterFormPo, TokenFormInputPo } from './tokens.po';

/** The forms an audience receives: the whole list for the masters and the controllers, none for
 *  the rest (the list would reveal the forms not used yet; the shown one goes as `activeFormId`).
 *
 *  Example: `toTokenFormsDto(row.forms, access.audience())` */
export function toTokenFormsDto(
  forms: readonly CharacterFormPo[],
  audience: TokenAudience,
): TokenFormDto[] {
  if (audience !== 'privileged') return [];
  return forms.map(({ id, name, imageAssetId, width, height, frame }) => ({
    id,
    name,
    imageAssetId,
    width,
    height,
    frame,
  }));
}

/** The forms of a command → the rows to save, in the order sent (their position).
 *
 *  Example: `await tokens.update(tokenId, { …, forms: toTokenFormInputsPo(command.forms) })` */
export function toTokenFormInputsPo(forms: readonly TokenFormDto[]): TokenFormInputPo[] {
  return forms.map(({ id, name, imageAssetId, width, height, frame }) => ({
    id,
    name,
    imageAssetId,
    width,
    height,
    frame,
  }));
}

/** The forms of a pasted copy and the position of the one it shows (`null` = none, or an id
 *  that is not in the list).
 *
 *  Example: `pastedFormsOf(copy) // { forms: [dwarf, wolf], activeFormIndex: 1 }` */
export function pastedFormsOf(
  copy: Readonly<{ forms?: readonly TokenFormDto[]; activeFormId?: string | null }>,
): Readonly<{ forms: TokenFormInputPo[]; activeFormIndex: number | null }> {
  const forms = toTokenFormInputsPo(copy.forms ?? []);
  const index = forms.findIndex(({ id }) => id === copy.activeFormId);
  return { forms, activeFormIndex: index === -1 ? null : index };
}

/** The update with the form the holder keeps: always written, since replacing the forms drops the
 *  shown one (FK set null) even when its id stays in the list.
 *
 *  Example: `this.updateIn(locked, found, withShownForm(found.token, update), command)` */
export function withShownForm(shown: ShownForm, update: TokenUpdatePo): TokenUpdatePo {
  const formIds = update.forms?.map(({ id }) => id);
  const activeFormId = activeFormAfterEdit(shown, { ...update.fields, formIds });
  return { ...update, fields: { ...update.fields, activeFormId } };
}
