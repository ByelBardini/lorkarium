import { beforeEach, describe, expect, it } from 'vitest';
import { TokenBatchService } from '../../../src/modules/tokens/token-batch.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID, campaignMemberPo } from '../../support/campaigns-factories';
import {
  CharacterTableFake,
  LYRA_ANCHOR_ID,
  QUELM_SCENE_ID,
  VHARN_TORRE_ID,
  linkedLyraRow,
  lyraAnchorRow,
} from '../../support/character-fakes';
import { memberCardPo } from '../../support/member-cards-factories';
import { VHARN_CAST_ID, scenePo } from '../../support/scenes-factories';
import { lyraPo } from '../../support/tokens-factories';
import { TableTokenRightsFake } from '../../support/tokens-fakes';

const DAVI_ID = '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a';
const BRAM_ANCHOR_ID = '3e4f5a6b-7c8d-4e9f-a0b1-2c3d4e5f6a7b';
const CELA_ID = '4f5a6b7c-8d9e-4f0a-b1c2-3d4e5f6a7b8c';
const TORRE = { sceneId: VHARN_TORRE_ID };
const LOCK_TORRE = `lockInCampaign:${VHARN_TORRE_ID}`;

describe('TokenBatchService.addPlayers ("Adicionar jogadores")', () => {
  let table: CharacterTableFake;
  let service: TokenBatchService;

  beforeEach(() => {
    table = new CharacterTableFake();
    table.members.rows.push(
      campaignMemberPo({ campaignId: VHARN_ID, userId: DAVI_ID, role: 'player' }),
    );
    table.withLyraAnchor();
    const bram = lyraAnchorRow();
    const bramToken = { ...bram.token, id: BRAM_ANCHOR_ID, name: 'Bram', width: 2, height: 2 };
    table.tokens.rows.push({ token: bramToken, bars: [], controllerIds: [CAIO_ID] });
    table.memberCards.rows.push(memberCardPo({ userId: CAIO_ID, anchorTokenId: BRAM_ANCHOR_ID }));
    table.scenes.rows.push(scenePo({ id: CELA_ID, widthCells: 2, heightCells: 1 }));
    const { members, publisher, clock } = table;
    service = new TokenBatchService({
      members,
      transaction: table.transaction.run,
      publisher,
      clock,
      barLimit: 99_999,
      tokenLimit: 500,
      tokenRights: new TableTokenRightsFake(),
    });
  });

  it('Bia and Caio have anchors and Davi not: two linked tokens around the center, Davi skipped', async () => {
    const added = await service.addPlayers(ANA_ID, VHARN_ID, {
      ...TORRE,
      center: { col: 5, row: 5 },
    });

    expect(added).toMatchObject({ version: 8, skippedMemberIds: [DAVI_ID] });
    expect(added.createdIds).toHaveLength(2);
    const made = added.createdIds.map((id) => table.tokens.rowOf(id).token);
    expect(made).toEqual([
      expect.objectContaining({ anchorTokenId: LYRA_ANCHOR_ID, col: 5, row: 5, width: 1 }),
      expect.objectContaining({ anchorTokenId: BRAM_ANCHOR_ID, width: 2, height: 2 }),
    ]);
    for (const token of made) {
      expect(token).toMatchObject({
        layer: 'tokens',
        facing: 0,
        sightBright: null,
        lightBright: null,
      });
    }
    expect(table.journal).toEqual(['lock cast', LOCK_TORRE, 'save', 'bump', 'commit', 'publish']);
  });

  it('one token:createdMany carries each one composed: Lyra whole to Bia with the anchor PV', async () => {
    await service.addPlayers(ANA_ID, VHARN_ID, { ...TORRE, center: { col: 5, row: 5 } });

    const [creation] = table.publisher.tokensCreations;
    expect(creation).toMatchObject({ sceneId: VHARN_TORRE_ID, version: 8 });
    expect(creation?.tokens[0]).toMatchObject({
      controllerIds: [BIA_ID],
      privileged: { name: 'Lyra', anchorTokenId: LYRA_ANCHOR_ID },
    });
    expect(creation?.tokens[0]?.privileged.bars.map(({ label }) => label)).toEqual([
      'PV',
      'Inspiração',
    ]);
    expect(creation?.tokens[0]?.others.bars.map(({ label }) => label)).toEqual(['Inspiração']);
  });

  it('a character already on the grid is passed over', async () => {
    table.tokens.rows.push(linkedLyraRow());

    const added = await service.addPlayers(ANA_ID, VHARN_ID, {
      ...TORRE,
      center: { col: 5, row: 5 },
    });

    const anchors = added.createdIds.map((id) => table.tokens.rowOf(id).token.anchorTokenId);
    expect(anchors).toEqual([BRAM_ANCHOR_ID]);
  });

  it('nobody to place answers zero created and bumps nothing', async () => {
    table.memberCards.rows.splice(0);

    const added = await service.addPlayers(ANA_ID, VHARN_ID, {
      ...TORRE,
      center: { col: 5, row: 5 },
    });

    expect(added).toEqual({
      version: 7,
      createdIds: [],
      skippedMemberIds: [BIA_ID, CAIO_ID, DAVI_ID],
    });
    expect(table.journal).toEqual(['lock cast', LOCK_TORRE, 'commit']);
    expect(table.publisher.tokensCreations).toEqual([]);
  });

  it('a grid without room is NO_FREE_CELLS citing the grid and how many were left out', async () => {
    const goblin = lyraPo({ id: 'goblin', sceneId: CELA_ID, col: 1, row: 0, anchorTokenId: null });
    table.tokens.rows.push({ token: goblin, bars: [], controllerIds: [] });

    const adding = service.addPlayers(ANA_ID, VHARN_ID, {
      sceneId: CELA_ID,
      center: { col: 0, row: 0 },
    });

    await expect(adding).rejects.toMatchObject({
      code: 'NO_FREE_CELLS',
      message: expect.stringContaining(`scene ${CELA_ID} has no free cells for 1 of the 2`),
    });
    expect(table.journal).toEqual(['lock cast', `lockInCampaign:${CELA_ID}`]);
  });

  it('Bia is FORBIDDEN before any lock; a grid of Quelm is SCENE_NOT_FOUND', async () => {
    const byBia = service.addPlayers(BIA_ID, VHARN_ID, { ...TORRE, center: { col: 5, row: 5 } });
    await expect(byBia).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(table.journal).toEqual([]);

    const quelm = service.addPlayers(ANA_ID, VHARN_ID, {
      sceneId: QUELM_SCENE_ID,
      center: { col: 1, row: 1 },
    });
    await expect(quelm).rejects.toMatchObject({ code: 'SCENE_NOT_FOUND' });
  });

  it('the cast itself is no grid to add to: SCENE_NOT_FOUND', async () => {
    const adding = service.addPlayers(ANA_ID, VHARN_ID, {
      sceneId: VHARN_CAST_ID,
      center: { col: 1, row: 1 },
    });

    await expect(adding).rejects.toMatchObject({ code: 'SCENE_NOT_FOUND' });
  });
});
