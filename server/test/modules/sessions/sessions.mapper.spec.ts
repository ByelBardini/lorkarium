import { describe, expect, it } from 'vitest';
import {
  toMemberActivityDto,
  toMemberJoinedDto,
  toMemberLeftDto,
  toSessionStateDto,
} from '../../../src/modules/sessions/sessions.mapper';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID, campaignMemberRow } from '../../support/campaigns-factories';
import { presenceRoster } from '../../support/sessions-factories';

const AT = new Date('2026-10-15T12:00:00Z');
const MEMBERS = [
  campaignMemberRow({ userId: ANA_ID, name: 'Ana', role: 'master' }),
  campaignMemberRow({ userId: BIA_ID, name: 'Bia', role: 'player' }),
  campaignMemberRow({ userId: CAIO_ID, name: 'Caio', role: 'player' }),
];

describe('sessions mapper', () => {
  it('the snapshot marks online whoever holds a socket or is in grace, in the order received', () => {
    const roster = presenceRoster({ version: 4, sockets: { [ANA_ID]: ['s1'] }, inGrace: [BIA_ID] });
    expect(toSessionStateDto(VHARN_ID, MEMBERS, roster, AT)).toEqual({
      campaignId: VHARN_ID,
      version: 4,
      members: [
        { userId: ANA_ID, name: 'Ana', role: 'master', online: true, awaySince: null },
        { userId: BIA_ID, name: 'Bia', role: 'player', online: true, awaySince: null },
        { userId: CAIO_ID, name: 'Caio', role: 'player', online: false, awaySince: null },
      ],
      at: '2026-10-15T12:00:00.000Z',
    });
  });

  it('memberJoined carries the table, the version and the member online', () => {
    const bia = campaignMemberRow({ userId: BIA_ID, name: 'Bia', role: 'player' });
    expect(toMemberJoinedDto(VHARN_ID, bia, 2, AT)).toEqual({
      campaignId: VHARN_ID,
      version: 2,
      member: { userId: BIA_ID, name: 'Bia', role: 'player', online: true, awaySince: null },
      at: '2026-10-15T12:00:00.000Z',
    });
  });

  it('memberLeft carries the table, the version and the user id only', () => {
    expect(toMemberLeftDto(VHARN_ID, BIA_ID, 3, AT)).toEqual({
      campaignId: VHARN_ID,
      version: 3,
      userId: BIA_ID,
      at: '2026-10-15T12:00:00.000Z',
    });
  });

  it('the snapshot carries since when each member is away, null for the active ones', () => {
    const roster = presenceRoster({
      version: 4,
      sockets: { [ANA_ID]: ['s1'], [BIA_ID]: ['s2'] },
      away: ['s2'],
      awaySince: { [BIA_ID]: AT },
    });

    const state = toSessionStateDto(VHARN_ID, MEMBERS, roster, AT);

    expect(state.members.map(({ awaySince }) => awaySince)).toEqual([
      null,
      '2026-10-15T12:00:00.000Z',
      null,
    ]);
  });

  it('memberActivity carries the table, the version, the user and since when, or null', () => {
    expect(toMemberActivityDto(VHARN_ID, BIA_ID, AT, 5, AT)).toEqual({
      campaignId: VHARN_ID,
      version: 5,
      userId: BIA_ID,
      awaySince: '2026-10-15T12:00:00.000Z',
      at: '2026-10-15T12:00:00.000Z',
    });
    expect(toMemberActivityDto(VHARN_ID, BIA_ID, null, 6, AT).awaySince).toBeNull();
  });
});
