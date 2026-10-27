import { beforeEach, describe, expect, it } from 'vitest';
import { CampaignsService } from '../../../src/modules/campaigns/campaigns.service';
import { ClockFake, PasswordHasherFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import {
  CampaignCodeFake,
  CampaignMembersDaoFake,
  MembershipReadsFake,
  CampaignsDaoFake,
  ConditionDefinitionsFake,
  TransactionRunnerFake,
} from '../../support/campaigns-fakes';
import { PresenceReaderFake } from '../../support/campaign-settings-fakes';
import { ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_CAST_ID, castPo } from '../../support/scenes-factories';
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
  status: 'building',
  description: null,
  visibility: 'private',
} as const;

describe('CampaignsService', () => {
  let campaigns: CampaignsDaoFake;
  let members: CampaignMembersDaoFake;
  let scenes: ScenesDaoFake;
  let conditions: ConditionDefinitionsFake;
  let runner: TransactionRunnerFake;
  let codes: CampaignCodeFake;
  let presence: PresenceReaderFake;
  let service: CampaignsService;

  function build(codeSequence: readonly string[]): void {
    codes = new CampaignCodeFake(codeSequence);
    service = new CampaignsService({
      campaigns,
      members,
      scenes,
      memberships: members,
      presence,
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
    scenes = new ScenesDaoFake();
    conditions = new ConditionDefinitionsFake();
    runner = new TransactionRunnerFake({ campaigns, members, scenes, conditions });
    presence = new PresenceReaderFake();
    build(['VHRN7K2Q', 'PNTN2345', 'QLMR2345', 'ZZZZ2345']);
  });

  it('create writes the campaign, the master, the active scene, the cast and the initial conditions, all in the transaction', async () => {
    const detail = await service.create(ANA_ID, NEW_CAMPAIGN);
    expect(runner.writesInside).toEqual([
      'campaigns.insert',
      'members.insert',
      'scenes.insert',
      'campaigns.setActiveScene',
      'scenes.insert',
      'conditions.insertDefinitions',
    ]);
    expect(conditions.seeded.get(campaigns.rows[0]?.id ?? '')).toHaveLength(11);
    const campaignId = campaigns.rows[0]?.id;
    expect(scenes.rows).toEqual([
      expect.objectContaining({ campaignId, kind: 'grid' }),
      expect.objectContaining({ campaignId, kind: 'cast', name: 'Elenco' }),
    ]);
    expect(detail.castSceneId).toBe(scenes.rows[1]?.id);
    expect(campaigns.rows[0]?.activeSceneId).toBe(scenes.rows[0]?.id);
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

  it('a code collision retries without leaving a second scene behind', async () => {
    campaigns.rows.push(campaignPo({ id: 'taken', joinCode: 'VHRN7K2Q' }));
    await service.create(ANA_ID, NEW_CAMPAIGN);
    expect(scenes.rows.map(({ kind }) => kind)).toEqual(['grid', 'cast']);
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

  it('listPublic gives only the public campaigns, with the reader role there or null', async () => {
    campaigns.rows.push(campaignPo({ id: 'vharn', name: 'Vharn', visibility: 'public' }));
    campaigns.rows.push(campaignPo({ id: 'quelm', name: 'Quelm', visibility: 'public' }));
    campaigns.rows.push(campaignPo({ id: 'oculta', name: 'Oculta', visibility: 'private' }));
    for (const id of ['vharn', 'quelm', 'oculta']) {
      members.rows.push(campaignMemberPo({ campaignId: id, userId: BIA_ID, role: 'master' }));
    }
    members.rows.push(campaignMemberPo({ campaignId: 'quelm', userId: ANA_ID, role: 'player' }));

    const listed = await service.listPublic(ANA_ID);

    expect(listed).toEqual([
      expect.objectContaining({ id: 'vharn', myRole: null, masterName: 'Bia', hasPassword: false }),
      expect.objectContaining({ id: 'quelm', myRole: 'player', memberCount: 2 }),
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
    scenes.rows.push(castPo({ campaignId: 'vharn' }));
    const detail = await service.detail(ANA_ID, 'vharn');
    expect(detail).toMatchObject({ id: 'vharn', myRole: 'player', joinCode: null });
    expect(detail.castSceneId).toBe(VHARN_CAST_ID);
  });

  it('create keeps the status and the drawn cover chosen', async () => {
    const cover = { kind: 'drawn', drawing: 2, tone: 3 } as const;
    const detail = await service.create(ANA_ID, { ...NEW_CAMPAIGN, status: 'recruiting', cover });
    expect(campaigns.rows[0]).toMatchObject({
      status: 'recruiting',
      coverDrawing: 2,
      coverTone: 3,
    });
    expect(detail).toMatchObject({ status: 'recruiting', cover });
  });

  describe('detail of a table being played', () => {
    beforeEach(() => {
      campaigns.rows.push(campaignPo({ id: VHARN_ID }));
      const entered = (iso: string) => ({ lastEnteredAt: new Date(iso) });
      members.rows.push(
        campaignMemberPo({
          campaignId: VHARN_ID,
          userId: ANA_ID,
          ...entered('2026-10-12T22:00:00Z'),
        }),
        campaignMemberPo({
          ...{ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' },
          ...entered('2026-10-13T23:30:00Z'),
        }),
        campaignMemberPo({ campaignId: VHARN_ID, userId: CAIO_ID, role: 'player' }),
      );
      scenes.rows.push(castPo({ campaignId: VHARN_ID }));
    });

    it('the last access is the latest entry of any member, not the reader own', async () => {
      const detail = await service.detail(ANA_ID, VHARN_ID);
      expect(detail.lastAccessAt).toBe('2026-10-13T23:30:00.000Z');
      expect(detail.lastEnteredAt).toBe('2026-10-12T22:00:00.000Z');
    });

    it('each member is online as the live presence of this table says', async () => {
      presence = new PresenceReaderFake({ [VHARN_ID]: [CAIO_ID], [QUELM_ID]: [BIA_ID] });
      build(['VHRN7K2Q']);
      const detail = await service.detail(ANA_ID, VHARN_ID);
      const online = detail.members.map(({ name, online }) => ({ name, online }));
      expect(online).toEqual([
        { name: 'Ana', online: false },
        { name: 'Bia', online: false },
        { name: 'Caio', online: true },
      ]);
    });
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
      expect(await service.rosterOf(BIA_ID, VHARN_ID)).toMatchObject([
        { userId: ANA_ID, name: 'Ana', role: 'master' },
        { userId: BIA_ID, name: 'Bia', role: 'player' },
        { userId: CAIO_ID, name: 'Caio', role: 'player' },
      ]);
    });

    it('the membership is read through the remembered memberships, which session:join warms', async () => {
      const memberships = new MembershipReadsFake([...members.rows]);
      service = new CampaignsService({
        ...{ campaigns, members, scenes, memberships, presence, transaction: runner.run, codes },
        ...{ hasher: new PasswordHasherFake(), clock: new ClockFake(NOW) },
      });
      await service.rosterOf(BIA_ID, VHARN_ID);
      expect(memberships.reads).toEqual([`${VHARN_ID}:${BIA_ID}`, `list:${VHARN_ID}`]);
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

  describe('campaignIdsOf', () => {
    it('lists only the campaigns the user is a member of', async () => {
      members.rows.push(
        campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
        campaignMemberPo({ campaignId: QUELM_ID, userId: CAIO_ID, role: 'master' }),
      );

      expect(await service.campaignIdsOf(ANA_ID)).toEqual([VHARN_ID]);
    });
  });
});
