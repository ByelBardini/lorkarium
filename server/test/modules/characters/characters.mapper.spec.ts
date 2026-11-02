import { describe, expect, it } from 'vitest';
import {
  toCharacterChangesPo,
  toCharacterDto,
  toCharacterSeat,
} from '../../../src/modules/characters/characters.mapper';
import { BIA_ID, VHARN_ID } from '../../support/campaigns-factories';
import {
  LYRA_CHARACTER_ID,
  LYRA_CHARACTER_MANA_ID,
  LYRA_CHARACTER_PV_ID,
  characterPo,
  characterRow,
} from '../../support/characters-factories';

describe('toCharacterDto', () => {
  it('privileged receives every bar, the card and canControl true', () => {
    const lyra = characterRow({ character: characterPo({ armorClass: 15, noteOne: 'Ferida' }) });

    const dto = toCharacterDto(lyra, 'privileged');

    expect(dto).toEqual({
      id: LYRA_CHARACTER_ID,
      campaignId: VHARN_ID,
      userId: BIA_ID,
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
      noteOne: 'Ferida',
      noteTwo: null,
      bars: [
        expect.objectContaining({ id: LYRA_CHARACTER_PV_ID, position: 0, current: 25 }),
        expect.objectContaining({ id: LYRA_CHARACTER_MANA_ID, position: 1, current: 4 }),
      ],
      conditions: [],
      controllerIds: [BIA_ID],
      canControl: true,
      mainSheetId: null,
    });
  });

  it('others receive no controllers bar, the Mana keeps its position 1, and canControl false', () => {
    const dto = toCharacterDto(characterRow(), 'others');

    expect(dto.bars).toEqual([
      {
        id: LYRA_CHARACTER_MANA_ID,
        position: 1,
        label: 'Mana',
        current: 4,
        max: 10,
        color: 'steel',
        visibility: 'everyone',
        display: 'number',
      },
    ]);
    expect(dto.canControl).toBe(false);
  });

  it('the saved aura comes as the wire carries it, the radius as a number', () => {
    const aura = {
      auraKind: 'color',
      auraRadius: '2.00',
      auraColor: 'gold',
      auraOpacity: 50,
    } as const;
    const lyra = characterRow({ character: characterPo(aura) });

    expect(toCharacterDto(lyra, 'others').aura).toEqual({
      kind: 'color',
      radius: 2,
      color: 'gold',
      opacity: 50,
    });
  });
});

describe('toCharacterSeat', () => {
  it('a row nobody plays reads userId and holder null', () => {
    const left = characterRow({ character: characterPo({ userId: null }), holderRole: null });

    expect(toCharacterSeat(left)).toEqual({
      characterId: LYRA_CHARACTER_ID,
      userId: null,
      holderRole: null,
      controllerIds: [BIA_ID],
    });
  });
});

describe('toCharacterChangesPo', () => {
  it('takes only the keys present, null included, and leaves out the absent ones', () => {
    expect(toCharacterChangesPo({ armorClass: 15, noteOne: null, name: undefined })).toEqual({
      armorClass: 15,
      noteOne: null,
    });
  });
});
