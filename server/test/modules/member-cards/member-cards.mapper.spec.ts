import { describe, expect, it } from 'vitest';
import {
  toMemberCardChangesPo,
  toMemberCardDto,
} from '../../../src/modules/member-cards/member-cards.mapper';
import { BIA_ID } from '../../support/campaigns-factories';
import { memberCardPo } from '../../support/member-cards-factories';

describe('toMemberCardDto', () => {
  it('a row becomes the card of its member with the nulls kept', () => {
    const row = memberCardPo({ armorClass: 15, noteOne: 'Percepção passiva 14' });

    expect(toMemberCardDto(row)).toEqual({
      userId: BIA_ID,
      characterName: null,
      armorClass: 15,
      difficultyClass: null,
      noteOne: 'Percepção passiva 14',
      noteTwo: null,
      anchorTokenId: null,
    });
  });
});

describe('toMemberCardChangesPo', () => {
  it('only the keys present are written', () => {
    expect(toMemberCardChangesPo({ armorClass: 15 })).toEqual({ armorClass: 15 });
  });

  it('null is kept as a write of null', () => {
    expect(toMemberCardChangesPo({ characterName: null, noteTwo: 'x' })).toEqual({
      characterName: null,
      noteTwo: 'x',
    });
  });

  it('an absent key is not written even when present as undefined', () => {
    const changes = { armorClass: undefined, difficultyClass: 13 };

    expect(toMemberCardChangesPo(changes)).toStrictEqual({ difficultyClass: 13 });
  });
});
