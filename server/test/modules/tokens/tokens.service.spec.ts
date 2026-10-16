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
import { LYRA_ID, LYRA_PV_ID, lyraRow } from '../../support/tokens-factories';

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
    tokens = new TokensDaoFake(scenes.journal, [lyraRow()]);
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
    expect(tokens.rows).toHaveLength(1);
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

  it('Bia dragging Lyra over (8, 6) publishes token:dragged to all but her connection, saving nothing', async () => {
    const version = await service.drag(
      BIA_ID,
      VHARN_ID,
      { tokenId: LYRA_ID, cell: { col: 8, row: 6 } },
      'bia-socket',
    );
    expect(version).toBe(4);
    expect(scenes.journal).toEqual(['commit', 'publish']);
    expect(tokens.rows[0]?.token).toMatchObject({ col: 3, row: 4 });
    expect(publisher.tokenDrags).toEqual([
      {
        event: {
          campaignId: VHARN_ID,
          at: NOW.toISOString(),
          tokenId: LYRA_ID,
          cell: { col: 8, row: 6 },
        },
        exceptConnectionId: 'bia-socket',
      },
    ]);
  });

  it('a drag that ended without a move publishes cell null', async () => {
    await service.drag(BIA_ID, VHARN_ID, { tokenId: LYRA_ID, cell: null }, 'bia-socket');
    expect(publisher.tokenDrags[0]?.event.cell).toBeNull();
  });

  it('Caio dragging Bia’s Lyra is refused with FORBIDDEN and nothing is published', async () => {
    const drag = { tokenId: LYRA_ID, cell: { col: 8, row: 6 } };
    await expect(service.drag(CAIO_ID, VHARN_ID, drag, 'caio-socket')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(publisher.published).toBe(0);
  });

  it('a drag past the edge of the scene is refused with OUT_OF_SCENE', async () => {
    const drag = { tokenId: LYRA_ID, cell: { col: 20, row: 0 } };
    await expect(service.drag(BIA_ID, VHARN_ID, drag, 'bia-socket')).rejects.toMatchObject({
      code: 'OUT_OF_SCENE',
    });
    expect(publisher.published).toBe(0);
  });

  it('dragging a token of another table is TOKEN_NOT_FOUND', async () => {
    const drag = { tokenId: LYRA_ID, cell: null };
    await expect(service.drag(CAIO_ID, QUELM_ID, drag, 'caio-socket')).rejects.toMatchObject({
      code: 'TOKEN_NOT_FOUND',
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
    expect(tokens.rows).toEqual([]);
    expect(publisher.tokenDeletes).toEqual([
      { campaignId: VHARN_ID, version: 5, at: NOW.toISOString(), tokenId: LYRA_ID, combat: null },
    ]);
  });

  it('a player deleting a token is refused with FORBIDDEN', async () => {
    await expect(service.delete(BIA_ID, VHARN_ID, { tokenId: LYRA_ID })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
