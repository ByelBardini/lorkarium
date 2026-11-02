import { describe, expect, it } from 'vitest';
import {
  adjustCharacterBarCommandDto,
  characterChangedEventDto,
  characterChangesDto,
  characterDto,
  characterRemovedEventDto,
  characterSyncAckDto,
  linkTokenToCharacterCommandDto,
  setMainSheetCommandDto,
  unlinkTokenFromCharacterCommandDto,
  updateCharacterCommandDto,
} from '../../src/board/character.dto';
import { conditionDefinitionDeletedDto } from '../../src/board/condition.dto';
import { tokenDto } from '../../src/board/token.dto';

const ACTION = '0f9e8d7c-6b5a-4f3e-9d2c-1b0a9f8e7d6c';
const VHARN = '3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10';
const SALAO = '7d3c2b1a-0f9e-4d8c-b7a6-5e4d3c2b1a0f';
const LYRA = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const LYRA_TOKEN = '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b';
const BIA = '9c8b7a6f-5e4d-4c3b-a2f1-0e9d8c7b6a5f';
const PV = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const SHEET = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';
const AT = '2026-10-31T21:00:00.000Z';

const lyra = {
  id: LYRA,
  campaignId: VHARN,
  userId: BIA,
  name: 'Lyra',
  initials: 'LY',
  side: 'ally',
  imageAssetId: null,
  frame: 'round',
  defeated: false,
  aura: null,
  width: 1,
  height: 1,
  armorClass: 15,
  difficultyClass: null,
  noteOne: 'Elfa',
  noteTwo: null,
  bars: [
    {
      id: PV,
      position: 0,
      label: 'PV',
      current: 25,
      max: 30,
      temp: 0,
      color: 'ember',
      visibility: 'everyone',
      display: 'number',
    },
  ],
  conditions: [],
  controllerIds: [BIA],
  canControl: true,
  mainSheetId: SHEET,
} as const;

const COMMAND = { actionId: ACTION, campaignId: VHARN, characterId: LYRA };

describe('the character', () => {
  it('a whole character parses, with a player who left the table as a null userId', () => {
    expect(characterDto.parse(lyra)).toEqual(lyra);
    expect(characterDto.parse({ ...lyra, userId: null, mainSheetId: null }).userId).toBeNull();
  });

  it.each([
    ['a name of 60 characters', { name: 'L'.repeat(60) }, true],
    ['a name of 61 characters', { name: 'L'.repeat(61) }, false],
    ['an empty name', { name: '  ' }, false],
    ['armor class 999', { armorClass: 999 }, true],
    ['armor class 1000', { armorClass: 1000 }, false],
    ['a note of 81 characters', { noteOne: 'n'.repeat(81) }, false],
    ['a width of half a cell', { width: 0.5 }, true],
    ['a width of 0.3', { width: 0.3 }, false],
  ])('%s → valid is %s', (_, change, valid) => {
    expect(characterDto.safeParse({ ...lyra, ...change }).success).toBe(valid);
  });
});

describe('the character changes', () => {
  it('trims the name and clears a note of only spaces', () => {
    expect(characterChangesDto.parse({ name: ' Lyra ', noteOne: '   ' })).toEqual({
      name: 'Lyra',
      noteOne: null,
    });
  });

  it('empty changes are refused naming the fields it expects', () => {
    const result = characterChangesDto.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(
      /changes is empty; expected at least one of name/,
    );
  });

  it('armor class 1000 is refused citing the value and the range', () => {
    const result = characterChangesDto.safeParse({ armorClass: 1000 });
    expect(result.error?.issues[0]?.message).toBe(
      'armorClass 1000 is invalid; expected a whole number from 0 to 999',
    );
  });
});

describe('the character commands', () => {
  it('character:update names the character and the changes; a forged userId is refused (§7.3)', () => {
    const update = { ...COMMAND, changes: { armorClass: 15 } };
    expect(updateCharacterCommandDto.parse(update)).toEqual(update);
    expect(updateCharacterCommandDto.safeParse({ ...update, userId: BIA }).success).toBe(false);
    expect(updateCharacterCommandDto.safeParse({ ...COMMAND, changes: {} }).success).toBe(false);
  });

  it('character:adjustBar takes the bar and the change of the token bars', () => {
    const adjust = { ...COMMAND, barId: PV, change: { op: 'add', amount: -7 } };
    expect(adjustCharacterBarCommandDto.parse(adjust)).toEqual(adjust);
    const bad = { ...adjust, change: { op: 'max', value: 0 } };
    expect(adjustCharacterBarCommandDto.safeParse(bad).success).toBe(false);
  });

  it('character:setMainSheet names the sheet', () => {
    expect(setMainSheetCommandDto.parse({ ...COMMAND, sheetId: SHEET }).sheetId).toBe(SHEET);
    expect(setMainSheetCommandDto.safeParse(COMMAND).success).toBe(false);
  });

  it('token:linkToCharacter names the token and the character in a grid', () => {
    const link = { actionId: ACTION, campaignId: VHARN, sceneId: SALAO, tokenId: LYRA_TOKEN };
    expect(linkTokenToCharacterCommandDto.parse({ ...link, characterId: LYRA }).characterId).toBe(
      LYRA,
    );
    expect(linkTokenToCharacterCommandDto.safeParse(link).success).toBe(false);
    expect(unlinkTokenFromCharacterCommandDto.parse(link).tokenId).toBe(LYRA_TOKEN);
  });
});

describe('the character events', () => {
  it('character:changed carries at least one whole character in the table version', () => {
    const event = { campaignId: VHARN, version: 4, at: AT, characters: [lyra] };
    expect(characterChangedEventDto.parse(event)).toEqual(event);
    expect(characterChangedEventDto.safeParse({ ...event, characters: [] }).success).toBe(false);
    expect(characterChangedEventDto.safeParse({ ...event, sceneId: SALAO }).success).toBe(false);
  });

  it('character:removed names only the character', () => {
    const event = { campaignId: VHARN, version: 5, at: AT, characterId: LYRA };
    expect(characterRemovedEventDto.parse(event)).toEqual(event);
  });

  it('the character:sync ack is the version and the characters, or the API error', () => {
    const ok = { ok: true, version: 4, characters: [lyra], conditionDefinitions: [] };
    expect(characterSyncAckDto.parse(ok)).toEqual(ok);
    const error = {
      ok: false,
      error: { code: 'CAMPAIGN_NOT_FOUND', message: 'Campaign not found' },
    };
    expect(characterSyncAckDto.parse(error)).toEqual(error);
  });
});

describe('the condition list on the table stream', () => {
  it('condition:definitionDeleted carries the table version and no grid', () => {
    const event = { campaignId: VHARN, version: 6, at: AT, conditionId: SHEET };
    expect(conditionDefinitionDeletedDto.parse(event)).toEqual(event);
    expect(conditionDefinitionDeletedDto.safeParse({ ...event, sceneId: SALAO }).success).toBe(
      false,
    );
  });
});

describe('the token of a character', () => {
  it('a token names its character, or null when free', () => {
    const shape = tokenDto.shape.characterId;
    expect(shape.parse(LYRA)).toBe(LYRA);
    expect(shape.parse(null)).toBeNull();
    expect(shape.safeParse('lyra').success).toBe(false);
  });
});
