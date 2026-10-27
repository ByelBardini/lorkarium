import type { NewTokenDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { TokenBatchService } from '../../../src/modules/tokens/token-batch.service';
import { TokensService, type CreateToken } from '../../../src/modules/tokens/tokens.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import { BIA_ID, CAIO_ID, VHARN_ID, campaignMemberPo } from '../../support/campaigns-factories';
import { CombatDaoFake } from '../../support/combat-fakes';
import { ConditionsDaoFake } from '../../support/conditions-fakes';
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';
import {
  DragGroupsFake,
  TableTokenRightsFake,
  TokenTransactionRunnerFake,
  TokensDaoFake,
} from '../../support/tokens-fakes';
import { SceneWallsFake } from '../../support/walls-fakes';
import { BRAM_ID, LYRA_ID, bramRow, lyraPo, lyraRow } from '../../support/tokens-factories';

const NOW = new Date('2026-10-26T21:00:00Z');
const KAEL: CreateToken = {
  name: 'Kael',
  initials: 'KA',
  side: 'ally',
  width: 1,
  height: 1,
  col: 2,
  row: 2,
  layer: 'tokens',
  controllerIds: [CAIO_ID],
  imageAssetId: null,
  frame: 'square',
  flipX: false,
  flipY: false,
  facing: 0,
  sightAngle: 360,
  aura: null,
  bars: [],
};
const COPY: NewTokenDto = {
  ...KAEL,
  layer: 'objects',
  sight: { bright: 6, dim: 0 },
  light: { bright: 4, dim: 4, color: 'torch', angle: 360 },
  sightAngle: 90,
  hidden: true,
  combatantId: `c-${LYRA_ID}`,
};

describe('the player creates, edits and deletes tokens by the table settings', () => {
  let tokens: TokensDaoFake;
  let combat: CombatDaoFake;
  let publisher: BoardPublisherFake;
  let tokenRights: TableTokenRightsFake;
  let service: TokensService;
  let batch: TokenBatchService;

  beforeEach(() => {
    const members = new CampaignMembersDaoFake(
      new CampaignsDaoFake(),
      { [ANA_ID]: 'Ana', [BIA_ID]: 'Bia', [CAIO_ID]: 'Caio' },
      [
        campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
        campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
        campaignMemberPo({ campaignId: VHARN_ID, userId: CAIO_ID, role: 'player' }),
      ],
    );
    const scenes = new ScenesDaoFake([scenePo({ version: 4 })]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    const biaLyra = lyraRow({ token: lyraPo({ createdBy: BIA_ID }) });
    tokens = new TokensDaoFake(scenes.journal, [biaLyra, bramRow()]);
    combat = new CombatDaoFake();
    publisher = new BoardPublisherFake(scenes.journal);
    tokenRights = new TableTokenRightsFake();
    const transaction = new TokenTransactionRunnerFake(
      scenes,
      tokens,
      new ConditionsDaoFake(),
      combat,
    );
    const common = { members, transaction: transaction.run, publisher, clock: new ClockFake(NOW) };
    const limits = { barLimit: 99_999, tokenLimit: 500, tokenRights };
    const walls = {
      dragGroups: new DragGroupsFake(scenes, tokens),
      sceneWalls: new SceneWallsFake(),
    };
    service = new TokensService({ ...common, ...limits, ...walls });
    batch = new TokenBatchService({ ...common, ...limits });
  });

  function created() {
    return tokens.rows.slice(2);
  }

  describe('TokensService', () => {
    it('Bia with the create setting creates Kael: hers, with her first in the control, blind and visible', async () => {
      tokenRights.turnOn(VHARN_ID, { create: true, delete: false });

      await service.create(BIA_ID, VHARN_ID, KAEL);

      const [kael] = created();
      expect(kael?.token).toMatchObject({
        createdBy: BIA_ID,
        sightBright: null,
        lightBright: null,
        hidden: false,
        layer: 'tokens',
      });
      expect(kael?.controllerIds).toEqual([BIA_ID, CAIO_ID]);
      expect(publisher.tokenChanges[0]?.privileged.token.createdBy).toBe(BIA_ID);
    });

    it('Bia without the create setting is refused: nothing saved nor published', async () => {
      await expect(service.create(BIA_ID, VHARN_ID, KAEL)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(created()).toEqual([]);
      expect(publisher.tokenChanges).toEqual([]);
    });

    it('the master creating Kael is its author and never reads the settings', async () => {
      await service.create(ANA_ID, VHARN_ID, KAEL);

      expect(created()[0]?.token.createdBy).toBe(ANA_ID);
      expect(created()[0]?.controllerIds).toEqual([CAIO_ID]);
      expect(tokenRights.reads).toEqual([]);
    });

    it('Bia renaming the Lyra she created saves it', async () => {
      tokenRights.turnOn(VHARN_ID, { create: true, delete: false });

      await service.update(BIA_ID, VHARN_ID, {
        ...KAEL,
        tokenId: LYRA_ID,
        controllerIds: [BIA_ID],
      });

      expect(tokens.rows[0]?.token.name).toBe('Kael');
      expect(publisher.tokenChanges).toHaveLength(1);
    });

    it('Bia taking herself out of the control of her Lyra is refused without saving nor publishing', async () => {
      tokenRights.turnOn(VHARN_ID, { create: true, delete: false });
      const update = { ...KAEL, tokenId: LYRA_ID, controllerIds: [CAIO_ID] };

      await expect(service.update(BIA_ID, VHARN_ID, update)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('the creator stays in the control'),
      });
      expect(tokens.rows[0]?.token.name).toBe('Lyra');
      expect(publisher.tokenChanges).toEqual([]);
    });

    it('Bia editing the Bram of Caio is refused even with the create setting', async () => {
      tokenRights.turnOn(VHARN_ID, { create: true, delete: true });
      const update = { ...KAEL, tokenId: BRAM_ID, controllerIds: [CAIO_ID] };

      await expect(service.update(BIA_ID, VHARN_ID, update)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('Bia deleting her Lyra with the delete setting off is refused, and Lyra stays', async () => {
      tokenRights.turnOn(VHARN_ID, { create: true, delete: false });

      await expect(service.delete(BIA_ID, VHARN_ID, { tokenId: LYRA_ID })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(tokens.rows.map(({ token }) => token.id)).toContain(LYRA_ID);
      expect(publisher.tokenDeletes).toEqual([]);
    });

    it('Bia deleting her Lyra with the delete setting on removes it', async () => {
      tokenRights.turnOn(VHARN_ID, { create: false, delete: true });

      await service.delete(BIA_ID, VHARN_ID, { tokenId: LYRA_ID });

      expect(tokens.rows.map(({ token }) => token.id)).toEqual([BRAM_ID]);
    });
  });

  describe('TokenBatchService', () => {
    it('the copies Bia pastes leave the combat and land visible, blind, on Tokens and hers', async () => {
      tokenRights.turnOn(VHARN_ID, { create: true, delete: false });
      await combat.start(VHARN_SCENE_ID, [
        { name: 'Inimigos', tokenIds: [LYRA_ID], initiative: null },
      ]);

      await batch.createMany(BIA_ID, VHARN_ID, { tokens: [COPY, { ...COPY, col: 3 }] });

      expect(created().map(({ token }) => token.layer)).toEqual(['tokens', 'tokens']);
      expect(created()[0]?.token).toMatchObject({
        createdBy: BIA_ID,
        hidden: false,
        sightBright: null,
        lightBright: null,
        sightAngle: 360,
      });
      expect(created().map(({ controllerIds }) => controllerIds)).toEqual([
        [BIA_ID, CAIO_ID],
        [BIA_ID, CAIO_ID],
      ]);
      expect(publisher.tokensCreations[0]?.combat?.combatants[0]?.tokenIds).toEqual([LYRA_ID]);
    });

    it('Bia pasting without the create setting is refused and nothing is created', async () => {
      await expect(batch.createMany(BIA_ID, VHARN_ID, { tokens: [COPY] })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(created()).toEqual([]);
    });

    it('a batch of Bia with the Bram of Caio in it is refused and nothing goes', async () => {
      tokenRights.turnOn(VHARN_ID, { create: true, delete: true });

      const deleting = batch.deleteMany(BIA_ID, VHARN_ID, { tokenIds: [LYRA_ID, BRAM_ID] });

      await expect(deleting).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining(`delete token ${BRAM_ID}`),
      });
      expect(tokens.rows).toHaveLength(2);
      expect(publisher.tokensDeletes).toEqual([]);
    });

    it('Bia undoing her own paste with the delete setting removes the copies', async () => {
      tokenRights.turnOn(VHARN_ID, { create: true, delete: true });
      const { createdIds } = await batch.createMany(BIA_ID, VHARN_ID, { tokens: [COPY] });

      await batch.deleteMany(BIA_ID, VHARN_ID, { tokenIds: createdIds });

      expect(created()).toEqual([]);
    });
  });
});
