import type { NewTokenDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { TokenBatchService } from '../../../src/modules/tokens/token-batch.service';
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
import { AssetsDaoFake } from '../../support/assets-fakes';
import { LYRA_PORTRAIT_ID, QUELM_MAP_ID, lyraPortraitPo } from '../../support/assets-factories';
import { ConditionsDaoFake } from '../../support/conditions-fakes';
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';
import { TokenTransactionRunnerFake, TokensDaoFake } from '../../support/tokens-fakes';
import { BRAM_ID, LYRA_ID, bramRow, lyraPo, lyraRow } from '../../support/tokens-factories';

const NOW = new Date('2026-10-16T21:00:00Z');
const QUELM_TOKEN_ID = '8a7b6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d';
const GOBLIN: NewTokenDto = {
  name: 'Goblin 2',
  initials: 'G2',
  side: 'enemy',
  size: 1,
  col: 10,
  row: 6,
  layer: 'tokens',
  controllerIds: [CAIO_ID],
  imageAssetId: null,
  frame: 'square',
  flipX: false,
  flipY: false,
  facing: 0,
  bars: [{ label: 'PV', current: 7, max: 7, color: 'ember', visibility: 'controllers' }],
};

describe('TokenBatchService', () => {
  let scenes: ScenesDaoFake;
  let tokens: TokensDaoFake;
  let combat: CombatDaoFake;
  let publisher: BoardPublisherFake;
  let service: TokenBatchService;

  beforeEach(() => {
    const members = new CampaignMembersDaoFake(
      new CampaignsDaoFake(),
      { [ANA_ID]: 'Ana', [BIA_ID]: 'Bia', [CAIO_ID]: 'Caio' },
      [
        campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
        campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
        campaignMemberPo({ campaignId: VHARN_ID, userId: CAIO_ID, role: 'player' }),
        campaignMemberPo({ campaignId: QUELM_ID, userId: CAIO_ID, role: 'master' }),
      ],
    );
    scenes = new ScenesDaoFake([
      scenePo({ version: 4 }),
      scenePo({ id: 'quelm-scene', campaignId: QUELM_ID }),
    ]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    scenes.activeOf.set(QUELM_ID, 'quelm-scene');
    const quelmToken = lyraRow({ token: lyraPo({ id: QUELM_TOKEN_ID, sceneId: 'quelm-scene' }) });
    tokens = new TokensDaoFake(scenes.journal, [lyraRow(), bramRow(), quelmToken]);
    combat = new CombatDaoFake();
    publisher = new BoardPublisherFake(scenes.journal);
    const assets = new AssetsDaoFake(
      [],
      [lyraPortraitPo(), lyraPortraitPo({ id: QUELM_MAP_ID, campaignId: QUELM_ID })],
    );
    const transaction = new TokenTransactionRunnerFake(
      scenes,
      tokens,
      new ConditionsDaoFake(),
      combat,
      assets,
    );
    service = new TokenBatchService({
      members,
      transaction: transaction.run,
      publisher,
      clock: new ClockFake(NOW),
      barLimit: 99_999,
    });
  });

  describe('createMany', () => {
    it('the master pasting three tokens saves once, bumps once and publishes once after the commit', async () => {
      const created = await service.createMany(ANA_ID, VHARN_ID, {
        tokens: [GOBLIN, { ...GOBLIN, col: 11 }, { ...GOBLIN, col: 12 }],
      });

      expect(created).toEqual({ version: 5, createdIds: ['token-4', 'token-5', 'token-6'] });
      expect(scenes.journal).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
      expect(tokens.rows.slice(3).map(({ token }) => token.col)).toEqual([10, 11, 12]);
    });

    it('token:createdMany carries each token whole for its controllers and without the hidden PV for the rest', async () => {
      await service.createMany(ANA_ID, VHARN_ID, { tokens: [GOBLIN] });

      const [creation] = publisher.tokensCreations;
      expect(creation).toMatchObject({ campaignId: VHARN_ID, version: 5, at: NOW.toISOString() });
      expect(creation?.tokens).toEqual([
        expect.objectContaining({
          controllerIds: [CAIO_ID],
          privileged: expect.objectContaining({ name: 'Goblin 2', canControl: true }),
          others: expect.objectContaining({ name: 'Goblin 2', canControl: false, bars: [] }),
        }),
      ]);
      expect(creation?.tokens[0]?.privileged.bars).toHaveLength(1);
    });

    it('a player pasting tokens is refused with FORBIDDEN and nothing is locked', async () => {
      await expect(
        service.createMany(BIA_ID, VHARN_ID, { tokens: [GOBLIN] }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(scenes.journal).toEqual([]);
    });

    it('one of three past the edge is OUT_OF_SCENE and none of them is created', async () => {
      await expect(
        service.createMany(ANA_ID, VHARN_ID, {
          tokens: [GOBLIN, { ...GOBLIN, col: 20 }, { ...GOBLIN, col: 12 }],
        }),
      ).rejects.toMatchObject({ code: 'OUT_OF_SCENE' });
      expect(tokens.rows).toHaveLength(3);
      expect(scenes.journal).toEqual(['lock']);
    });

    it('one image of another table among three is ASSET_NOT_FOUND and none of them is created', async () => {
      const pasted = [
        { ...GOBLIN, imageAssetId: LYRA_PORTRAIT_ID },
        { ...GOBLIN, imageAssetId: QUELM_MAP_ID },
        GOBLIN,
      ];

      const created = service.createMany(ANA_ID, VHARN_ID, { tokens: pasted });

      await expect(created).rejects.toMatchObject({ code: 'ASSET_NOT_FOUND' });
      expect(tokens.rows).toHaveLength(3);
      expect(scenes.journal).toEqual(['lock']);
    });

    it('a controller from outside the table is INVALID_CONTROLLER', async () => {
      const stranger = '00000000-0000-4000-8000-000000000000';

      await expect(
        service.createMany(ANA_ID, VHARN_ID, {
          tokens: [{ ...GOBLIN, controllerIds: [stranger] }],
        }),
      ).rejects.toMatchObject({ code: 'INVALID_CONTROLLER' });
    });
  });

  describe('deleteMany', () => {
    it('the master deleting Lyra and Bram where the undo expects them publishes one token:deletedMany', async () => {
      const version = await service.deleteMany(ANA_ID, VHARN_ID, {
        tokenIds: [LYRA_ID, BRAM_ID],
        expect: [
          { tokenId: LYRA_ID, col: 3, row: 4 },
          { tokenId: BRAM_ID, col: 6, row: 4 },
        ],
      });

      expect(version).toBe(5);
      expect(publisher.tokensDeletes).toEqual([
        {
          campaignId: VHARN_ID,
          version: 5,
          at: NOW.toISOString(),
          tokenIds: [LYRA_ID, BRAM_ID],
          combat: null,
        },
      ]);
      expect(tokens.rows.map(({ token }) => token.id)).toEqual([QUELM_TOKEN_ID]);
    });

    it('deleting the token on turn passes the turn to the next one in the same transaction', async () => {
      const started = await combat.start(VHARN_SCENE_ID, [LYRA_ID, BRAM_ID]);
      await combat.setTurn(started.combat.id, 1, `c-${LYRA_ID}`);

      await service.deleteMany(ANA_ID, VHARN_ID, { tokenIds: [LYRA_ID] });

      expect(publisher.tokensDeletes[0]?.combat).toMatchObject({
        round: 1,
        currentCombatantId: `c-${BRAM_ID}`,
      });
    });

    it('an undo of a paste whose token Caio moved since is STALE_UNDO citing it, and nothing is deleted', async () => {
      await expect(
        service.deleteMany(ANA_ID, VHARN_ID, {
          tokenIds: [LYRA_ID, BRAM_ID],
          expect: [{ tokenId: BRAM_ID, col: 9, row: 9 }],
        }),
      ).rejects.toMatchObject({
        code: 'STALE_UNDO',
        message: `token ${BRAM_ID} is at (6, 4); the undo expected (9, 9)`,
      });
      expect(tokens.rows).toHaveLength(3);
      expect(publisher.published).toBe(0);
    });

    it('a token of Quelm in the group is TOKEN_NOT_FOUND and nothing is deleted', async () => {
      await expect(
        service.deleteMany(ANA_ID, VHARN_ID, { tokenIds: [LYRA_ID, QUELM_TOKEN_ID] }),
      ).rejects.toMatchObject({
        code: 'TOKEN_NOT_FOUND',
        message: expect.stringContaining(QUELM_TOKEN_ID),
      });
      expect(tokens.rows).toHaveLength(3);
    });

    it('a player deleting tokens is refused with FORBIDDEN', async () => {
      await expect(
        service.deleteMany(CAIO_ID, VHARN_ID, { tokenIds: [BRAM_ID] }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });
});
