import { campaignDetailDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  orderedMembers,
  toCampaignDetailDto,
  toCampaignSummaryDto,
} from '../../../src/modules/campaigns/campaigns.mapper';
import { ANA_ID } from '../../support/auth-factories';
import {
  BIA_ID,
  VHARN_ID,
  campaignListingRow,
  campaignMemberPo,
  campaignMemberRow,
  campaignPo,
} from '../../support/campaigns-factories';
import { VHARN_CAST_ID } from '../../support/scenes-factories';

const CAIO_ID = '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b';

const MEMBERS = [
  campaignMemberRow({ userId: CAIO_ID, name: 'Bia', role: 'player' }),
  campaignMemberRow({ userId: BIA_ID, name: 'Ágata', role: 'player' }),
  campaignMemberRow({ userId: ANA_ID, name: 'Ana', role: 'master' }),
];

function detailFor(role: 'master' | 'player', passwordHash: string | null = null) {
  return toCampaignDetailDto({
    campaign: campaignPo({ passwordHash, joinCode: 'VHRN7K2Q' }),
    membership: campaignMemberPo({ role, lastEnteredAt: null }),
    members: MEMBERS,
    castSceneId: VHARN_CAST_ID,
  });
}

describe('campaigns mapper', () => {
  it('the detail carries the id of the table cast, to master and player alike', () => {
    expect(detailFor('master').castSceneId).toBe(VHARN_CAST_ID);
    expect(detailFor('player').castSceneId).toBe(VHARN_CAST_ID);
  });

  it('a listing row becomes the summary with ISO dates and the nulls preserved', () => {
    const row = campaignListingRow({
      campaign: campaignPo({ system: null, status: 'Recrutando', description: null }),
      role: 'player',
      masterName: 'Bia',
      memberCount: 4,
      lastEnteredAt: new Date('2026-10-13T22:30:00Z'),
    });
    expect(toCampaignSummaryDto(row)).toEqual({
      id: VHARN_ID,
      name: 'Os Sinos de Vharn',
      system: null,
      status: 'Recrutando',
      description: null,
      visibility: 'private',
      myRole: 'player',
      masterName: 'Bia',
      memberCount: 4,
      lastEnteredAt: '2026-10-13T22:30:00.000Z',
    });
  });

  it('the detail for the master carries the join code', () => {
    expect(detailFor('master').joinCode).toBe('VHRN7K2Q');
  });

  it('the detail for a player hides the join code', () => {
    expect(detailFor('player').joinCode).toBeNull();
  });

  it.each([
    ['hashed:sino', true],
    [null, false],
  ] as const)('a password hash of %s gives hasPassword %s', (passwordHash, expected) => {
    expect(detailFor('master', passwordHash).hasPassword).toBe(expected);
  });

  it('members come master first, then by name in pt-BR order', () => {
    expect(detailFor('player').members.map(({ name, role }) => ({ name, role }))).toEqual([
      { name: 'Ana', role: 'master' },
      { name: 'Ágata', role: 'player' },
      { name: 'Bia', role: 'player' },
    ]);
  });

  it('each participant carries the user id, the drawn color when none was chosen and no photo', () => {
    expect(detailFor('player').members).toEqual([
      { userId: ANA_ID, name: 'Ana', role: 'master', color: 'teal', avatarId: null },
      { userId: BIA_ID, name: 'Ágata', role: 'player', color: 'moss', avatarId: null },
      { userId: CAIO_ID, name: 'Bia', role: 'player', color: 'bone', avatarId: null },
    ]);
  });

  it('a chosen color and a photo reach the participant as they are', () => {
    const photo = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
    const ana = campaignMemberRow({ colorChoice: 'rose', avatarId: photo });
    const detail = toCampaignDetailDto({
      campaign: campaignPo(),
      membership: campaignMemberPo({ role: 'master' }),
      members: [ana],
      castSceneId: VHARN_CAST_ID,
    });
    expect(detail.members[0]).toMatchObject({ color: 'rose', avatarId: photo });
  });

  it('the detail counts the members and names the master', () => {
    expect(detailFor('player')).toMatchObject({ masterName: 'Ana', memberCount: 3 });
  });

  it('the detail passes the strict DTO and never carries the password hash', () => {
    const detail = detailFor('master', 'hashed:sino');
    expect(campaignDetailDto.safeParse(detail).success).toBe(true);
    expect(JSON.stringify(detail)).not.toContain('hashed:sino');
  });

  it('members without a master is an invariant break citing the campaign', () => {
    const build = () =>
      toCampaignDetailDto({
        campaign: campaignPo(),
        membership: campaignMemberPo({ role: 'player' }),
        members: [campaignMemberRow({ role: 'player' })],
        castSceneId: VHARN_CAST_ID,
      });
    expect(build).toThrow(VHARN_ID);
  });
});

describe('orderedMembers', () => {
  it('keeps each member id and puts the master first, then names in pt-BR order', () => {
    expect(orderedMembers(MEMBERS)).toMatchObject([
      { userId: ANA_ID, name: 'Ana', role: 'master' },
      { userId: BIA_ID, name: 'Ágata', role: 'player' },
      { userId: CAIO_ID, name: 'Bia', role: 'player' },
    ]);
  });
});
