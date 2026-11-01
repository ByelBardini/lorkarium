import type { TokenDto, TokenFormDto, TokenFormChangedDto } from '@lorkarium/contracts';
import type { BoardEvent } from '@/services/board-events';
import { LYRA_PORTRAIT } from './assets-api-fake';
import { vharnEventBase } from './drawing-fixtures';
import { LYRA_ID, lyra } from './table-session-fixtures';

export const BASE_FORM_ID = '3f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
export const WOLF_FORM_ID = '4a2b3c4d-5e6f-4a7b-9c8d-1e2f3a4b5c6d';
export const RAVEN_FORM_ID = '5b3c4d5e-6f7a-4b8c-8d9e-2f3a4b5c6d7e';
export const WOLF_IMAGE_ID = '6c4d5e6f-7a8b-4c9d-9e0f-3a4b5c6d7e8f';

/** Lyra's three forms, in order: herself (the base, 1×1, no image), the dire wolf (2×2, round,
 *  with image) and the raven (0,5).
 *
 *  Example: `lyra({ forms: [...LYRA_FORMS], activeFormId: BASE_FORM_ID })` */
export const LYRA_FORMS: readonly TokenFormDto[] = [
  { id: BASE_FORM_ID, name: 'Lyra', imageAssetId: null, width: 1, height: 1, frame: 'square' },
  {
    id: WOLF_FORM_ID,
    name: 'Lobo atroz',
    imageAssetId: WOLF_IMAGE_ID,
    width: 2,
    height: 2,
    frame: 'round',
  },
  {
    id: RAVEN_FORM_ID,
    name: 'Corvo',
    imageAssetId: LYRA_PORTRAIT.id,
    width: 0.5,
    height: 0.5,
    frame: 'square',
  },
];

/** Lyra at (3, 4) with her three forms, showing the base.
 *
 *  Example: `vharnBoard({ tokens: [shapeshiftingLyra()] })` */
export function shapeshiftingLyra(overrides: Partial<TokenDto> = {}): TokenDto {
  return lyra({ forms: [...LYRA_FORMS], activeFormId: BASE_FORM_ID, ...overrides });
}

/** `token:formChanged` of VHARN's group grid: Lyra became the dire wolf, 2×2 at (3, 4).
 *
 *  Example: `formChangedAt(5, { box: { col: 8, row: 4, width: 2, height: 2 } })` */
export function formChangedAt(
  version: number,
  overrides: Partial<TokenFormChangedDto> = {},
): BoardEvent {
  const payload: TokenFormChangedDto = {
    ...vharnEventBase(version),
    tokenId: LYRA_ID,
    activeFormId: WOLF_FORM_ID,
    imageAssetId: WOLF_IMAGE_ID,
    frame: 'round',
    box: { col: 3, row: 4, width: 2, height: 2 },
    ...overrides,
  };
  return { type: 'tokenFormChanged', payload };
}

/** `token:formChanged` with no box (the token keeps its size): `tokenId` became the dire wolf.
 *
 *  Example: `formSwitchedAt(8, LYRA_ID)` */
export function formSwitchedAt(version: number, tokenId: string): BoardEvent {
  const payload: TokenFormChangedDto = {
    ...vharnEventBase(version),
    tokenId,
    activeFormId: WOLF_FORM_ID,
    imageAssetId: WOLF_IMAGE_ID,
    frame: 'round',
  };
  return { type: 'tokenFormChanged', payload };
}
