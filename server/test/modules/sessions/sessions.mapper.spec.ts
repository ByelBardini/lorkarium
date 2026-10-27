import { describe, expect, it } from 'vitest';
import {
  toMemberActivityDto,
  toMemberJoinedDto,
  toMemberLeftDto,
  toMemberUpdatedDto,
  toSessionStateDto,
} from '../../../src/modules/sessions/sessions.mapper';
import { ANA_ID } from '../../support/auth-factories';
import {
  BIA_ID,
  CAIO_ID,
  DUDA_ID,
  VHARN_ID,
  campaignMemberRow,
} from '../../support/campaigns-factories';
import { presenceRoster } from '../../support/sessions-factories';

const AT = new Date('2026-10-15T12:00:00Z');
const PHOTO_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
const MEMBERS = [
  campaignMemberRow({ userId: ANA_ID, name: 'Ana', role: 'master' }),
  campaignMemberRow({ userId: BIA_ID, name: 'Bia', role: 'player' }),
  campaignMemberRow({ userId: CAIO_ID, name: 'Caio', role: 'player' }),
];

describe('a juggernaut in the snapshot', () => {
  const ROOT_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
  const root = campaignMemberRow({
    userId: ROOT_ID,
    name: 'Root',
    role: 'master',
    juggernaut: true,
  });

  it('Root online is in it as a master marked juggernaut', () => {
    const roster = presenceRoster({ version: 2, sockets: { [ROOT_ID]: ['s1'] } });

    const state = toSessionStateDto(VHARN_ID, [root], roster, AT);

    expect(state.members).toMatchObject([{ userId: ROOT_ID, role: 'master', juggernaut: true }]);
  });

  it('Root offline is left out', () => {
    expect(toSessionStateDto(VHARN_ID, [root], presenceRoster({ version: 2 }), AT).members).toEqual(
      [],
    );
  });
});

describe('sessions mapper', () => {
  it('the snapshot marks online whoever holds a socket or is in grace, in the order received', () => {
    const roster = presenceRoster({ version: 4, sockets: { [ANA_ID]: ['s1'] }, inGrace: [BIA_ID] });
    expect(toSessionStateDto(VHARN_ID, MEMBERS, roster, AT)).toEqual({
      campaignId: VHARN_ID,
      version: 4,
      members: [
        {
          userId: ANA_ID,
          name: 'Ana',
          username: 'ana',
          color: 'teal',
          avatarId: null,
          bio: null,
          role: 'master',
          juggernaut: false,
          online: true,
          awaySince: null,
        },
        {
          userId: BIA_ID,
          name: 'Bia',
          username: 'bia',
          color: 'moss',
          avatarId: null,
          bio: null,
          role: 'player',
          juggernaut: false,
          online: true,
          awaySince: null,
        },
        {
          userId: CAIO_ID,
          name: 'Caio',
          username: 'caio',
          color: 'steel',
          avatarId: null,
          bio: null,
          role: 'player',
          juggernaut: false,
          online: false,
          awaySince: null,
        },
      ],
      at: '2026-10-15T12:00:00.000Z',
    });
  });

  it('memberJoined carries the table, the version and the member online', () => {
    const bia = campaignMemberRow({ userId: BIA_ID, name: 'Bia', role: 'player' });
    expect(toMemberJoinedDto(VHARN_ID, bia, 2, AT)).toEqual({
      campaignId: VHARN_ID,
      version: 2,
      member: {
        userId: BIA_ID,
        name: 'Bia',
        username: 'bia',
        color: 'moss',
        avatarId: null,
        bio: null,
        role: 'player',
        juggernaut: false,
        online: true,
        awaySince: null,
      },
      at: '2026-10-15T12:00:00.000Z',
    });
  });

  it('a member with a chosen color, a photo and a bio carries them as the table sees them', () => {
    const ana = campaignMemberRow({ colorChoice: 'rose', avatarId: PHOTO_ID, bio: 'Mestre' });
    const [member] = toSessionStateDto(VHARN_ID, [ana], presenceRoster({ version: 1 }), AT).members;
    expect(member).toMatchObject({ color: 'rose', avatarId: PHOTO_ID, bio: 'Mestre' });
  });

  it('memberUpdated carries the member read again with the online state and the roster version', () => {
    const ana = campaignMemberRow({ name: 'Aninha', colorChoice: 'gold' });
    const roster = presenceRoster({ version: 6, sockets: { [ANA_ID]: ['s1'] } });
    expect(toMemberUpdatedDto(VHARN_ID, ana, roster, AT)).toEqual({
      campaignId: VHARN_ID,
      version: 6,
      member: expect.objectContaining({ name: 'Aninha', color: 'gold', online: true }),
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

  describe('a spectator in the snapshot', () => {
    const DUDA = campaignMemberRow({ userId: DUDA_ID, name: 'Duda', role: 'spectator' });
    const WITH_DUDA = [...MEMBERS, DUDA];
    const idsOf = (roster: Parameters<typeof toSessionStateDto>[2]): string[] =>
      toSessionStateDto(VHARN_ID, WITH_DUDA, roster, AT).members.map(({ userId }) => userId);

    it('Duda offline is left out; Bia offline stays', () => {
      const roster = presenceRoster({ version: 2, sockets: { [ANA_ID]: ['s1'] } });

      expect(idsOf(roster)).toEqual([ANA_ID, BIA_ID, CAIO_ID]);
    });

    it('Duda online is in it with the spectator role', () => {
      const roster = presenceRoster({ version: 2, sockets: { [DUDA_ID]: ['s9'] } });

      const members = toSessionStateDto(VHARN_ID, WITH_DUDA, roster, AT).members;

      expect(members.find(({ userId }) => userId === DUDA_ID)).toMatchObject({
        role: 'spectator',
        juggernaut: false,
        online: true,
      });
    });
  });
});
