import type { CharacterRow } from '../../src/modules/characters/characters.dao';
import type { CharacterBarPo, CharacterPo } from '../../src/modules/characters/characters.po';
import { BIA_ID, VHARN_ID } from './campaigns-factories';

export const LYRA_CHARACTER_ID = '0c9b8a7f-6e5d-4c3b-9a2f-1e0d9c8b7a6f';
export const LYRA_CHARACTER_PV_ID = '1d0c9b8a-7f6e-4d5c-8b3a-2f1e0d9c8b7a';
export const LYRA_CHARACTER_MANA_ID = '2e1d0c9b-8a7f-4e6d-9c4b-3a2f1e0d9c8b';

const CREATED = new Date('2026-10-31T12:00:00Z');

/** Lyra, the character of Bia at Vharn: a 1×1 ally, no aura, no card fields. */
export function characterPo(overrides: Partial<CharacterPo> = {}): CharacterPo {
  return {
    id: LYRA_CHARACTER_ID,
    campaignId: VHARN_ID,
    userId: BIA_ID,
    name: 'Lyra',
    initials: 'LY',
    side: 'ally',
    imageAssetId: null,
    frame: 'square',
    defeated: false,
    auraKind: null,
    auraRadius: null,
    auraColor: null,
    auraEffect: null,
    auraImageAssetId: null,
    auraOpacity: null,
    auraImageShape: null,
    width: 1,
    height: 1,
    armorClass: null,
    difficultyClass: null,
    noteOne: null,
    noteTwo: null,
    mainSheetId: null,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

/** The PV of Lyra (25/30, first, only for its controllers). */
export function characterBarPo(overrides: Partial<CharacterBarPo> = {}): CharacterBarPo {
  return {
    id: LYRA_CHARACTER_PV_ID,
    characterId: LYRA_CHARACTER_ID,
    position: 0,
    label: 'PV',
    current: 25,
    max: 30,
    temp: 0,
    color: 'ember',
    visibility: 'controllers',
    display: 'number',
    ...overrides,
  };
}

/** The Mana of Lyra (4/10, second, seen by everyone). */
export function characterManaPo(overrides: Partial<CharacterBarPo> = {}): CharacterBarPo {
  return characterBarPo({
    id: LYRA_CHARACTER_MANA_ID,
    position: 1,
    label: 'Mana',
    current: 4,
    max: 10,
    color: 'steel',
    visibility: 'everyone',
    ...overrides,
  });
}

/** Lyra as the DAO reads it: PV and Mana, controlled by Bia, Bia a player at Vharn.
 *
 *  Example: `characterRow({ holderRole: 'spectator' })` */
export function characterRow(overrides: Partial<CharacterRow> = {}): CharacterRow {
  return {
    character: characterPo(),
    bars: [characterBarPo(), characterManaPo()],
    controllerIds: [BIA_ID],
    holderRole: 'player',
    conditions: [],
    ...overrides,
  };
}
