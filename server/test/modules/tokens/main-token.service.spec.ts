import { beforeEach, describe, expect, it } from 'vitest';
import { MainTokenService } from '../../../src/modules/tokens/main-token.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import {
  BIA_ID,
  CAIO_ID,
  QUELM_ID,
  VHARN_ID,
  campaignMemberPo,
} from '../../support/campaigns-factories';
import { CombatDaoFake } from '../../support/combat-fakes';
import { ConditionsDaoFake } from '../../support/conditions-fakes';
import { AssetsDaoFake } from '../../support/assets-fakes';
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';
import { WallsDaoFake } from '../../support/walls-fakes';
import {
  MainTokensDaoFake,
  TokenTransactionRunnerFake,
  TokensDaoFake,
} from '../../support/tokens-fakes';
import { LYRA_ID, bramRow, lyraPo, lyraRow } from '../../support/tokens-factories';

const NOW = new Date('2026-10-21T21:00:00Z');
const QUELM_TOKEN_ID = '8a7b6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d';
const STRANGER_ID = 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b';

describe('MainTokenService', () => {
  let scenes: ScenesDaoFake;
  let mainTokens: MainTokensDaoFake;
  let publisher: BoardPublisherFake;
  let service: MainTokenService;

  beforeEach(() => {
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: CAIO_ID, role: 'player' }),
    ]);
    scenes = new ScenesDaoFake([
      scenePo({ version: 7 }),
      scenePo({ id: 'quelm-scene', campaignId: QUELM_ID }),
    ]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    const quelmToken = lyraRow({ token: lyraPo({ id: QUELM_TOKEN_ID, sceneId: 'quelm-scene' }) });
    const tokens = new TokensDaoFake(scenes.journal, [lyraRow(), bramRow(), quelmToken]);
    mainTokens = new MainTokensDaoFake(scenes.journal);
    publisher = new BoardPublisherFake(scenes.journal);
    const transaction = new TokenTransactionRunnerFake(
      scenes,
      tokens,
      new ConditionsDaoFake(),
      new CombatDaoFake(),
      new AssetsDaoFake(),
      new WallsDaoFake([]),
      mainTokens,
    );
    service = new MainTokenService({
      members,
      transaction: transaction.run,
      publisher,
      clock: new ClockFake(NOW),
    });
  });

  it('Bia choosing Lyra locks, chooses, bumps, commits and then publishes token:mainChanged', async () => {
    const version = await service.choose(BIA_ID, VHARN_ID, { tokenId: LYRA_ID });

    expect(version).toBe(8);
    expect(scenes.journal).toEqual(['lock', 'choose', 'bump', 'commit', 'publish']);
    expect(mainTokens.choices).toEqual([
      { sceneId: VHARN_SCENE_ID, userId: BIA_ID, tokenId: LYRA_ID },
    ]);
    expect(publisher.mainTokenChanges).toEqual([
      {
        campaignId: VHARN_ID,
        sceneId: VHARN_SCENE_ID,
        version: 8,
        at: NOW.toISOString(),
        userId: BIA_ID,
        tokenId: LYRA_ID,
      },
    ]);
  });

  it('Caio, not listed in the control of Lyra, is FORBIDDEN: nothing chosen, bumped or published', async () => {
    await expect(service.choose(CAIO_ID, VHARN_ID, { tokenId: LYRA_ID })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    expect(scenes.journal).toEqual(['lock']);
    expect(publisher.mainTokenChanges).toEqual([]);
  });

  it('Ana, master but not listed in the control of Lyra, is FORBIDDEN', async () => {
    await expect(service.choose(ANA_ID, VHARN_ID, { tokenId: LYRA_ID })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(mainTokens.choices).toEqual([]);
  });

  it('a token of the Quelm scene is TOKEN_NOT_FOUND citing its id, and nothing is chosen', async () => {
    await expect(
      service.choose(BIA_ID, VHARN_ID, { tokenId: QUELM_TOKEN_ID }),
    ).rejects.toMatchObject({
      code: 'TOKEN_NOT_FOUND',
      message: expect.stringContaining(QUELM_TOKEN_ID),
    });
    expect(mainTokens.choices).toEqual([]);
  });

  it('someone who is not a member of Vharn is CAMPAIGN_NOT_FOUND', async () => {
    await expect(service.choose(STRANGER_ID, VHARN_ID, { tokenId: LYRA_ID })).rejects.toMatchObject(
      { code: 'CAMPAIGN_NOT_FOUND' },
    );
    expect(scenes.journal).toEqual([]);
  });

  describe('for a player', () => {
    it('Ana, the master, makes Lyra the main token of Bia: saved and published for Bia', async () => {
      await service.choose(ANA_ID, VHARN_ID, { tokenId: LYRA_ID, playerId: BIA_ID });

      expect(mainTokens.choices).toEqual([
        { sceneId: VHARN_SCENE_ID, userId: BIA_ID, tokenId: LYRA_ID },
      ]);
      expect(publisher.mainTokenChanges).toEqual([
        expect.objectContaining({ userId: BIA_ID, tokenId: LYRA_ID }),
      ]);
    });

    it('Caio, a player, choosing for Bia is FORBIDDEN and nothing is saved', async () => {
      await expect(
        service.choose(CAIO_ID, VHARN_ID, { tokenId: LYRA_ID, playerId: BIA_ID }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(mainTokens.choices).toEqual([]);
    });

    it('Ana choosing Lyra for Caio, who is not in its control, is FORBIDDEN', async () => {
      await expect(
        service.choose(ANA_ID, VHARN_ID, { tokenId: LYRA_ID, playerId: CAIO_ID }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(publisher.mainTokenChanges).toEqual([]);
    });
  });
});
