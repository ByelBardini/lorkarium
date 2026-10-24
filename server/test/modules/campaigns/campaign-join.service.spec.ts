import { beforeEach, describe, expect, it } from 'vitest';
import { CampaignJoinService } from '../../../src/modules/campaigns/campaign-join.service';
import { ClockFake, PasswordHasherFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import { BIA_ID, campaignMemberPo, campaignPo } from '../../support/campaigns-factories';

const NOW = new Date('2026-10-14T21:00:00Z');

describe('CampaignJoinService', () => {
  let campaigns: CampaignsDaoFake;
  let members: CampaignMembersDaoFake;
  let hasher: PasswordHasherFake;
  let clock: ClockFake;
  let service: CampaignJoinService;

  beforeEach(() => {
    campaigns = new CampaignsDaoFake();
    members = new CampaignMembersDaoFake(campaigns, { [ANA_ID]: 'Ana', [BIA_ID]: 'Bia' });
    hasher = new PasswordHasherFake();
    clock = new ClockFake(NOW);
    service = new CampaignJoinService({ campaigns, members, hasher, clock });
  });

  function biasCampaign(passwordHash: string | null = null): void {
    campaigns.rows.push(campaignPo({ id: 'vharn', joinCode: 'VHRN7K2Q', passwordHash }));
    members.rows.push(campaignMemberPo({ campaignId: 'vharn', userId: BIA_ID, role: 'master' }));
  }

  it('an unknown code is refused with CAMPAIGN_NOT_FOUND citing the code', async () => {
    await expect(service.join(ANA_ID, { code: 'ZZZZ2345' })).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_FOUND',
      message: expect.stringContaining('ZZZZ2345'),
    });
  });

  it('someone already in the campaign gets the summary without a new row or a password check', async () => {
    biasCampaign('hashed:sino');
    members.rows.push(campaignMemberPo({ campaignId: 'vharn', userId: ANA_ID, role: 'player' }));
    const summary = await service.join(ANA_ID, { code: 'VHRN7K2Q' });
    expect(summary).toMatchObject({ id: 'vharn', myRole: 'player', memberCount: 2 });
    expect(members.rows).toHaveLength(2);
    expect(hasher.verifications).toEqual([]);
  });

  it('a campaign without a password takes the newcomer in as spectator, joined now', async () => {
    biasCampaign();
    const summary = await service.join(ANA_ID, { code: 'VHRN7K2Q' });
    expect(summary).toMatchObject({ id: 'vharn', myRole: 'spectator', masterName: 'Bia' });
    expect(members.rows[1]).toMatchObject({ userId: ANA_ID, role: 'spectator', joinedAt: NOW });
    expect(hasher.verifications).toEqual([]);
  });

  it('the spectator who just joined is left out of the member count', async () => {
    biasCampaign();
    const summary = await service.join(ANA_ID, { code: 'VHRN7K2Q' });
    expect(summary.memberCount).toBe(1);
  });

  it.each(['player', 'spectator'] as const)(
    'a %s joining again by the code keeps the role and writes no row',
    async (role) => {
      biasCampaign();
      members.rows.push(campaignMemberPo({ campaignId: 'vharn', userId: ANA_ID, role }));
      const summary = await service.join(ANA_ID, { code: 'VHRN7K2Q' });
      expect(summary.myRole).toBe(role);
      expect(members.rows).toHaveLength(2);
    },
  );

  it('a campaign with a password verifies the password sent against its hash', async () => {
    biasCampaign('hashed:sino');
    const summary = await service.join(ANA_ID, { code: 'VHRN7K2Q', password: 'sino' });
    expect(hasher.verifications).toEqual([{ hashed: 'hashed:sino', password: 'sino' }]);
    expect(summary.myRole).toBe('spectator');
  });

  it.each([
    ['no password', undefined, 'CAMPAIGN_PASSWORD_REQUIRED'],
    ['a wrong password', 'errada', 'CAMPAIGN_PASSWORD_INVALID'],
  ])(
    '%s for a protected campaign is refused and writes no membership',
    async (_, password, code) => {
      biasCampaign('hashed:sino');
      await expect(service.join(ANA_ID, { code: 'VHRN7K2Q', password })).rejects.toMatchObject({
        code,
      });
      expect(members.rows).toHaveLength(1);
    },
  );

  it('enter by someone who is not a member is refused with CAMPAIGN_NOT_FOUND and marks nothing', async () => {
    biasCampaign();
    await expect(service.enter(ANA_ID, 'vharn')).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_FOUND',
    });
    expect(members.entered).toEqual([]);
  });

  it('enter by a member marks the last entry at the clock instant', async () => {
    biasCampaign();
    await service.enter(BIA_ID, 'vharn');
    expect(members.entered).toEqual([{ campaignId: 'vharn', userId: BIA_ID, at: NOW }]);
  });
});
