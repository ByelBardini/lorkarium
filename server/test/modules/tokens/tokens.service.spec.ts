import { beforeEach, describe, expect, it } from 'vitest';
import type { BarInputDto } from '@lorkarium/contracts';
import { TokensService, type CreateToken } from '../../../src/modules/tokens/tokens.service';
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
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';
import { TokenTransactionRunnerFake, TokensDaoFake } from '../../support/tokens-fakes';
import { BRAM_ID, LYRA_ID, LYRA_PV_ID, bramRow, lyraRow } from '../../support/tokens-factories';

const NOW = new Date('2026-10-15T21:00:00Z');
const PV: BarInputDto = {
  label: 'PV',
  current: 30,
  max: 30,
  color: 'ember',
  visibility: 'controllers',
};
const NEW_TOKEN: CreateToken = {
  name: 'Kael',
  initials: 'KA',
  side: 'ally',
  size: 1,
  col: 2,
  row: 2,
  layer: 'tokens',
  controllerIds: [BIA_ID],
  bars: [PV],
};

describe('TokensService', () => {
  let scenes: ScenesDaoFake;
  let tokens: TokensDaoFake;
  let publisher: BoardPublisherFake;
  let service: TokensService;

  beforeEach(() => {
    const campaigns = new CampaignsDaoFake();
    const members = new CampaignMembersDaoFake(
      campaigns,
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
    tokens = new TokensDaoFake(scenes.journal, [lyraRow(), bramRow()]);
    publisher = new BoardPublisherFake(scenes.journal);
    const transaction = new TokenTransactionRunnerFake(scenes, tokens);
    service = new TokensService({
      members,
      transaction: transaction.run,
      publisher,
      clock: new ClockFake(NOW),
      barLimit: 99_999,
    });
  });

  it('the master creating Kael locks, saves and bumps, then publishes after the commit', async () => {
    const version = await service.create(ANA_ID, VHARN_ID, NEW_TOKEN);
    expect(version).toBe(5);
    expect(scenes.journal).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
  });

  it('token:created goes whole to the privileged and without the hidden PV to the others', async () => {
    await service.create(ANA_ID, VHARN_ID, NEW_TOKEN);
    const [change] = publisher.tokenChanges;
    expect(change).toMatchObject({
      name: 'token:created',
      campaignId: VHARN_ID,
      controllerIds: [BIA_ID],
    });
    expect(change?.privileged).toMatchObject({
      version: 5,
      at: NOW.toISOString(),
      token: { canControl: true },
    });
    expect(change?.privileged.token.bars).toHaveLength(1);
    expect(change?.others.token).toMatchObject({ canControl: false, bars: [] });
  });

  it('a player creating a token is refused with FORBIDDEN, and nothing is saved nor published', async () => {
    await expect(service.create(BIA_ID, VHARN_ID, NEW_TOKEN)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(scenes.journal).toEqual([]);
    expect(tokens.rows).toHaveLength(2);
  });

  it('a token placed outside the scene is refused with OUT_OF_SCENE and nothing is published', async () => {
    await expect(service.create(ANA_ID, VHARN_ID, { ...NEW_TOKEN, col: 20 })).rejects.toMatchObject(
      {
        code: 'OUT_OF_SCENE',
      },
    );
    expect(publisher.published).toBe(0);
  });

  it('a controller who is not at the table is refused with INVALID_CONTROLLER', async () => {
    const stranger = '00000000-0000-4000-8000-000000000000';
    await expect(
      service.create(ANA_ID, VHARN_ID, { ...NEW_TOKEN, controllerIds: [stranger] }),
    ).rejects.toMatchObject({ code: 'INVALID_CONTROLLER' });
  });

  it('Bia moves her Lyra: saved, bumped and token:moved published to everyone', async () => {
    const version = await service.move(BIA_ID, VHARN_ID, { tokenId: LYRA_ID, col: 8, row: 6 });
    expect(version).toBe(5);
    expect(tokens.rows[0]?.token).toMatchObject({ col: 8, row: 6 });
    expect(publisher.tokenMoves).toEqual([
      { campaignId: VHARN_ID, version: 5, at: NOW.toISOString(), tokenId: LYRA_ID, col: 8, row: 6 },
    ]);
  });

  it('Caio moving Bia’s Lyra is refused with FORBIDDEN and nothing changes', async () => {
    await expect(
      service.move(CAIO_ID, VHARN_ID, { tokenId: LYRA_ID, col: 8, row: 6 }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(tokens.rows[0]?.token).toMatchObject({ col: 3, row: 4 });
    expect(publisher.published).toBe(0);
  });

  it('a token id of another table is TOKEN_NOT_FOUND, even for its master', async () => {
    await expect(
      service.move(CAIO_ID, QUELM_ID, { tokenId: LYRA_ID, col: 1, row: 1 }),
    ).rejects.toMatchObject({
      code: 'TOKEN_NOT_FOUND',
    });
  });

  it('someone who is not a member gets CAMPAIGN_NOT_FOUND', async () => {
    await expect(
      service.move(ANA_ID, QUELM_ID, { tokenId: LYRA_ID, col: 1, row: 1 }),
    ).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_FOUND',
    });
  });

  it('Bia subtracting 7 from the PV of Lyra saves 25 and publishes token:updated', async () => {
    await service.adjustBar(BIA_ID, VHARN_ID, {
      tokenId: LYRA_ID,
      barId: LYRA_PV_ID,
      change: { op: 'add', amount: -7 },
    });
    expect(tokens.rows[0]?.bars[0]?.current).toBe(25);
    expect(publisher.tokenChanges[0]?.privileged.token.bars[0]?.current).toBe(25);
  });

  it('a bar that is not on the token is BAR_NOT_FOUND', async () => {
    await expect(
      service.adjustBar(BIA_ID, VHARN_ID, {
        tokenId: LYRA_ID,
        barId: 'nope',
        change: { op: 'set', value: 1 },
      }),
    ).rejects.toMatchObject({ code: 'BAR_NOT_FOUND' });
  });

  it('an update that takes Bia off the controllers publishes the token redacted to her from then on', async () => {
    await service.update(ANA_ID, VHARN_ID, {
      tokenId: LYRA_ID,
      name: 'Lyra',
      initials: 'LY',
      side: 'ally',
      size: 1,
      controllerIds: [],
      bars: [PV],
    });
    expect(publisher.tokenChanges[0]).toMatchObject({ name: 'token:updated', controllerIds: [] });
  });

  it('resizing a token past the edge is refused with OUT_OF_SCENE', async () => {
    tokens.rows[0] = lyraRow({ token: { ...lyraRow().token, col: 19 } });
    await expect(
      service.update(ANA_ID, VHARN_ID, {
        tokenId: LYRA_ID,
        name: 'Lyra',
        initials: 'LY',
        side: 'ally',
        size: 2,
        controllerIds: [],
        bars: [],
      }),
    ).rejects.toMatchObject({ code: 'OUT_OF_SCENE' });
  });

  it('the master deleting Lyra removes it and publishes token:deleted', async () => {
    await service.delete(ANA_ID, VHARN_ID, { tokenId: LYRA_ID });
    expect(tokens.rows.map(({ token }) => token.id)).toEqual([BRAM_ID]);
    expect(publisher.tokenDeletes).toEqual([
      { campaignId: VHARN_ID, version: 5, at: NOW.toISOString(), tokenId: LYRA_ID, combat: null },
    ]);
  });

  it('a player deleting a token is refused with FORBIDDEN', async () => {
    await expect(service.delete(BIA_ID, VHARN_ID, { tokenId: LYRA_ID })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  describe('setLayer', () => {
    it('the master moving Lyra and Bram to objects saves once, bumps once, then publishes', async () => {
      const version = await service.setLayer(ANA_ID, VHARN_ID, {
        tokenIds: [LYRA_ID, BRAM_ID],
        layer: 'objects',
      });
      expect(version).toBe(5);
      expect(scenes.journal).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
      expect(tokens.rows.map(({ token }) => token.layer)).toEqual(['objects', 'objects']);
      expect(publisher.tokenLayerChanges).toEqual([
        {
          campaignId: VHARN_ID,
          version: 5,
          at: NOW.toISOString(),
          tokenIds: [LYRA_ID, BRAM_ID],
          layer: 'objects',
        },
      ]);
    });

    it('a player changing a layer is refused with FORBIDDEN, and nothing is saved nor published', async () => {
      await expect(
        service.setLayer(BIA_ID, VHARN_ID, { tokenIds: [LYRA_ID], layer: 'background' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(scenes.journal).toEqual([]);
      expect(tokens.rows[0]?.token.layer).toBe('tokens');
    });

    it('one id outside the scene is TOKEN_NOT_FOUND naming it, and no token changes', async () => {
      const stranger = '00000000-0000-4000-8000-000000000009';
      const change = service.setLayer(ANA_ID, VHARN_ID, {
        tokenIds: [LYRA_ID, stranger],
        layer: 'objects',
      });
      await expect(change).rejects.toMatchObject({
        code: 'TOKEN_NOT_FOUND',
        message: expect.stringContaining(stranger),
      });
      expect(tokens.rows.map(({ token }) => token.layer)).toEqual(['tokens', 'tokens']);
      expect(publisher.published).toBe(0);
    });
  });
  describe('moveMany and dragMany', () => {
    const LYRA_TO_8_6 = { tokenId: LYRA_ID, col: 8, row: 6 };
    const BRAM_TO_9_6 = { tokenId: BRAM_ID, col: 9, row: 6 };

    it('the master moving Lyra and Bram saves once, bumps once and publishes one token:movedMany', async () => {
      const moves = [LYRA_TO_8_6, BRAM_TO_9_6];
      const version = await service.moveMany(ANA_ID, VHARN_ID, { moves });
      expect(version).toBe(5);
      expect(scenes.journal).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
      expect(tokens.rows.map(({ token }) => [token.col, token.row])).toEqual([
        [8, 6],
        [9, 6],
      ]);
      expect(publisher.tokensMoves).toEqual([
        { campaignId: VHARN_ID, version: 5, at: NOW.toISOString(), moves },
      ]);
    });

    it('a move whose precondition matches where Lyra is goes through (undo)', async () => {
      const moves = [{ ...LYRA_TO_8_6, expect: { col: 3, row: 4 } }];

      await service.moveMany(BIA_ID, VHARN_ID, { moves });

      expect(tokens.rows[0]?.token).toMatchObject({ col: 8, row: 6 });
      expect(publisher.tokensMoves[0]?.moves).toEqual([LYRA_TO_8_6]);
    });

    it('an undo after someone moved Bram since is STALE_UNDO, and none of the group moves', async () => {
      const moves = [LYRA_TO_8_6, { ...BRAM_TO_9_6, expect: { col: 1, row: 1 } }];

      await expect(service.moveMany(ANA_ID, VHARN_ID, { moves })).rejects.toMatchObject({
        code: 'STALE_UNDO',
        message: `token ${BRAM_ID} is at (6, 4); the undo expected (1, 1)`,
      });
      expect(tokens.rows.map(({ token }) => [token.col, token.row])).toEqual([
        [3, 4],
        [6, 4],
      ]);
      expect(scenes.journal).toEqual(['lock']);
    });

    it('one token of the group past the edge is OUT_OF_SCENE, and none of them moves', async () => {
      const moves = [LYRA_TO_8_6, { tokenId: BRAM_ID, col: 20, row: 6 }];
      await expect(service.moveMany(ANA_ID, VHARN_ID, { moves })).rejects.toMatchObject({
        code: 'OUT_OF_SCENE',
      });
      expect(tokens.rows.map(({ token }) => [token.col, token.row])).toEqual([
        [3, 4],
        [6, 4],
      ]);
      expect(publisher.published).toBe(0);
    });

    it('Bia moving her Lyra with the Bram of Caio is FORBIDDEN naming Bram, and none moves', async () => {
      const moves = [LYRA_TO_8_6, BRAM_TO_9_6];
      await expect(service.moveMany(BIA_ID, VHARN_ID, { moves })).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining(BRAM_ID),
      });
      expect(scenes.journal).toEqual(['lock']);
    });

    it('Bia moving her Lyra once it is on objects is FORBIDDEN', async () => {
      tokens.rows[0] = lyraRow({ token: { ...lyraRow().token, layer: 'objects' } });
      await expect(
        service.moveMany(BIA_ID, VHARN_ID, { moves: [LYRA_TO_8_6] }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('the master dragging the group publishes token:draggedMany to all but the connection, saving nothing', async () => {
      const drags = [
        { tokenId: LYRA_ID, cell: { col: 8, row: 6 } },
        { tokenId: BRAM_ID, cell: null },
      ];
      const version = await service.dragMany(ANA_ID, VHARN_ID, { drags }, 'ana-socket');
      expect(version).toBe(4);
      expect(scenes.journal).toEqual(['commit', 'publish']);
      expect(publisher.tokensDrags).toEqual([
        {
          event: { campaignId: VHARN_ID, at: NOW.toISOString(), drags },
          exceptConnectionId: 'ana-socket',
        },
      ]);
    });

    it('Caio dragging the Lyra of Bia with his Bram is FORBIDDEN and nothing is published', async () => {
      const drags = [
        { tokenId: BRAM_ID, cell: { col: 1, row: 1 } },
        { tokenId: LYRA_ID, cell: { col: 2, row: 1 } },
      ];
      const dragging = service.dragMany(CAIO_ID, VHARN_ID, { drags }, 'caio-socket');
      await expect(dragging).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(publisher.published).toBe(0);
    });

    it('dragging a token of another table is TOKEN_NOT_FOUND', async () => {
      const drags = [{ tokenId: LYRA_ID, cell: null }];
      const dragging = service.dragMany(CAIO_ID, QUELM_ID, { drags }, 'caio-socket');
      await expect(dragging).rejects.toMatchObject({ code: 'TOKEN_NOT_FOUND' });
    });

    it('a drag of the group past the edge is OUT_OF_SCENE', async () => {
      const drags = [{ tokenId: BRAM_ID, cell: { col: 20, row: 1 } }];
      const dragging = service.dragMany(ANA_ID, VHARN_ID, { drags }, 'ana-socket');
      await expect(dragging).rejects.toMatchObject({ code: 'OUT_OF_SCENE' });
    });
  });
});
