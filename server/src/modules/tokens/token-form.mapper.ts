import type { TokenFormDto } from '@lorkarium/contracts';
import type { TokenAudience } from './token-access.bo';
import type { TokenFormInputPo, TokenFormPo } from './tokens.po';

/** The forms an audience receives: the whole list for the masters and the controllers, none for
 *  the rest (the list would reveal the forms not used yet; the shown one goes as `activeFormId`).
 *
 *  Example: `toTokenFormsDto(row.forms, access.audience())` */
export function toTokenFormsDto(
  forms: readonly TokenFormPo[],
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
