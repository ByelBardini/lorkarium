import { beforeEach, describe, expect, it } from 'vitest';
import { MemberRoleService } from '../../../src/modules/campaigns/member-role.service';
import { ANA_ID } from '../../support/auth-factories';
import { PresenceReaderFake } from '../../support/campaign-settings-fakes';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import {
  BIA_ID,
  CAIO_ID,
  DUDA_ID,
  QUELM_ID,
  VHARN_ID,
  campaignMemberPo,
  campaignPo,
} from '../../support/campaigns-factories';
import { ForgottenMembershipsFake, MemberRoleChangedFake } from '../../support/member-role-fakes';

describe('MemberRoleService.change', () => {
  let campaigns: CampaignsDaoFake;
  let members: CampaignMembersDaoFake;
  let changed: MemberRoleChangedFake;
  let service: MemberRoleService;

  beforeEach(() => {
    campaigns = new CampaignsDaoFake([
      campaignPo({ id: VHARN_ID }),
      campaignPo({ id: QUELM_ID, joinCode: 'QLMR2345' }),
    ]);
    const names = { [ANA_ID]: 'Ana', [BIA_ID]: 'Bia', [CAIO_ID]: 'Caio', [DUDA_ID]: 'Duda' };
    members = new CampaignMembersDaoFake(campaigns, names, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: DUDA_ID, role: 'spectator' }),
      campaignMemberPo({ campaignId: QUELM_ID, userId: CAIO_ID, role: 'master' }),
    ]);
    changed = new MemberRoleChangedFake(members.writes);
    service = new MemberRoleService({
      campaigns,
      members,
      memberships: new ForgottenMembershipsFake(members.writes),
      changed,
      presence: new PresenceReaderFake({ [VHARN_ID]: [DUDA_ID] }),
    });
  });

  it('Ana promoting Duda saves the role, forgets the remembered membership, then tells the table', async () => {
    await service.change(ANA_ID, { campaignId: VHARN_ID, targetId: DUDA_ID, role: 'player' });

    expect(members.writes).toEqual([
      `updateRole:${VHARN_ID}:${DUDA_ID}:player`,
      `forget:${VHARN_ID}:${DUDA_ID}`,
      `memberRoleChanged:${DUDA_ID}:player`,
    ]);
    expect(changed.told[0]?.change).toEqual({
      campaignId: VHARN_ID,
      userId: DUDA_ID,
      role: 'player',
      from: 'spectator',
    });
  });

  it('the answer is Duda read back after the write: her profile, the new role and online', async () => {
    const member = await service.change(ANA_ID, {
      campaignId: VHARN_ID,
      targetId: DUDA_ID,
      role: 'player',
    });

    expect(member).toEqual({
      userId: DUDA_ID,
      name: 'Duda',
      role: 'player',
      color: expect.any(String),
      avatarId: null,
      online: true,
    });
  });

  it('Ana moving Bia to the spectators answers her offline with the spectator role', async () => {
    const member = await service.change(ANA_ID, {
      campaignId: VHARN_ID,
      targetId: BIA_ID,
      role: 'spectator',
    });

    expect(member).toMatchObject({ userId: BIA_ID, role: 'spectator', online: false });
    expect(members.writes).toEqual([
      `updateRole:${VHARN_ID}:${BIA_ID}:spectator`,
      `forget:${VHARN_ID}:${BIA_ID}`,
      `memberRoleChanged:${BIA_ID}:spectator`,
    ]);
  });

  it('asking player for Bia, already a player, writes, forgets and tells nothing, and answers her', async () => {
    const member = await service.change(ANA_ID, {
      campaignId: VHARN_ID,
      targetId: BIA_ID,
      role: 'player',
    });

    expect(members.writes).toEqual([]);
    expect(member).toMatchObject({ userId: BIA_ID, role: 'player' });
  });

  it.each([
    ['Bia, a player, asking', 'FORBIDDEN', BIA_ID, DUDA_ID],
    ['Ana as the target', 'FORBIDDEN', ANA_ID, ANA_ID],
    ['Caio of Quelm as the target', 'MEMBER_NOT_FOUND', ANA_ID, CAIO_ID],
    ['Caio, outside Vharn, asking', 'CAMPAIGN_NOT_FOUND', CAIO_ID, DUDA_ID],
  ])('%s is refused with %s and the journal stays empty', async (_who, code, userId, targetId) => {
    const change = service.change(userId, { campaignId: VHARN_ID, targetId, role: 'spectator' });

    await expect(change).rejects.toMatchObject({ code });
    expect(members.writes).toEqual([]);
  });

  it('Ana, the owner of Vharn, promoting Bia to master saves it and tells the table from player', async () => {
    await service.change(ANA_ID, { campaignId: VHARN_ID, targetId: BIA_ID, role: 'master' });

    expect(changed.told[0]?.change).toEqual({
      campaignId: VHARN_ID,
      userId: BIA_ID,
      role: 'master',
      from: 'player',
    });
  });

  it('Bia, a co-master but not the owner of Vharn, promoting Duda to master is FORBIDDEN and writes nothing', async () => {
    await service.change(ANA_ID, { campaignId: VHARN_ID, targetId: BIA_ID, role: 'master' });
    members.writes.splice(0);

    const promotion = service.change(BIA_ID, {
      campaignId: VHARN_ID,
      targetId: DUDA_ID,
      role: 'master',
    });

    await expect(promotion).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(members.writes).toEqual([]);
  });
});
