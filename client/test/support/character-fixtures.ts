import type {
  CharacterChangedEventDto,
  CharacterDto,
  CharacterRemovedEventDto,
  TokenDto,
} from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import type { CharacterUpdate } from '@/services/table-session-api';
import { createCharactersStore, type CharactersStore } from '@/stores/characters-store';
import { VHARN } from './campaigns-api-fake';
import {
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  KAEL_ID,
  LYRA_ID,
  LYRA_PV_ID,
  kael,
  lyra,
} from './table-session-fixtures';

export const LYRA_CHARACTER_ID = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';
export const KAEL_CHARACTER_ID = '4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b';
export const LYRA_MAIN_SHEET_ID = '3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f';

const EVENT_AT = '2026-10-31T12:00:00.000Z';

/** Bia's character as she sees it: Lyra, PV 25/45 and Inspiração 1/1 (lyra()'s bars, the PV
 *  lower than the grid's copy), CA 15, no CD, no notes, no sheet yet. */
export function lyraCharacter(overrides: Partial<CharacterDto> = {}): CharacterDto {
  const [pv, inspiration] = lyra().bars;
  if (!pv || !inspiration) throw new Error('lyra() lost its PV and Inspiração bars');
  return {
    id: LYRA_CHARACTER_ID,
    campaignId: VHARN.id,
    userId: BIA_AT_TABLE.userId,
    name: 'Lyra',
    initials: 'LY',
    side: 'ally',
    imageAssetId: null,
    frame: 'square',
    defeated: false,
    aura: null,
    width: 1,
    height: 1,
    armorClass: 15,
    difficultyClass: null,
    noteOne: null,
    noteTwo: null,
    bars: [{ ...pv, id: LYRA_PV_ID, current: 25 }, inspiration],
    conditions: [],
    controllerIds: [BIA_AT_TABLE.userId],
    canControl: true,
    mainSheetId: null,
    ...overrides,
  };
}

/** Caio's character: Kael, no bars, nothing written, only Caio controls it. */
export function kaelCharacter(overrides: Partial<CharacterDto> = {}): CharacterDto {
  return lyraCharacter({
    id: KAEL_CHARACTER_ID,
    userId: CAIO_AT_TABLE.userId,
    name: 'Kael',
    initials: 'KA',
    armorClass: null,
    bars: [],
    controllerIds: [CAIO_AT_TABLE.userId],
    canControl: false,
    ...overrides,
  });
}

/** Lyra on a grid, linked to her character: as the grid's snapshot came (PV 32/45). */
export function linkedLyra(overrides: Partial<TokenDto> = {}): TokenDto {
  return lyra({ id: LYRA_ID, characterId: LYRA_CHARACTER_ID, ...overrides });
}

/** Kael on a grid, linked to Caio's character. */
export function linkedKael(overrides: Partial<TokenDto> = {}): TokenDto {
  return kael({ id: KAEL_ID, characterId: KAEL_CHARACTER_ID, ...overrides });
}

/** The `character:sync` answer of VHARN at `version`. */
export function charactersSynced(version: number, ...characters: CharacterDto[]): CharacterUpdate {
  return { kind: 'characters', sync: { version, characters } };
}

export function characterChanged(
  version: number,
  ...characters: CharacterDto[]
): CharacterChangedEventDto {
  const [first, ...rest] = characters;
  if (!first) throw new Error('character:changed needs at least one character; got none');
  return { campaignId: VHARN.id, version, at: EVENT_AT, characters: [first, ...rest] };
}

/** `character:changed` of VHARN at `version`, as the store receives it. */
export function characterChangedAt(
  version: number,
  ...characters: CharacterDto[]
): CharacterUpdate {
  return { kind: 'characterChanged', event: characterChanged(version, ...characters) };
}

export function characterRemoved(
  version: number,
  characterId = LYRA_CHARACTER_ID,
): CharacterRemovedEventDto {
  return { campaignId: VHARN.id, version, at: EVENT_AT, characterId };
}

/** `character:removed` of VHARN at `version`, as the store receives it. */
export function characterRemovedAt(
  version: number,
  characterId = LYRA_CHARACTER_ID,
): CharacterUpdate {
  return { kind: 'characterRemoved', event: characterRemoved(version, characterId) };
}

/** Lyra's character with her PV at `pv` (the rest as `lyraCharacter()`).
 *
 *  Example: `characterChangedAt(4, lyraPvAt(18))` */
export function lyraPvAt(pv: number, overrides: Partial<CharacterDto> = {}): CharacterDto {
  const character = lyraCharacter(overrides);
  const bars = character.bars.map((bar, index) => (index === 0 ? { ...bar, current: pv } : bar));
  return { ...character, bars };
}

/** A characters store of VHARN already synced (version 3) with `characters`; none given = Lyra
 *  and Kael.
 *
 *  Example: `<SessionPresencePanel characters={syncedCharacters()} … />` */
export function syncedCharacters(...characters: CharacterDto[]): StoreApi<CharactersStore> {
  const store = createCharactersStore(VHARN.id, () => undefined);
  const shown = characters.length > 0 ? characters : [lyraCharacter(), kaelCharacter()];
  store.getState().apply(charactersSynced(3, ...shown));
  return store;
}
