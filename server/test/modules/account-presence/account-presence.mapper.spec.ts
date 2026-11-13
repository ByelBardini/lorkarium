import { describe, expect, it } from 'vitest';
import {
  toFriendPresenceDto,
  toOpenedTable,
  toPresenceFriendChangedDto,
} from '../../../src/modules/account-presence/account-presence.mapper';
import { BIA_ID, QUELM_ID, VHARN_ID } from '../../support/campaigns-factories';

const AT = new Date('2026-11-12T12:00:00Z');
const AT_VHARN = { status: 'online', table: { campaignId: VHARN_ID, name: 'Vharn' } } as const;

describe('account presence mapper', () => {
  it('a friend line carries the status and the shown table', () => {
    expect(toFriendPresenceDto(BIA_ID, AT_VHARN)).toEqual({ userId: BIA_ID, ...AT_VHARN });
  });

  it('presence:friendChanged adds the instant as ISO text', () => {
    expect(toPresenceFriendChangedDto(BIA_ID, AT_VHARN, AT)).toEqual({
      userId: BIA_ID,
      ...AT_VHARN,
      at: AT.toISOString(),
    });
  });

  it.each([
    ['public', true],
    ['private', false],
  ] as const)('a %s table opens with isPublic %s', (visibility, isPublic) => {
    expect(toOpenedTable({ id: QUELM_ID, name: 'Quelm', visibility })).toEqual({
      campaignId: QUELM_ID,
      name: 'Quelm',
      isPublic,
    });
  });
});
