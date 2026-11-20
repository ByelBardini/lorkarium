import {
  PLAN_LIMITS,
  updateCampaignRequestDto,
  type UpdateCampaignRequestInput,
} from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { CampaignSettingsService } from '../../../src/modules/campaigns/campaign-settings.service';
import { CampaignsService } from '../../../src/modules/campaigns/campaigns.service';
import { lyraPortraitPo } from '../../support/assets-factories';
import { ClockFake, PasswordHasherFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import {
  CampaignAssetsFake,
  CampaignChangedFake,
  CampaignRemovalFake,
  ForgottenCampaignsFake,
  PresenceReaderFake,
} from '../../support/campaign-settings-fakes';
import {
  CampaignCodeFake,
  CampaignMembersDaoFake,
  CampaignsDaoFake,
  ConditionDefinitionsFake,
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
import { ScenesDaoFake } from '../../support/scenes-fakes';
import { StagedDeletionQueueFake } from '../../support/storage-deletions-fakes';

const NOW = new Date('2026-10-24T20:00:00Z');
const COVER_ID = '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a';

describe('CampaignSettingsService', () => {
  let campaigns: CampaignsDaoFake;
  let members: CampaignMembersDaoFake;
  let changed: CampaignChangedFake;
  let forgotten: ForgottenCampaignsFake;
  let codes: CampaignCodeFake;
  let assets: CampaignAssetsFake;
  let presence: PresenceReaderFake;
  let deletions: StagedDeletionQueueFake;
  let failDeleteWith: Error | null;
  let service: CampaignSettingsService;

  function build(): void {
    const scenes = new ScenesDaoFake();
    const conditions = new ConditionDefinitionsFake();
    const runner = new TransactionRunnerFake({ campaigns, members, scenes, conditions });
    const hasher = new PasswordHasherFake();
    const clock = new ClockFake(NOW);
    const detail = new CampaignsService({
      ...{ campaigns, members, scenes, memberships: members, presence: new PresenceReaderFake() },
      ...{ transaction: runner.run, codes, hasher, clock },
    });
    const removal = new CampaignRemovalFake(campaigns, assets, deletions, failDeleteWith).run;
    service = new CampaignSettingsService({
      ...{ campaigns, members, assets, detail, memberships: forgotten, changed, presence },
      ...{ codes, hasher, clock, removal },
    });
  }

  function update(userId: string, body: UpdateCampaignRequestInput) {
    return service.update(userId, VHARN_ID, updateCampaignRequestDto.parse(body));
  }

  beforeEach(() => {
    campaigns = new CampaignsDaoFake([
      campaignPo({ id: VHARN_ID, joinCode: 'VHRN7K2Q', passwordHash: 'hashed:velha' }),
      campaignPo({ id: QUELM_ID, joinCode: 'QLMR2345' }),
    ]);
    members = new CampaignMembersDaoFake(campaigns, { [ANA_ID]: 'Ana', [BIA_ID]: 'Bia' }, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
      campaignMemberPo({ campaignId: QUELM_ID, userId: CAIO_ID, role: 'master' }),
    ]);
    changed = new CampaignChangedFake(campaigns);
    forgotten = new ForgottenCampaignsFake();
    codes = new CampaignCodeFake(['PNTN2345', 'ZZZZ2345', 'YYYY2345']);
    assets = new CampaignAssetsFake([
      lyraPortraitPo({ id: COVER_ID, campaignId: VHARN_ID, purpose: 'cover' }),
    ]);
    presence = new PresenceReaderFake({ [VHARN_ID]: [ANA_ID, BIA_ID], [QUELM_ID]: [CAIO_ID] });
    deletions = new StagedDeletionQueueFake();
    failDeleteWith = null;
    build();
  });

  function onFreePlan(): void {
    const owner = campaigns.rows[0]!.ownerId;
    campaigns.ownerPlans.set(owner, {
      role: 'user',
      plan: 'free',
      activePaidPlan: null,
      lorkariumOwner: false,
    });
  }

  function masterAwayFromTable(): void {
    presence = new PresenceReaderFake({ [VHARN_ID]: [BIA_ID], [QUELM_ID]: [ANA_ID] });
    build();
  }

  describe('update', () => {
    it('the master saves the fields sent and gets the detail read back', async () => {
      const detail = await update(ANA_ID, { name: 'Vharn', status: 'ongoing', tags: ['sandbox'] });
      expect(campaigns.rows[0]).toMatchObject({ name: 'Vharn', status: 'ongoing', updatedAt: NOW });
      expect(detail).toMatchObject({ name: 'Vharn', status: 'ongoing', tags: ['sandbox'] });
    });

    it('the live table hears the saved campaign only after the write', async () => {
      await update(ANA_ID, { name: 'Vharn' });
      expect(changed.updated).toEqual([
        {
          campaign: expect.objectContaining({ id: VHARN_ID, name: 'Vharn' }),
          writesBefore: [`update:${VHARN_ID}`],
        },
      ]);
      expect(changed.updated[0]?.campaign).not.toHaveProperty('myRole');
    });

    it('a player is refused with FORBIDDEN and nothing is written nor told', async () => {
      await expect(update(BIA_ID, { name: 'Vharn' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(campaigns.writes).toEqual([]);
      expect(changed.updated).toEqual([]);
    });

    it('the master without the table open is refused with CAMPAIGN_NOT_OPEN and nothing is written nor told', async () => {
      masterAwayFromTable();
      await expect(update(ANA_ID, { name: 'Vharn' })).rejects.toMatchObject({
        code: 'CAMPAIGN_NOT_OPEN',
      });
      expect(campaigns.writes).toEqual([]);
      expect(changed.updated).toEqual([]);
    });

    it('someone outside the table is refused with CAMPAIGN_NOT_FOUND', async () => {
      await expect(update(CAIO_ID, { name: 'Vharn' })).rejects.toMatchObject({
        code: 'CAMPAIGN_NOT_FOUND',
      });
      expect(campaigns.writes).toEqual([]);
    });

    it('an absent password keeps the hash', async () => {
      await update(ANA_ID, { name: 'Vharn' });
      expect(campaigns.rows[0]?.passwordHash).toBe('hashed:velha');
    });

    it('a null password removes the hash', async () => {
      const detail = await update(ANA_ID, { password: null });
      expect(campaigns.rows[0]?.passwordHash).toBeNull();
      expect(detail.hasPassword).toBe(false);
    });

    it('a new password stores only its hash', async () => {
      await update(ANA_ID, { password: 'sino' });
      expect(campaigns.rows[0]?.passwordHash).toBe('hashed:sino');
    });

    it('an image cover of this table, sent as a cover, becomes the cover', async () => {
      const detail = await update(ANA_ID, { cover: { kind: 'image', assetId: COVER_ID } });
      expect(detail.cover).toEqual({ kind: 'image', assetId: COVER_ID });
    });

    it('an image of this table sent for a token is refused with INVALID_BODY before any write', async () => {
      assets = new CampaignAssetsFake([lyraPortraitPo({ id: COVER_ID, campaignId: VHARN_ID })]);
      build();
      await expect(
        update(ANA_ID, { cover: { kind: 'image', assetId: COVER_ID } }),
      ).rejects.toMatchObject({ code: 'INVALID_BODY' });
      expect(campaigns.writes).toEqual([]);
    });

    it('on a Grátis owner a new cover image is refused campaignArt and nothing is written', async () => {
      onFreePlan();
      await expect(
        update(ANA_ID, { cover: { kind: 'image', assetId: COVER_ID } }),
      ).rejects.toMatchObject({ code: 'PLAN_LIMIT', resource: 'campaignArt', plan: 'free' });
      expect(campaigns.writes).toEqual([]);
    });

    it('on a Grátis owner turning the public table private is refused privateCampaign', async () => {
      onFreePlan();
      campaigns.rows[0]!.visibility = 'public';
      await expect(update(ANA_ID, { visibility: 'private' })).rejects.toMatchObject({
        resource: 'privateCampaign',
      });
      expect(campaigns.writes).toEqual([]);
    });

    it('on a Grátis owner the private table keeps saving other fields while private', async () => {
      onFreePlan();
      campaigns.rows[0]!.visibility = 'private';
      const detail = await update(ANA_ID, { name: 'Vharn', visibility: 'private' });
      expect(detail).toMatchObject({ name: 'Vharn', visibility: 'private' });
    });

    it('a cover asset of another table is refused with INVALID_BODY', async () => {
      assets = new CampaignAssetsFake([
        lyraPortraitPo({ id: COVER_ID, campaignId: QUELM_ID, purpose: 'cover' }),
      ]);
      build();
      await expect(
        update(ANA_ID, { cover: { kind: 'image', assetId: COVER_ID } }),
      ).rejects.toMatchObject({ code: 'INVALID_BODY' });
    });
  });

  describe('regenerateJoinCode', () => {
    it('the master gets a new code, saved before the table hears of it', async () => {
      const detail = await service.regenerateJoinCode(ANA_ID, VHARN_ID);
      expect(detail.joinCode).toBe('PNTN2345');
      expect(campaigns.rows[0]?.joinCode).toBe('PNTN2345');
      expect(changed.updated[0]?.writesBefore).toEqual(['replaceJoinCode:PNTN2345']);
    });

    it('a code taken by another table is replaced by the next one', async () => {
      campaigns.rows.push(campaignPo({ id: 'taken', joinCode: 'PNTN2345' }));
      expect((await service.regenerateJoinCode(ANA_ID, VHARN_ID)).joinCode).toBe('ZZZZ2345');
    });

    it('three taken codes give up citing the attempts', async () => {
      for (const joinCode of ['PNTN2345', 'ZZZZ2345', 'YYYY2345']) {
        campaigns.rows.push(campaignPo({ id: `taken-${joinCode}`, joinCode }));
      }
      await expect(service.regenerateJoinCode(ANA_ID, VHARN_ID)).rejects.toMatchObject({
        code: 'CAMPAIGN_CODE_EXHAUSTED',
        message: expect.stringContaining('PNTN2345, ZZZZ2345, YYYY2345'),
      });
    });

    it('a player is refused with FORBIDDEN and no code is generated', async () => {
      await expect(service.regenerateJoinCode(BIA_ID, VHARN_ID)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(codes.generated).toEqual([]);
    });

    it('the master without the table open is refused with CAMPAIGN_NOT_OPEN and nothing is told', async () => {
      masterAwayFromTable();
      await expect(service.regenerateJoinCode(ANA_ID, VHARN_ID)).rejects.toMatchObject({
        code: 'CAMPAIGN_NOT_OPEN',
      });
      expect(codes.generated).toEqual([]);
      expect(campaigns.writes).toEqual([]);
      expect(changed.updated).toEqual([]);
    });
  });

  describe('ownerLimitsChanged', () => {
    function caioOwnsQuelm(): void {
      const quelm = campaigns.rows[1];
      if (quelm) campaigns.rows[1] = { ...quelm, ownerId: CAIO_ID };
    }

    it("each live table of the owner hears itself read again with the owner's limits", async () => {
      caioOwnsQuelm();

      await service.ownerLimitsChanged(CAIO_ID);

      expect(changed.updated.map(({ campaign }) => campaign.id)).toEqual([QUELM_ID]);
      expect(changed.updated[0]?.campaign).toMatchObject({
        ownerId: CAIO_ID,
        limits: PLAN_LIMITS.free,
      });
      expect(changed.updated[0]?.campaign).not.toHaveProperty('myRole');
    });

    it('a table Ana only plays or does not own stays silent; Bia, who owns none, tells nobody', async () => {
      caioOwnsQuelm();

      await service.ownerLimitsChanged(ANA_ID);
      await service.ownerLimitsChanged(BIA_ID);

      expect(changed.updated.map(({ campaign }) => campaign.id)).toEqual([VHARN_ID]);
    });
  });

  describe('delete', () => {
    it('the master deletes the table, forgets its memberships and then tells the live table', async () => {
      await service.delete(ANA_ID, VHARN_ID);
      expect(campaigns.rows.map(({ id }) => id)).toEqual([QUELM_ID]);
      expect(forgotten.forgotten).toEqual([VHARN_ID]);
      expect(changed.deleted).toEqual([
        {
          campaignId: VHARN_ID,
          writesBefore: [`lock:${VHARN_ID}`, `delete:${VHARN_ID}`, 'commit'],
        },
      ]);
    });

    it("the keys of the table's 3 files are queued in the deletion's transaction, the other table's stay out", async () => {
      assets = new CampaignAssetsFake([
        lyraPortraitPo({ id: 'a1', storageKey: 'assets/own-1' }),
        lyraPortraitPo({ id: 'a2', storageKey: 'assets/own-2' }),
        lyraPortraitPo({ id: 'a3', storageKey: 'assets/own-3' }),
        lyraPortraitPo({ id: 'q1', campaignId: QUELM_ID, storageKey: 'assets/quelm' }),
      ]);
      build();

      await service.delete(ANA_ID, VHARN_ID);

      expect(deletions.committed).toEqual(['assets/own-1', 'assets/own-2', 'assets/own-3']);
      expect(changed.deleted[0]?.writesBefore.at(-1)).toBe('commit');
    });

    it('a deletion that fails after the keys were queued rolls them back with the table', async () => {
      failDeleteWith = new Error('DELETE FROM campaigns answered 40P01 (deadlock)');
      build();

      await expect(service.delete(ANA_ID, VHARN_ID)).rejects.toBe(failDeleteWith);

      expect(deletions.committed).toEqual([]);
      expect(forgotten.forgotten).toEqual([]);
      expect(changed.deleted).toEqual([]);
    });

    it('a player is refused with FORBIDDEN and the table stays', async () => {
      await expect(service.delete(BIA_ID, VHARN_ID)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(campaigns.rows).toHaveLength(2);
      expect(forgotten.forgotten).toEqual([]);
      expect(changed.deleted).toEqual([]);
      expect(deletions.committed).toEqual([]);
    });

    it('the master without the table open is refused with CAMPAIGN_NOT_OPEN and the table stays', async () => {
      masterAwayFromTable();
      await expect(service.delete(ANA_ID, VHARN_ID)).rejects.toMatchObject({
        code: 'CAMPAIGN_NOT_OPEN',
      });
      expect(campaigns.rows).toHaveLength(2);
      expect(forgotten.forgotten).toEqual([]);
      expect(changed.deleted).toEqual([]);
    });

    it('the master of another table gets CAMPAIGN_NOT_FOUND for this one', async () => {
      await expect(service.delete(CAIO_ID, VHARN_ID)).rejects.toMatchObject({
        code: 'CAMPAIGN_NOT_FOUND',
      });
      expect(campaigns.writes).toEqual([]);
    });
  });
});
