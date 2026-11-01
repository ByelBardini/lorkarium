import { beforeEach, describe, expect, it } from 'vitest';
import { TokenBatchService } from '../../../src/modules/tokens/token-batch.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID, campaignMemberPo } from '../../support/campaigns-factories';
import {
  CharacterTableFake,
  QUELM_SCENE_ID,
  VHARN_TORRE_ID,
  linkedLyraRow,
} from '../../support/character-fakes';
import { LYRA_CHARACTER_ID, characterPo } from '../../support/characters-factories';
import { scenePo } from '../../support/scenes-factories';
import { lyraPo } from '../../support/tokens-factories';
import { TableTokenRightsFake } from '../../support/tokens-fakes';

const DAVI_ID = '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a';
const BRAM_CHARACTER_ID = '3e4f5a6b-7c8d-4e9f-a0b1-2c3d4e5f6a7b';
const CELA_ID = '4f5a6b7c-8d9e-4f0a-b1c2-3d4e5f6a7b8c';
const TORRE = { sceneId: VHARN_TORRE_ID };
const LOCK_TORRE = `lockInCampaign:${VHARN_TORRE_ID}`;
const CENTER = { col: 5, row: 5 };

describe('TokenBatchService.addPlayers ("Adicionar jogadores")', () => {
  let table: CharacterTableFake;
  let service: TokenBatchService;

  beforeEach(() => {
    table = new CharacterTableFake();
    const bram = characterPo({
      ...{ id: BRAM_CHARACTER_ID, userId: CAIO_ID, name: 'Bram', initials: 'BR' },
      ...{ width: 2, height: 2 },
    });
    table.characters.rows.push({
      character: bram,
      bars: [],
      controllerIds: [CAIO_ID],
      holderRole: 'player',
      conditions: [],
    });
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

  it("every player has a character: Lyra and Bram around the center with each character's size, nobody skipped", async () => {
    const added = await service.addPlayers(ANA_ID, VHARN_ID, { ...TORRE, center: CENTER });

    expect(added).toMatchObject({ version: 8, skippedMemberIds: [] });
    const made = added.createdIds.map((id) => table.tokens.rowOf(id).token);
    expect(made).toEqual([
      expect.objectContaining({
        ...{ characterId: LYRA_CHARACTER_ID, name: 'Lyra' },
        ...{ col: 5, row: 5, width: 1, height: 1 },
      }),
      expect.objectContaining({
        characterId: BRAM_CHARACTER_ID,
        name: 'Bram',
        width: 2,
        height: 2,
      }),
    ]);
    for (const token of made) {
      expect(token).toMatchObject({
        layer: 'tokens',
        facing: 0,
        sightBright: null,
        lightBright: null,
      });
    }
  });

  it('locks the characters before the grid, reads them and bumps the grid alone', async () => {
    await service.addPlayers(ANA_ID, VHARN_ID, { ...TORRE, center: CENTER });

    expect(table.journal).toEqual([
      'lock characters',
      LOCK_TORRE,
      'save',
      'bump',
      'commit',
      'publish',
    ]);
    expect(table.characterPublisher.changes).toEqual([]);
  });

  it('one token:createdMany carries each one composed: Lyra whole to Bia with her PV, redacted to the rest', async () => {
    await service.addPlayers(ANA_ID, VHARN_ID, { ...TORRE, center: CENTER });

    const [creation] = table.publisher.tokensCreations;
    expect(creation).toMatchObject({ sceneId: VHARN_TORRE_ID, version: 8 });
    expect(creation?.tokens[0]).toMatchObject({
      controllerIds: [BIA_ID],
      privileged: { name: 'Lyra', characterId: LYRA_CHARACTER_ID },
    });
    expect(creation?.tokens[0]?.privileged.bars.map(({ current }) => current)).toEqual([32, 1]);
    expect(creation?.tokens[0]?.others.bars.map(({ label }) => label)).toEqual(['Inspiração']);
  });

  it('a player without a character is the only one skipped', async () => {
    table.members.rows.push(
      campaignMemberPo({ campaignId: VHARN_ID, userId: DAVI_ID, role: 'player' }),
    );

    const added = await service.addPlayers(ANA_ID, VHARN_ID, { ...TORRE, center: CENTER });

    expect(added.skippedMemberIds).toEqual([DAVI_ID]);
    expect(added.createdIds).toHaveLength(2);
  });

  it('a character already on the grid is passed over, without being skipped', async () => {
    table.tokens.rows.push(linkedLyraRow());

    const added = await service.addPlayers(ANA_ID, VHARN_ID, { ...TORRE, center: CENTER });

    const worn = added.createdIds.map((id) => table.tokens.rowOf(id).token.characterId);
    expect(worn).toEqual([BRAM_CHARACTER_ID]);
    expect(added.skippedMemberIds).toEqual([]);
  });

  it('everybody already there answers zero created and bumps nothing', async () => {
    table.tokens.rows.push(linkedLyraRow());
    const bram = linkedLyraRow({
      id: 'bram-token',
      characterId: BRAM_CHARACTER_ID,
      col: 0,
      row: 0,
    });
    table.tokens.rows.push(bram);

    const added = await service.addPlayers(ANA_ID, VHARN_ID, { ...TORRE, center: CENTER });

    expect(added).toEqual({ version: 7, createdIds: [], skippedMemberIds: [] });
    expect(table.journal).toEqual(['lock characters', LOCK_TORRE, 'commit']);
    expect(table.publisher.tokensCreations).toEqual([]);
  });

  it('a grid without room is NO_FREE_CELLS citing the grid and how many were left out', async () => {
    const goblin = lyraPo({ id: 'goblin', sceneId: CELA_ID, col: 1, row: 0 });
    table.tokens.rows.push({ token: goblin, bars: [], controllerIds: [], forms: [] });

    const adding = service.addPlayers(ANA_ID, VHARN_ID, {
      sceneId: CELA_ID,
      center: { col: 0, row: 0 },
    });

    await expect(adding).rejects.toMatchObject({
      code: 'NO_FREE_CELLS',
      message: expect.stringContaining(`scene ${CELA_ID} has no free cells for 1 of the 2`),
    });
    expect(table.journal).toEqual(['lock characters', `lockInCampaign:${CELA_ID}`]);
  });

  it('Bia is FORBIDDEN before any lock; a grid of Quelm is SCENE_NOT_FOUND', async () => {
    const byBia = service.addPlayers(BIA_ID, VHARN_ID, { ...TORRE, center: CENTER });
    await expect(byBia).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(table.journal).toEqual([]);

    const quelm = service.addPlayers(ANA_ID, VHARN_ID, {
      sceneId: QUELM_SCENE_ID,
      center: { col: 1, row: 1 },
    });
    await expect(quelm).rejects.toMatchObject({ code: 'SCENE_NOT_FOUND' });
  });
});
