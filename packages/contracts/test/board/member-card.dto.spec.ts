import { describe, expect, it } from 'vitest';
import {
  memberCardChangedDto,
  memberCardChangesDto,
  updateMemberCardCommandDto,
} from '../../src/board/member-card.dto';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const CAMPAIGN_ID = '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a';
const BIA_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const BASE = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID, memberId: BIA_ID };

function messagesOf(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('memberCardChangesDto', () => {
  it('an armor class alone is accepted as sent', () => {
    expect(memberCardChangesDto.parse({ armorClass: 15 })).toEqual({ armorClass: 15 });
  });

  it('the character name is trimmed', () => {
    expect(memberCardChangesDto.parse({ characterName: '  Lyra  ' })).toEqual({
      characterName: 'Lyra',
    });
  });

  it('a name of only spaces becomes null (back to the token name)', () => {
    expect(memberCardChangesDto.parse({ characterName: '   ' })).toEqual({ characterName: null });
  });

  it('null clears the armor class and stays as a key', () => {
    expect(memberCardChangesDto.parse({ armorClass: null })).toEqual({ armorClass: null });
  });

  it.each([0, 999])('armor class %s is accepted', (armorClass) => {
    expect(memberCardChangesDto.safeParse({ armorClass }).success).toBe(true);
  });

  it('a note of 80 characters is accepted', () => {
    const noteOne = 'x'.repeat(80);

    expect(memberCardChangesDto.parse({ noteOne })).toEqual({ noteOne });
  });

  it.each([1000, -1, 12.5])('armor class %s is refused citing the value', (armorClass) => {
    expect(messagesOf(memberCardChangesDto.safeParse({ armorClass }))).toEqual([
      `armorClass ${armorClass} is invalid; expected a whole number from 0 to 999`,
    ]);
  });

  it('a difficulty class of 1000 is refused citing its own field', () => {
    expect(messagesOf(memberCardChangesDto.safeParse({ difficultyClass: 1000 }))).toEqual([
      'difficultyClass 1000 is invalid; expected a whole number from 0 to 999',
    ]);
  });

  it('a character name of 41 characters is refused citing the limit of 40', () => {
    const result = memberCardChangesDto.safeParse({ characterName: 'x'.repeat(41) });

    expect(messagesOf(result)).toEqual(['characterName has 41 characters; expected at most 40']);
  });

  it('a note of 81 characters is refused citing the limit of 80', () => {
    const result = memberCardChangesDto.safeParse({ noteTwo: 'x'.repeat(81) });

    expect(messagesOf(result)).toEqual(['noteTwo has 81 characters; expected at most 80']);
  });

  it('no change at all is refused naming every field', () => {
    expect(messagesOf(memberCardChangesDto.safeParse({}))).toEqual([
      'changes is empty; expected at least one of characterName, armorClass, difficultyClass, noteOne, noteTwo',
    ]);
  });
});

describe('updateMemberCardCommandDto', () => {
  it('a command with the member and the changes is accepted', () => {
    const command = { ...BASE, changes: { noteOne: 'Percepção passiva 14' } };

    expect(updateMemberCardCommandDto.parse(command)).toEqual(command);
  });

  it('a forged userId is refused (who asks comes from the connection, §7.3)', () => {
    const command = { ...BASE, userId: BIA_ID, changes: { armorClass: 15 } };

    expect(updateMemberCardCommandDto.safeParse(command).success).toBe(false);
  });

  it('a memberId that is not a uuid is refused', () => {
    const command = { ...BASE, memberId: 'bia', changes: { armorClass: 15 } };

    expect(updateMemberCardCommandDto.safeParse(command).success).toBe(false);
  });
});

describe('memberCardChangedDto', () => {
  it('the event carries the whole card after the change', () => {
    const card = {
      userId: BIA_ID,
      characterName: null,
      armorClass: 15,
      difficultyClass: null,
      noteOne: null,
      noteTwo: null,
    };
    const event = { campaignId: CAMPAIGN_ID, version: 4, at: '2026-10-22T12:00:00.000Z', card };

    expect(memberCardChangedDto.parse(event)).toEqual(event);
  });
});
