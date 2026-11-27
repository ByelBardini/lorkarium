import {
  savedTokenBodyDto,
  type CreateSavedTokenRequestDto,
  type SavedTokenBodyDto,
  type SavedTokenDto,
  type TokenAuraDto,
} from '@lorkarium/contracts';
import type { SavedTokenOwner } from './saved-tokens.dao';
import type {
  NewSavedTokenPo,
  SavedTokenBodyPo,
  SavedTokenChangesPo,
  SavedTokenFormInputPo,
  SavedTokenFormPo,
  SavedTokenPo,
  SavedTokenRow,
} from './saved-tokens.po';

/** The columns and the forms one saved body is written as. */
export type SavedTokenWrite = Readonly<{
  columns: Required<
    Pick<SavedTokenChangesPo, 'imageAssetId' | 'auraImageAssetId' | 'activeForm' | 'body'>
  >;
  forms: SavedTokenFormInputPo[];
}>;

/** Splits a body into its columns: the images and the forms leave the json.
 *
 *  Example: `toSavedTokenWrite(body).columns.imageAssetId // the portrait` */
export function toSavedTokenWrite(token: SavedTokenBodyDto): SavedTokenWrite {
  const { imageAssetId, aura, forms, activeForm, ...rest } = token;
  const columns = {
    imageAssetId,
    auraImageAssetId: aura?.kind === 'image' ? aura.imageAssetId : null,
    activeForm,
    body: { ...rest, aura: aura === null ? null : savedAuraOf(aura) },
  };
  return { columns, forms: forms.map((form) => ({ ...form })) };
}

/** The new row and forms of a save by `owner`.
 *
 *  Example: `toNewSavedTokenRows(owner, { name: 'Zumbi', token })` */
export function toNewSavedTokenRows(
  owner: SavedTokenOwner,
  input: CreateSavedTokenRequestDto,
): Readonly<{ row: NewSavedTokenPo; forms: SavedTokenFormInputPo[] }> {
  const { columns, forms } = toSavedTokenWrite(input.token);
  const row = { ...owner, name: input.name, folderId: input.folderId ?? null, ...columns };
  return { row, forms };
}

/** Every image a body puts on a token: the portrait, the aura image and the forms'.
 *
 *  Example: `assetIdsOf(body) // [portraitId, auraId]` */
export function assetIdsOf(token: SavedTokenBodyDto): (string | null)[] {
  const aura = token.aura?.kind === 'image' ? token.aura.imageAssetId : null;
  return [token.imageAssetId, aura, ...token.forms.map((form) => form.imageAssetId)];
}

/** The saved token as its owner reads it: a lost aura image reads as no aura (as on a token), a
 *  lost portrait or form image as the initials.
 *
 *  Example: `toSavedTokenDto(row, false).token.forms[0]?.name // 'Podre'` */
export function toSavedTokenDto(row: SavedTokenRow, planLocked: boolean): SavedTokenDto {
  const { savedToken, forms } = row;
  return {
    id: savedToken.id,
    name: savedToken.name,
    folderId: savedToken.folderId,
    token: toSavedTokenBody(savedToken, forms),
    planLocked,
  };
}

// Through the contract again: a row out of it throws (it never reaches the client half read).
function toSavedTokenBody(savedToken: SavedTokenPo, forms: SavedTokenFormPo[]): SavedTokenBodyDto {
  return savedTokenBodyDto.parse({
    ...savedToken.body,
    imageAssetId: savedToken.imageAssetId,
    aura: auraOf(savedToken.body['aura'], savedToken.auraImageAssetId),
    forms: forms.map(({ name, imageAssetId, width, height, frame }) => ({
      name,
      imageAssetId,
      width,
      height,
      frame,
    })),
    activeForm: savedToken.activeForm,
  });
}

function savedAuraOf(aura: TokenAuraDto): SavedTokenBodyPo {
  if (aura.kind !== 'image') return aura;
  const { kind, radius, opacity, shape } = aura;
  return { kind, radius, opacity, shape };
}

function auraOf(aura: unknown, imageAssetId: string | null): unknown {
  if (!isImageAura(aura)) return aura ?? null;
  return imageAssetId === null ? null : { ...aura, imageAssetId };
}

function isImageAura(aura: unknown): aura is Readonly<Record<string, unknown>> {
  return typeof aura === 'object' && aura !== null && 'kind' in aura && aura.kind === 'image';
}
