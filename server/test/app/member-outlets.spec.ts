import { describe, expect, it } from 'vitest';
import { removedInOrder } from '../../src/app/member-outlets';
import { BIA_ID, VHARN_ID } from '../support/campaigns-factories';
import { MemberRemovedFake } from '../support/member-role-fakes';

describe('removedInOrder', () => {
  it('tells the live session first and the characters after, with the same removal', async () => {
    const journal: string[] = [];
    const ports = [
      new MemberRemovedFake('sessions', journal),
      new MemberRemovedFake('characters', journal),
    ];

    await removedInOrder(...ports).memberRemoved({ campaignId: VHARN_ID, userId: BIA_ID });

    expect(journal).toEqual([`sessions:${BIA_ID}`, `characters:${BIA_ID}`]);
  });

  it('a port that fails stops the ones after it and the failure reaches the caller', async () => {
    const journal: string[] = [];
    const failing = new MemberRemovedFake('sessions', journal, new Error('room gone'));

    const told = removedInOrder(failing, new MemberRemovedFake('characters', journal));

    await expect(told.memberRemoved({ campaignId: VHARN_ID, userId: BIA_ID })).rejects.toThrow(
      'room gone',
    );
    expect(journal).toEqual([]);
  });
});
