import { beforeEach, describe, expect, it } from 'vitest';
import { CampaignJoinService } from '../../../src/modules/campaigns/campaign-join.service';
import { ClockFake, PasswordHasherFake } from '../../support/auth-fakes';
import { CampaignJoinTransactionRunnerFake } from '../../support/campaign-join-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import { BIA_ID, campaignMemberPo, campaignPo } from '../../support/campaigns-factories';

const NOW = new Date('2026-10-14T21:00:00Z');
const ANA = { id: ANA_ID, role: 'user' } as const;
const ANA_ADMIN = { id: ANA_ID, role: 'admin' } as const;

describe('CampaignJoinService', () => {
  let campaigns: CampaignsDaoFake;
  let members: CampaignMembersDaoFake;
  let hasher: PasswordHasherFake;
  let clock: ClockFake;
  let transaction: CampaignJoinTransactionRunnerFake;
  let service: CampaignJoinService;

  beforeEach(() => {
    campaigns = new CampaignsDaoFake();
    members = new CampaignMembersDaoFake(campaigns, { [ANA_ID]: 'Ana', [BIA_ID]: 'Bia' });
    hasher = new PasswordHasherFake();
    clock = new ClockFake(NOW);
    transaction = new CampaignJoinTransactionRunnerFake(campaigns, members);
    service = new CampaignJoinService({
      ...{ campaigns, members, hasher, clock },
      transaction: transaction.run,
    });
  });

  function biasCampaign(passwordHash: string | null = null): void {
    campaigns.rows.push(
      campaignPo({ id: 'vharn', ownerId: BIA_ID, joinCode: 'VHRN7K2Q', passwordHash }),
    );
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

  describe("the spectators of the owner's plan", () => {
    function spectators(campaignId: string, count: number): void {
      for (let index = 0; index < count; index += 1) {
        const userId = `${campaignId}-spectator-${index}`;
        members.rows.push(campaignMemberPo({ campaignId, userId, role: 'spectator' }));
      }
    }

    function freeOwner(): void {
      campaigns.ownerPlans.set(BIA_ID, {
        role: 'user',
        plan: 'free',
        lorkariumOwner: false,
      });
    }

    it('a third spectator of a free table is refused with PLAN_LIMIT spectators and writes no row', async () => {
      biasCampaign();
      freeOwner();
      spectators('vharn', 2);
      await expect(service.join(ANA_ID, { code: 'VHRN7K2Q' })).rejects.toMatchObject({
        code: 'PLAN_LIMIT',
        ...{ resource: 'spectators', stored: 2, adding: 1, limit: 2, plan: 'free' },
      });
      expect(members.rows).toHaveLength(3);
    });

    it('the same ceiling holds for the entry from "Explorar mesas"', async () => {
      campaigns.rows.push(campaignPo({ id: 'vharn', ownerId: BIA_ID, visibility: 'public' }));
      members.rows.push(campaignMemberPo({ campaignId: 'vharn', userId: BIA_ID, role: 'master' }));
      freeOwner();
      spectators('vharn', 2);
      await expect(service.joinPublic(ANA, 'vharn', {})).rejects.toMatchObject({
        code: 'PLAN_LIMIT',
        resource: 'spectators',
      });
    });

    it('with one spectator, the second takes the last seat of a free table', async () => {
      biasCampaign();
      freeOwner();
      spectators('vharn', 1);
      const summary = await service.join(ANA_ID, { code: 'VHRN7K2Q' });
      expect(summary.myRole).toBe('spectator');
      expect(members.rows).toHaveLength(3);
    });

    it('the count runs under the lock of the table, in the transaction of the seat', async () => {
      biasCampaign();
      await service.join(ANA_ID, { code: 'VHRN7K2Q' });
      expect(campaigns.writes).toEqual(['lock:vharn']);
      expect(transaction.runs).toBe(1);
    });

    it('a member of a full table enters again: nothing is counted nor locked', async () => {
      biasCampaign();
      freeOwner();
      spectators('vharn', 2);
      const summary = await service.join('vharn-spectator-0', { code: 'VHRN7K2Q' });
      expect(summary.myRole).toBe('spectator');
      expect(transaction.runs).toBe(0);
    });

    it('the spectators of another table do not count against this one', async () => {
      biasCampaign();
      freeOwner();
      spectators('quelm', 5);
      await expect(service.join(ANA_ID, { code: 'VHRN7K2Q' })).resolves.toMatchObject({
        myRole: 'spectator',
      });
    });
  });

  describe('joinPublic (Explorar mesas, no code)', () => {
    function publicCampaign(passwordHash: string | null = null): void {
      campaigns.rows.push(
        campaignPo({ id: 'vharn', ownerId: BIA_ID, visibility: 'public', passwordHash }),
      );
      members.rows.push(campaignMemberPo({ campaignId: 'vharn', userId: BIA_ID, role: 'master' }));
    }

    it('a public campaign without a password takes the newcomer in as spectator', async () => {
      publicCampaign();
      const summary = await service.joinPublic(ANA, 'vharn', {});
      expect(summary).toMatchObject({ id: 'vharn', myRole: 'spectator', masterName: 'Bia' });
      expect(members.rows[1]).toMatchObject({ userId: ANA_ID, role: 'spectator', joinedAt: NOW });
    });

    it('a private campaign is refused with CAMPAIGN_NOT_FOUND citing it and writes no membership', async () => {
      biasCampaign();
      await expect(service.joinPublic(ANA, 'vharn', {})).rejects.toMatchObject({
        code: 'CAMPAIGN_NOT_FOUND',
        message: expect.stringContaining('vharn'),
      });
      expect(members.rows).toHaveLength(1);
    });

    it('an unknown id is refused with CAMPAIGN_NOT_FOUND citing the id', async () => {
      await expect(service.joinPublic(ANA, 'sumida', {})).rejects.toMatchObject({
        code: 'CAMPAIGN_NOT_FOUND',
        message: expect.stringContaining('sumida'),
      });
    });

    it('a wrong password for a protected public campaign is refused and writes no membership', async () => {
      publicCampaign('hashed:sino');
      await expect(service.joinPublic(ANA, 'vharn', { password: 'errada' })).rejects.toMatchObject({
        code: 'CAMPAIGN_PASSWORD_INVALID',
      });
      expect(members.rows).toHaveLength(1);
    });

    it('the right password lets the newcomer in', async () => {
      publicCampaign('hashed:sino');
      const summary = await service.joinPublic(ANA, 'vharn', { password: 'sino' });
      expect(summary.myRole).toBe('spectator');
    });

    it('a player joining again keeps the role and writes no row', async () => {
      publicCampaign();
      members.rows.push(campaignMemberPo({ campaignId: 'vharn', userId: ANA_ID, role: 'player' }));
      const summary = await service.joinPublic(ANA, 'vharn', {});
      expect(summary.myRole).toBe('player');
      expect(members.rows).toHaveLength(2);
    });

    it('an admin joins a private campaign as spectator, without its code', async () => {
      biasCampaign();
      const summary = await service.joinPublic(ANA_ADMIN, 'vharn', {});
      expect(summary.myRole).toBe('spectator');
      expect(members.rows[1]).toMatchObject({ userId: ANA_ID, role: 'spectator' });
    });

    it('the seat an admin got past the gate is marked; the one anyone could take is not', async () => {
      biasCampaign();
      await service.joinPublic(ANA_ADMIN, 'vharn', {});
      expect(members.rows[1]).toMatchObject({ userId: ANA_ID, adminBypassSince: NOW });
    });

    it('a public campaign without a password leaves the admin seat unmarked', async () => {
      campaigns.rows.push(
        campaignPo({ id: 'aberta', ownerId: BIA_ID, joinCode: 'ABRT2345', visibility: 'public' }),
      );
      members.rows.push(campaignMemberPo({ campaignId: 'aberta', userId: BIA_ID, role: 'master' }));
      await service.joinPublic(ANA_ADMIN, 'aberta', {});
      expect(members.rows.at(-1)).toMatchObject({ userId: ANA_ID, adminBypassSince: null });
    });

    it('joining by code is never marked', async () => {
      biasCampaign();
      await service.join(ANA_ID, { code: 'VHRN7K2Q' });
      expect(members.rows[1]).toMatchObject({ userId: ANA_ID, adminBypassSince: null });
    });

    it('an admin joins a protected campaign without the password, checking no hash', async () => {
      biasCampaign('hashed:sino');
      const summary = await service.joinPublic(ANA_ADMIN, 'vharn', {});
      expect(summary.myRole).toBe('spectator');
      expect(hasher.verifications).toEqual([]);
    });
  });
});
