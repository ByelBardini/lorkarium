import { beforeEach, describe, expect, it } from 'vitest';
import { CampaignsService } from '../../../src/modules/campaigns/campaigns.service';
import { ClockFake, PasswordHasherFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import {
  CampaignCodeFake,
  CampaignMembersDaoFake,
  CampaignsDaoFake,
  TransactionRunnerFake,
} from '../../support/campaigns-fakes';
import {
  BIA_ID,
  CAIO_ID,
  QUELM_ID,
  VHARN_ID,
  campaignMemberPo,
  campaignPo,
} from '../../support/campaigns-factories';

const NOW = new Date('2026-10-14T21:00:00Z');
const NEW_CAMPAIGN = {
  name: 'Os Sinos de Vharn',
  system: 'D&D 5e',
  status: null,
  description: null,
  visibility: 'private',
} as const;

describe('CampaignsService', () => {
  let campaigns: CampaignsDaoFake;
  let members: CampaignMembersDaoFake;
  let runner: TransactionRunnerFake;
  let codes: CampaignCodeFake;
  let service: CampaignsService;

  function build(codeSequence: readonly string[]): void {
    codes = new CampaignCodeFake(codeSequence);
    service = new CampaignsService({
      campaigns,
      members,
      transaction: runner.run,
      codes,
      hasher: new PasswordHasherFake(),
      clock: new ClockFake(NOW),
    });
  }

  beforeEach(() => {
    campaigns = new CampaignsDaoFake();
    members = new CampaignMembersDaoFake(campaigns, {
      [ANA_ID]: 'Ana',
      [BIA_ID]: 'Bia',
      [CAIO_ID]: 'Caio',
    });
    runner = new TransactionRunnerFake({ campaigns, members });
    build(['VHRN7K2Q', 'PNTN2345', 'QLMR2345', 'ZZZZ2345']);
  });

  it('create writes the campaign with the generated code and the creator as master, both inside the transaction', async () => {
    const detail = await service.create(ANA_ID, NEW_CAMPAIGN);
    expect(runner.writesInside).toEqual(['campaigns.insert', 'members.insert']);
    expect(campaigns.rows[0]).toMatchObject({ ownerId: ANA_ID, joinCode: 'VHRN7K2Q' });
    expect(members.rows[0]).toMatchObject({ userId: ANA_ID, role: 'master', joinedAt: NOW });
    expect(detail).toMatchObject({
      name: 'Os Sinos de Vharn',
      myRole: 'master',
      masterName: 'Ana',
      memberCount: 1,
      joinCode: 'VHRN7K2Q',
      members: [{ name: 'Ana', role: 'master' }],
    });
  });

  it('create with a password stores only its hash and never returns it', async () => {
    const detail = await service.create(ANA_ID, { ...NEW_CAMPAIGN, password: 'sino' });
    expect(campaigns.rows[0]?.passwordHash).toBe('hashed:sino');
    expect(detail.hasPassword).toBe(true);
    expect(JSON.stringify(detail)).not.toContain('sino"');
  });

  it('create without a password stores a null hash', async () => {
    await service.create(ANA_ID, NEW_CAMPAIGN);
    expect(campaigns.rows[0]?.passwordHash).toBeNull();
  });

  it('a first code that collides is replaced by the next one of the generator', async () => {
    campaigns.rows.push(campaignPo({ id: 'taken', joinCode: 'VHRN7K2Q' }));
    const detail = await service.create(ANA_ID, NEW_CAMPAIGN);
    expect(detail.joinCode).toBe('PNTN2345');
    expect(runner.runs).toBe(2);
  });

  it('three collisions in a row give up with an error citing the attempts', async () => {
    for (const joinCode of ['VHRN7K2Q', 'PNTN2345', 'QLMR2345']) {
      campaigns.rows.push(campaignPo({ id: `taken-${joinCode}`, joinCode }));
    }
    await expect(service.create(ANA_ID, NEW_CAMPAIGN)).rejects.toMatchObject({
      code: 'CAMPAIGN_CODE_EXHAUSTED',
      message: expect.stringContaining('VHRN7K2Q, PNTN2345, QLMR2345'),
    });
  });

  it('listMine queries with the user received and returns the summaries', async () => {
    campaigns.rows.push(campaignPo({ id: 'vharn', name: 'Vharn' }));
    members.rows.push(campaignMemberPo({ campaignId: 'vharn', userId: BIA_ID, role: 'master' }));
    members.rows.push(campaignMemberPo({ campaignId: 'vharn', userId: ANA_ID, role: 'player' }));
    const listed = await service.listMine(ANA_ID);
    expect(members.listedFor).toEqual([ANA_ID]);
    expect(listed).toEqual([
      expect.objectContaining({ id: 'vharn', myRole: 'player', masterName: 'Bia', memberCount: 2 }),
    ]);
  });

  it('detail for someone who is not a member is refused with CAMPAIGN_NOT_FOUND', async () => {
    campaigns.rows.push(campaignPo({ id: 'vharn' }));
    members.rows.push(campaignMemberPo({ campaignId: 'vharn', userId: BIA_ID, role: 'master' }));
    await expect(service.detail(ANA_ID, 'vharn')).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_FOUND',
    });
  });

  it('detail for a player returns the campaign without the join code', async () => {
    campaigns.rows.push(campaignPo({ id: 'vharn' }));
    members.rows.push(campaignMemberPo({ campaignId: 'vharn', userId: BIA_ID, role: 'master' }));
    members.rows.push(campaignMemberPo({ campaignId: 'vharn', userId: ANA_ID, role: 'player' }));
    const detail = await service.detail(ANA_ID, 'vharn');
    expect(detail).toMatchObject({ id: 'vharn', myRole: 'player', joinCode: null });
  });

  describe('rosterOf', () => {
    beforeEach(() => {
      campaigns.rows.push(campaignPo({ id: VHARN_ID }), campaignPo({ id: QUELM_ID }));
      members.rows.push(
        campaignMemberPo({ campaignId: VHARN_ID, userId: CAIO_ID, role: 'player' }),
        campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
        campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
        campaignMemberPo({ campaignId: QUELM_ID, userId: CAIO_ID, role: 'master' }),
      );
    });

    it('a player of the table gets every member with id, master first and then by name', async () => {
      expect(await service.rosterOf(BIA_ID, VHARN_ID)).toEqual([
        { userId: ANA_ID, name: 'Ana', role: 'master' },
        { userId: BIA_ID, name: 'Bia', role: 'player' },
        { userId: CAIO_ID, name: 'Caio', role: 'player' },
      ]);
    });

    it('someone who is not a member is refused with CAMPAIGN_NOT_FOUND before any member is listed', async () => {
      members.rows.splice(0, 1);
      await expect(service.rosterOf(CAIO_ID, VHARN_ID)).rejects.toMatchObject({
        code: 'CAMPAIGN_NOT_FOUND',
        message: `campaign ${VHARN_ID} has no member ${CAIO_ID}`,
      });
      expect(members.membersListedFor).toEqual([]);
    });

    it('the master of another table asking for this one gets the same CAMPAIGN_NOT_FOUND', async () => {
      await expect(service.rosterOf(CAIO_ID, QUELM_ID)).resolves.toHaveLength(1);
      members.rows.splice(0, 1);
      await expect(service.rosterOf(CAIO_ID, VHARN_ID)).rejects.toMatchObject({
        code: 'CAMPAIGN_NOT_FOUND',
      });
    });
  });
});
