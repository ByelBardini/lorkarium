import { beforeEach, describe, expect, it } from 'vitest';
import { TokenAppearanceService } from '../../../src/modules/tokens/token-appearance.service';
import { AssetsDaoFake } from '../../support/assets-fakes';
import { LYRA_PORTRAIT_ID, QUELM_MAP_ID, lyraPortraitPo } from '../../support/assets-factories';
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
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';
import { TokenTransactionRunnerFake, TokensDaoFake } from '../../support/tokens-fakes';
import { BRAM_ID, LYRA_ID, bramRow, lyraPo, lyraRow } from '../../support/tokens-factories';

const NOW = new Date('2026-10-17T21:00:00Z');
const QUELM_TOKEN_ID = '8a7b6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d';
const CHEST_ID = '9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e';
const BIA_OBJECT_ID = '0c9d8e7f-6a5b-4c4d-9e3f-2a1b0c9d8e7f';

describe('TokenAppearanceService', () => {
  let scenes: ScenesDaoFake;
  let tokens: TokensDaoFake;
  let publisher: BoardPublisherFake;
  let service: TokenAppearanceService;

  beforeEach(() => {
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: CAIO_ID, role: 'player' }),
    ]);
    scenes = new ScenesDaoFake([
      scenePo({ version: 4 }),
      scenePo({ id: 'quelm-scene', campaignId: QUELM_ID }),
    ]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    const chest = lyraRow({
      token: lyraPo({ id: CHEST_ID, name: 'Baú', layer: 'objects' }),
      controllerIds: [CAIO_ID],
    });
    const biaOnObjects = lyraRow({ token: lyraPo({ id: BIA_OBJECT_ID, layer: 'objects' }) });
    const quelmToken = lyraRow({ token: lyraPo({ id: QUELM_TOKEN_ID, sceneId: 'quelm-scene' }) });
    tokens = new TokensDaoFake(scenes.journal, [
      lyraRow(),
      bramRow(),
      chest,
      biaOnObjects,
      quelmToken,
    ]);
    publisher = new BoardPublisherFake(scenes.journal);
    const assets = new AssetsDaoFake(
      [],
      [lyraPortraitPo(), lyraPortraitPo({ id: QUELM_MAP_ID, campaignId: QUELM_ID })],
    );
    const transaction = new TokenTransactionRunnerFake(
      scenes,
      tokens,
      new ConditionsDaoFake(),
      new CombatDaoFake(),
      assets,
    );
    service = new TokenAppearanceService({
      members,
      transaction: transaction.run,
      publisher,
      clock: new ClockFake(NOW),
    });
  });

  function tokenOf(tokenId: string) {
    return tokens.rows.find((row) => row.token.id === tokenId)?.token;
  }

  describe('faceMany', () => {
    it('Bia turning her Lyra saves once, bumps once and publishes one token:facedMany', async () => {
      const version = await service.faceMany(BIA_ID, VHARN_ID, {
        faces: [{ tokenId: LYRA_ID, facing: 45 }],
      });

      expect(version).toBe(5);
      expect(tokenOf(LYRA_ID)?.facing).toBe(45);
      expect(scenes.journal).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
      expect(publisher.tokensFacings).toEqual([
        {
          campaignId: VHARN_ID,
          version: 5,
          at: NOW.toISOString(),
          faces: [{ tokenId: LYRA_ID, facing: 45 }],
        },
      ]);
    });

    it('an undo whose facing matches the token goes through', async () => {
      tokens.rows[0] = lyraRow({ token: lyraPo({ facing: 90 }) });

      await service.faceMany(BIA_ID, VHARN_ID, {
        faces: [{ tokenId: LYRA_ID, facing: 0, expect: { facing: 90 } }],
      });

      expect(tokenOf(LYRA_ID)?.facing).toBe(0);
    });

    it('an undo after someone turned Lyra to 180 is STALE_UNDO citing 90 and 180', async () => {
      tokens.rows[0] = lyraRow({ token: lyraPo({ facing: 180 }) });

      const turn = service.faceMany(BIA_ID, VHARN_ID, {
        faces: [{ tokenId: LYRA_ID, facing: 0, expect: { facing: 90 } }],
      });

      await expect(turn).rejects.toMatchObject({
        code: 'STALE_UNDO',
        message: `token ${LYRA_ID} is at facing 180; the undo expected facing 90`,
      });
      expect(scenes.journal).toEqual(['lock']);
    });

    it('Bia turning a token of hers on the objects layer is FORBIDDEN (turning is moving)', async () => {
      const turn = service.faceMany(BIA_ID, VHARN_ID, {
        faces: [{ tokenId: BIA_OBJECT_ID, facing: 90 }],
      });

      await expect(turn).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(publisher.tokensFacings).toEqual([]);
    });

    it('Caio turning the Lyra of Bia is FORBIDDEN and nothing is saved', async () => {
      const turn = service.faceMany(CAIO_ID, VHARN_ID, {
        faces: [{ tokenId: LYRA_ID, facing: 90 }],
      });

      await expect(turn).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(tokenOf(LYRA_ID)?.facing).toBe(0);
    });

    it('a token of Quelm in the group is TOKEN_NOT_FOUND citing it, and none turns', async () => {
      const turn = service.faceMany(ANA_ID, VHARN_ID, {
        faces: [
          { tokenId: LYRA_ID, facing: 90 },
          { tokenId: QUELM_TOKEN_ID, facing: 90 },
        ],
      });

      await expect(turn).rejects.toMatchObject({
        code: 'TOKEN_NOT_FOUND',
        message: expect.stringContaining(QUELM_TOKEN_ID),
      });
      expect(tokenOf(LYRA_ID)?.facing).toBe(0);
    });
  });

  describe('restyleMany', () => {
    it('Bia giving her Lyra a round frame saves it and publishes token:restyledMany', async () => {
      await service.restyleMany(BIA_ID, VHARN_ID, {
        tokenIds: [LYRA_ID],
        style: { frame: 'round' },
      });

      expect(tokenOf(LYRA_ID)?.frame).toBe('round');
      expect(scenes.journal).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
      expect(publisher.tokensRestylings[0]).toMatchObject({
        version: 5,
        tokenIds: [LYRA_ID],
        style: { frame: 'round' },
      });
    });

    it('a flip changes only the flip and keeps the rest of the look', async () => {
      tokens.rows[0] = lyraRow({
        token: lyraPo({ frame: 'round', imageAssetId: LYRA_PORTRAIT_ID }),
      });

      await service.restyleMany(BIA_ID, VHARN_ID, { tokenIds: [LYRA_ID], style: { flipX: true } });

      expect(tokenOf(LYRA_ID)).toMatchObject({
        flipX: true,
        flipY: false,
        frame: 'round',
        imageAssetId: LYRA_PORTRAIT_ID,
      });
    });

    it('marking Lyra defeated changes only the mark and keeps the look', async () => {
      tokens.rows[0] = lyraRow({ token: lyraPo({ frame: 'round', flipX: true }) });

      await service.restyleMany(BIA_ID, VHARN_ID, {
        tokenIds: [LYRA_ID],
        style: { defeated: true },
      });

      expect(tokenOf(LYRA_ID)).toMatchObject({ defeated: true, frame: 'round', flipX: true });
    });

    it('Bia putting out the light of her Lyra saves only the switch, in one version, and publishes it', async () => {
      tokens.rows[0] = lyraRow({ token: lyraPo({ lightBright: '4.00', lightDim: '4.00' }) });

      await service.restyleMany(BIA_ID, VHARN_ID, {
        tokenIds: [LYRA_ID],
        style: { lightLit: false },
      });

      expect(tokenOf(LYRA_ID)).toMatchObject({
        lightLit: false,
        lightBright: '4.00',
        lightDim: '4.00',
      });
      expect(scenes.journal).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
      expect(publisher.tokensRestylings[0]).toMatchObject({
        version: 5,
        tokenIds: [LYRA_ID],
        style: { lightLit: false },
      });
    });

    it('Caio putting out the light of the Lyra of Bia is FORBIDDEN and nothing is saved', async () => {
      const restyle = service.restyleMany(CAIO_ID, VHARN_ID, {
        tokenIds: [LYRA_ID],
        style: { lightLit: false },
      });

      await expect(restyle).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(tokenOf(LYRA_ID)?.lightLit).toBe(true);
      expect(scenes.journal).toEqual(['lock']);
    });

    it('Caio restyling the chest he controls on the objects layer passes (the look ignores the layer)', async () => {
      await service.restyleMany(CAIO_ID, VHARN_ID, {
        tokenIds: [CHEST_ID],
        style: { flipY: true },
      });

      expect(tokenOf(CHEST_ID)?.flipY).toBe(true);
    });

    it('Caio restyling the Lyra of Bia is FORBIDDEN', async () => {
      const restyle = service.restyleMany(CAIO_ID, VHARN_ID, {
        tokenIds: [LYRA_ID],
        style: { frame: 'round' },
      });

      await expect(restyle).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('an image of Quelm is ASSET_NOT_FOUND and nothing is saved', async () => {
      const restyle = service.restyleMany(BIA_ID, VHARN_ID, {
        tokenIds: [LYRA_ID],
        style: { imageAssetId: QUELM_MAP_ID },
      });

      await expect(restyle).rejects.toMatchObject({ code: 'ASSET_NOT_FOUND' });
      expect(tokenOf(LYRA_ID)?.imageAssetId).toBeNull();
      expect(scenes.journal).toEqual(['lock']);
    });

    it('the master restyles Lyra and Bram together with an image of the table', async () => {
      const style = { imageAssetId: LYRA_PORTRAIT_ID };

      await service.restyleMany(ANA_ID, VHARN_ID, { tokenIds: [LYRA_ID, BRAM_ID], style });

      expect([tokenOf(LYRA_ID)?.imageAssetId, tokenOf(BRAM_ID)?.imageAssetId]).toEqual([
        LYRA_PORTRAIT_ID,
        LYRA_PORTRAIT_ID,
      ]);
    });
  });

  describe('resizeMany', () => {
    const WIDE_LYRA = { tokenId: LYRA_ID, col: 2.5, row: 4, width: 1.5, height: 1 };

    it('Bia stretching her Lyra to 1.5×1 at (2.5, 4) saves once and publishes token:resizedMany', async () => {
      const version = await service.resizeMany(BIA_ID, VHARN_ID, { resizes: [WIDE_LYRA] });

      expect(version).toBe(5);
      expect(tokenOf(LYRA_ID)).toMatchObject({ col: 2.5, row: 4, width: 1.5, height: 1 });
      expect(scenes.journal).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
      expect(publisher.tokensResizes).toEqual([
        { campaignId: VHARN_ID, version: 5, at: NOW.toISOString(), resizes: [WIDE_LYRA] },
      ]);
    });

    it('Caio resizing the chest he controls on the objects layer passes (size ignores the layer)', async () => {
      await service.resizeMany(CAIO_ID, VHARN_ID, {
        resizes: [{ tokenId: CHEST_ID, col: 3, row: 4, width: 2, height: 2 }],
      });

      expect(tokenOf(CHEST_ID)).toMatchObject({ width: 2, height: 2 });
    });

    it('Caio resizing the Lyra of Bia is FORBIDDEN and nothing is saved', async () => {
      const resize = service.resizeMany(CAIO_ID, VHARN_ID, { resizes: [WIDE_LYRA] });

      await expect(resize).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(tokenOf(LYRA_ID)).toMatchObject({ width: 1, height: 1 });
      expect(publisher.tokensResizes).toEqual([]);
    });

    it('a box past the scene edge is OUT_OF_SCENE and nothing is saved', async () => {
      const resize = service.resizeMany(ANA_ID, VHARN_ID, {
        resizes: [{ ...WIDE_LYRA, col: 0, width: 10, height: 10, row: 10 }],
      });

      await expect(resize).rejects.toMatchObject({ code: 'OUT_OF_SCENE' });
      expect(scenes.journal).toEqual(['lock']);
    });

    it('an undo after someone resized Lyra is STALE_UNDO and nothing is saved', async () => {
      tokens.rows[0] = lyraRow({ token: lyraPo({ width: 2, height: 2 }) });

      const undo = service.resizeMany(BIA_ID, VHARN_ID, {
        resizes: [{ ...WIDE_LYRA, expect: { col: 3, row: 4, width: 1, height: 1 } }],
      });

      await expect(undo).rejects.toMatchObject({ code: 'STALE_UNDO' });
      expect(scenes.journal).toEqual(['lock']);
    });

    it('a token of Quelm in the group is TOKEN_NOT_FOUND, and none is resized', async () => {
      const resize = service.resizeMany(ANA_ID, VHARN_ID, {
        resizes: [WIDE_LYRA, { ...WIDE_LYRA, tokenId: QUELM_TOKEN_ID }],
      });

      await expect(resize).rejects.toMatchObject({ code: 'TOKEN_NOT_FOUND' });
      expect(tokenOf(LYRA_ID)).toMatchObject({ width: 1 });
    });
  });
});
