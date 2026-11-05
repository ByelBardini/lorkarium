import type { NewTokenDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { TokenBatchService } from '../../../src/modules/tokens/token-batch.service';
import {
  TokensService,
  type CreateToken,
  type UpdateToken,
} from '../../../src/modules/tokens/tokens.service';
import type { TokenRow } from '../../../src/modules/tokens/tokens.dao';
import { SceneWallsService } from '../../../src/modules/walls/scene-walls.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, QUELM_ID, VHARN_ID } from '../../support/campaigns-factories';
import {
  CharacterTableFake,
  ESTRADA_LYRA_ID,
  QUELM_SCENE_ID,
  VHARN_SCENE_ID,
  VHARN_TORRE_ID,
  linkedLyraRow,
} from '../../support/character-fakes';
import { DragGroupsFake, TableTokenRightsFake } from '../../support/tokens-fakes';
import { LYRA_ID, lyraPo, lyraRow } from '../../support/tokens-factories';

const CEILING = 50;
const LIMIT_REFUSAL = {
  code: 'TOKEN_BLOCKER_LIMIT',
  message: 'the scene would have 51 sight-blocking tokens (50 stored + 1 added); the limit is 50',
};
const STATUE: CreateToken = {
  name: 'Estátua',
  initials: 'ES',
  side: 'neutral',
  width: 2,
  height: 2,
  col: 6,
  row: 6,
  layer: 'objects',
  controllerIds: [],
  imageAssetId: null,
  frame: 'square',
  flipX: false,
  flipY: false,
  facing: 0,
  sightAngle: 360,
  aura: null,
  bars: [],
};
const COPY: NewTokenDto = { ...STATUE, hidden: false, blocksSight: true };

function editOf(tokenId: string, overrides: Partial<UpdateToken> = {}): UpdateToken {
  const fields = { name: 'Lyra', initials: 'LY', side: 'ally', width: 1, height: 1 } as const;
  return { tokenId, ...fields, controllerIds: [BIA_ID], bars: [], ...overrides };
}

function blockersOn(sceneId: string, total: number): TokenRow[] {
  return Array.from({ length: total }, (_, index) => {
    const id = `blocker-${sceneId}-${index}`;
    return lyraRow({ token: lyraPo({ id, sceneId, blocksSight: true }), bars: [] });
  });
}

describe('blocksSight on the token commands', () => {
  let table: CharacterTableFake;
  let tokenRights: TableTokenRightsFake;
  let service: TokensService;
  let batch: TokenBatchService;

  beforeEach(() => {
    table = new CharacterTableFake();
    tokenRights = new TableTokenRightsFake();
    const { members, publisher, characterPublisher, clock } = table;
    const common = { members, transaction: table.transaction.run, publisher, clock, tokenRights };
    const limits = { barLimit: 99_999, tokenLimit: 500, blockerLimit: CEILING };
    const walls = {
      dragGroups: new DragGroupsFake(table.scenes, table.tokens),
      sceneWalls: new SceneWallsService(),
    };
    service = new TokensService({ ...common, ...limits, ...walls, characterPublisher });
    batch = new TokenBatchService({ ...common, ...limits });
  });

  const rowOf = (tokenId: string) => table.tokens.rows.find(({ token }) => token.id === tokenId);
  const versionOf = (sceneId: string) =>
    table.scenes.rows.find(({ id }) => id === sceneId)?.version;
  const created = () => table.tokens.rows.at(-1)?.token;

  function fill(sceneId: string, total: number): void {
    table.tokens.rows.push(...blockersOn(sceneId, total));
  }

  function expectNothingWritten(rowsBefore: number): void {
    expect(table.tokens.rows).toHaveLength(rowsBefore);
    expect(versionOf(VHARN_SCENE_ID)).toBe(4);
    expect(table.publisher.tokenChanges).toEqual([]);
    expect(table.publisher.tokensCreations).toEqual([]);
    expect(table.journal).not.toContain('save');
    expect(table.journal).not.toContain('commit');
  }

  describe('the master turns it on and off', () => {
    it('Ana sending blocksSight true saves it and token:updated carries it to every audience', async () => {
      const version = await service.update(
        ANA_ID,
        VHARN_ID,
        editOf(LYRA_ID, { blocksSight: true }),
      );

      expect(version).toBe(5);
      expect(rowOf(LYRA_ID)?.token.blocksSight).toBe(true);
      const [change] = table.publisher.tokenChanges;
      expect(change?.privileged.token.blocksSight).toBe(true);
      expect(change?.others.token.blocksSight).toBe(true);
    });

    it('an edit that leaves the field out keeps a blocker blocking', async () => {
      await service.update(ANA_ID, VHARN_ID, editOf(LYRA_ID, { blocksSight: true }));

      await service.update(ANA_ID, VHARN_ID, editOf(LYRA_ID));

      expect(rowOf(LYRA_ID)?.token.blocksSight).toBe(true);
    });

    it('Ana creating a statue with blocksSight true saves it', async () => {
      await service.create(ANA_ID, VHARN_ID, { ...STATUE, blocksSight: true });

      expect(created()?.blocksSight).toBe(true);
    });

    it('a token created without the field does not block', async () => {
      await service.create(ANA_ID, VHARN_ID, STATUE);

      expect(created()?.blocksSight).toBe(false);
      expect(table.publisher.tokenChanges[0]?.others.token.blocksSight).toBe(false);
    });

    it('on a linked token it stays on the token of that grid, and the characters do not change', async () => {
      table.tokens.rows.push(linkedLyraRow());
      const edit = editOf(ESTRADA_LYRA_ID, { sceneId: VHARN_TORRE_ID, blocksSight: true });

      await service.update(ANA_ID, VHARN_ID, edit);

      expect(rowOf(ESTRADA_LYRA_ID)?.token.blocksSight).toBe(true);
      expect(table.publisher.tokenChanges[0]?.others.token.blocksSight).toBe(true);
      expect(table.characters.rows[0]?.character).not.toHaveProperty('blocksSight');
    });
  });

  describe('only the master sets it', () => {
    beforeEach(() => {
      tokenRights.turnOn(VHARN_ID, { create: true, delete: true });
    });

    it('Bia, author with the create setting, changing it is FORBIDDEN citing the master role', async () => {
      table.tokens.rows[0] = lyraRow({ token: lyraPo({ createdBy: BIA_ID }) });
      const edit = editOf(LYRA_ID, { blocksSight: true });

      await expect(service.update(BIA_ID, VHARN_ID, edit)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringMatching(/blocksSight.*the master role/),
      });
      expect(rowOf(LYRA_ID)?.token.blocksSight).toBe(false);
      expect(table.publisher.tokenChanges).toEqual([]);
    });

    it('Bia, who controls a linked token, changing it is FORBIDDEN citing the master role', async () => {
      table.tokens.rows.push(linkedLyraRow());
      const edit = editOf(ESTRADA_LYRA_ID, { sceneId: VHARN_TORRE_ID, blocksSight: true });

      await expect(service.update(BIA_ID, VHARN_ID, edit)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringMatching(/blocksSight.*the master role/),
      });
      expect(rowOf(ESTRADA_LYRA_ID)?.token.blocksSight).toBe(false);
    });

    it('Bia sending the value it already has edits normally', async () => {
      table.tokens.rows[0] = lyraRow({ token: lyraPo({ createdBy: BIA_ID, blocksSight: true }) });
      const edit = editOf(LYRA_ID, { name: 'Lyra II', blocksSight: true });

      await service.update(BIA_ID, VHARN_ID, edit);

      expect(rowOf(LYRA_ID)?.token).toMatchObject({ name: 'Lyra II', blocksSight: true });
    });

    it('Bia creating a token with it is FORBIDDEN and nothing is written', async () => {
      const rowsBefore = table.tokens.rows.length;
      const create = service.create(BIA_ID, VHARN_ID, {
        ...STATUE,
        layer: 'tokens',
        blocksSight: true,
      });

      await expect(create).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('create a token with blocksSight'),
      });
      expectNothingWritten(rowsBefore);
    });

    it('Bia creating a token with it off creates hers: it is what a new token has', async () => {
      await service.create(BIA_ID, VHARN_ID, { ...STATUE, layer: 'tokens', blocksSight: false });

      expect(created()).toMatchObject({ createdBy: BIA_ID, blocksSight: false });
    });

    it('a copy pasted by Bia lands without it: her new token never blocks', async () => {
      await batch.createMany(BIA_ID, VHARN_ID, { tokens: [COPY] });

      expect(created()?.blocksSight).toBe(false);
      expect(table.tokens.blockerCounts).toEqual([]);
    });
  });

  describe('the ceiling of 50 per scene', () => {
    it('the 50th blocker of a scene passes', async () => {
      fill(VHARN_SCENE_ID, CEILING - 1);

      await service.create(ANA_ID, VHARN_ID, { ...STATUE, blocksSight: true });

      expect(created()?.blocksSight).toBe(true);
    });

    it('the 51st by token:update is TOKEN_BLOCKER_LIMIT: not saved, no version, no event', async () => {
      fill(VHARN_SCENE_ID, CEILING);
      const rowsBefore = table.tokens.rows.length;
      const edit = editOf(LYRA_ID, { blocksSight: true });

      await expect(service.update(ANA_ID, VHARN_ID, edit)).rejects.toMatchObject(LIMIT_REFUSAL);

      expect(rowOf(LYRA_ID)?.token.blocksSight).toBe(false);
      expectNothingWritten(rowsBefore);
    });

    it('the 51st by token:create is TOKEN_BLOCKER_LIMIT: not saved, no version, no event', async () => {
      fill(VHARN_SCENE_ID, CEILING);
      const rowsBefore = table.tokens.rows.length;
      const create = service.create(ANA_ID, VHARN_ID, { ...STATUE, blocksSight: true });

      await expect(create).rejects.toMatchObject(LIMIT_REFUSAL);

      expectNothingWritten(rowsBefore);
    });

    it('the 51st by token:createMany refuses the whole paste, citing the blockers it adds', async () => {
      fill(VHARN_SCENE_ID, CEILING - 1);
      const rowsBefore = table.tokens.rows.length;
      const plain = { ...COPY, blocksSight: false };
      const paste = batch.createMany(ANA_ID, VHARN_ID, { tokens: [COPY, COPY, plain] });

      await expect(paste).rejects.toMatchObject({
        code: 'TOKEN_BLOCKER_LIMIT',
        message:
          'the scene would have 51 sight-blocking tokens (49 stored + 2 added); the limit is 50',
      });
      expectNothingWritten(rowsBefore);
    });

    it('a paste whose copies that block still fit passes, and the copies keep the value', async () => {
      fill(VHARN_SCENE_ID, CEILING - 1);
      const plain = { ...COPY, blocksSight: false };

      await batch.createMany(ANA_ID, VHARN_ID, { tokens: [COPY, plain] });

      const [blocker, other] = table.tokens.rows.slice(-2);
      expect([blocker?.token.blocksSight, other?.token.blocksSight]).toEqual([true, false]);
    });

    it('turning one off with 50 on the scene passes', async () => {
      fill(VHARN_SCENE_ID, CEILING);
      const tokenId = `blocker-${VHARN_SCENE_ID}-0`;

      await service.update(ANA_ID, VHARN_ID, editOf(tokenId, { blocksSight: false }));

      expect(rowOf(tokenId)?.token.blocksSight).toBe(false);
    });

    it('sending true on a token that already blocks, with 50 on the scene, does not count it twice', async () => {
      fill(VHARN_SCENE_ID, CEILING);
      const tokenId = `blocker-${VHARN_SCENE_ID}-0`;

      await service.update(
        ANA_ID,
        VHARN_ID,
        editOf(tokenId, { name: 'Coluna', blocksSight: true }),
      );

      expect(rowOf(tokenId)?.token).toMatchObject({ name: 'Coluna', blocksSight: true });
    });

    it('a token that does not block, on a scene with 50, is created and edited normally', async () => {
      fill(VHARN_SCENE_ID, CEILING);

      await service.create(ANA_ID, VHARN_ID, STATUE);
      await service.update(ANA_ID, VHARN_ID, editOf(LYRA_ID, { name: 'Lyra II' }));

      expect(created()?.name).toBe('Estátua');
      expect(rowOf(LYRA_ID)?.token.name).toBe('Lyra II');
    });

    it('another grid of the same table counts apart', async () => {
      fill(VHARN_TORRE_ID, CEILING);

      await service.create(ANA_ID, VHARN_ID, { ...STATUE, blocksSight: true });

      expect(created()).toMatchObject({ sceneId: VHARN_SCENE_ID, blocksSight: true });
    });

    it('the table of Quelm counts apart', async () => {
      fill(QUELM_SCENE_ID, CEILING);

      await service.create(ANA_ID, VHARN_ID, { ...STATUE, blocksSight: true });

      expect(created()).toMatchObject({ sceneId: VHARN_SCENE_ID, blocksSight: true });
    });

    it('a hidden blocker counts: showing it again must not pass the ceiling', async () => {
      fill(VHARN_SCENE_ID, CEILING - 1);
      const hidden = { id: 'hidden-statue', hidden: true, blocksSight: true };
      table.tokens.rows.push(lyraRow({ token: lyraPo(hidden), bars: [] }));

      const create = service.create(ANA_ID, VHARN_ID, { ...STATUE, blocksSight: true });

      await expect(create).rejects.toMatchObject(LIMIT_REFUSAL);
    });

    it('a command that turns none on does not read the count', async () => {
      await service.create(ANA_ID, VHARN_ID, STATUE);
      await service.update(ANA_ID, VHARN_ID, editOf(LYRA_ID, { blocksSight: false }));
      await batch.createMany(ANA_ID, VHARN_ID, { tokens: [{ ...COPY, blocksSight: false }] });

      expect(table.tokens.blockerCounts).toEqual([]);
    });
  });

  describe('isolation', () => {
    it('Quelm altering a token of Vharn is TOKEN_NOT_FOUND', async () => {
      const edit = editOf(LYRA_ID, { blocksSight: true });

      await expect(service.update(CAIO_ID, QUELM_ID, edit)).rejects.toMatchObject({
        code: 'TOKEN_NOT_FOUND',
      });
      expect(rowOf(LYRA_ID)?.token.blocksSight).toBe(false);
    });
  });
});
