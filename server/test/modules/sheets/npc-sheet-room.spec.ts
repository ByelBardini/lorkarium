import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SheetsService } from '../../../src/modules/sheets/sheets.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, QUELM_ID } from '../../support/campaigns-factories';
import { TORMENTA_ID } from '../../support/sheet-templates-fakes';
import { LYRA_SHEET_ID, QUELM_TOKEN_ID, SheetsHarness, sheetPo } from '../../support/sheets-fakes';
import { BRAM_ID, LOBO_ID, LYRA_ID } from '../../support/tokens-factories';

const FREE = { role: 'user', plan: 'free', lorkariumOwner: false } as const;

/** Vharn on free (10 NPC sheets) with `count` sheets held by the loose Bram. */
function freeTableWithNpcSheets(count: number): SheetsHarness {
  const harness = new SheetsHarness();
  harness.campaigns.owner = FREE;
  for (let index = 0; index < count; index += 1)
    harness.sheets.rows.push(sheetPo({ id: randomUUID(), characterId: null, tokenId: BRAM_ID }));
  return harness;
}

function create(harness: SheetsHarness, holder: object | undefined) {
  const input = { actionId: randomUUID(), templateId: TORMENTA_ID, name: 'Goblin', holder };
  return new SheetsService(harness.deps).create(harness.as(ANA_ID), input as never);
}

function give(harness: SheetsHarness, holder: object | null) {
  const input = { actionId: randomUUID(), holder };
  return new SheetsService(harness.deps).update(harness.as(ANA_ID), LYRA_SHEET_ID, input as never);
}

const NPC_LIMIT = { code: 'PLAN_LIMIT', resource: 'npcSheets', limit: 10, plan: 'free' };

describe("NPC sheets against the owner's plan", () => {
  it('a free table with 10 token sheets refuses the 11th for Bram, writing nothing', async () => {
    const harness = freeTableWithNpcSheets(10);

    await expect(create(harness, { tokenId: BRAM_ID })).rejects.toMatchObject(NPC_LIMIT);
    expect(harness.sheets.rows.filter(({ campaignId }) => campaignId !== QUELM_ID)).toHaveLength(
      10,
    );
    expect(harness.journal).not.toContain('commit');
  });

  it('with 9 the 10th sheet of Bram is created', async () => {
    const harness = freeTableWithNpcSheets(9);

    const { sheet } = await create(harness, { tokenId: BRAM_ID });

    expect(sheet.tokenId).toBe(BRAM_ID);
  });

  it("Quelm's token sheet does not count at Vharn", async () => {
    const harness = freeTableWithNpcSheets(9);
    expect(harness.sheets.rows.some(({ tokenId }) => tokenId === QUELM_TOKEN_ID)).toBe(true);

    await expect(create(harness, { tokenId: BRAM_ID })).resolves.toBeDefined();
  });

  it("past the ceiling a player's character sheet and a sheet nobody holds are still created", async () => {
    const harness = freeTableWithNpcSheets(10);

    const linked = await create(harness, { tokenId: LYRA_ID });
    const player = await create(harness, { memberId: BIA_ID });
    const loose = await create(harness, undefined);

    expect([linked.sheet.memberId, player.sheet.memberId]).toEqual([BIA_ID, BIA_ID]);
    expect(loose.sheet).toMatchObject({ tokenId: null, memberId: null });
  });

  it("giving Lyra's character sheet to Bram as the 11th is PLAN_LIMIT, and the sheet stays hers", async () => {
    const harness = freeTableWithNpcSheets(10).withLyraSheet();

    await expect(give(harness, { tokenId: BRAM_ID })).rejects.toMatchObject(NPC_LIMIT);
    expect(harness.sheets.rows.find(({ id }) => id === LYRA_SHEET_ID)?.tokenId).toBeNull();
  });

  it('moving a token sheet from Bram to the Lobo adds no NPC sheet, even past the ceiling', async () => {
    const harness = freeTableWithNpcSheets(10).withLyraSheet({
      characterId: null,
      tokenId: BRAM_ID,
    });

    await give(harness, { tokenId: LOBO_ID });

    expect(harness.sheets.rows.find(({ id }) => id === LYRA_SHEET_ID)?.tokenId).toBe(LOBO_ID);
  });

  it('taking a sheet from its token past the ceiling is saved', async () => {
    const harness = freeTableWithNpcSheets(10).withLyraSheet({
      characterId: null,
      tokenId: BRAM_ID,
    });

    await give(harness, null);

    expect(harness.sheets.rows.find(({ id }) => id === LYRA_SHEET_ID)?.tokenId).toBeNull();
  });

  it('an amigo_do_dono table gives the 11th sheet to Bram', async () => {
    const harness = freeTableWithNpcSheets(10).withLyraSheet();
    harness.campaigns.owner = { ...FREE, plan: 'amigo_do_dono' };

    await give(harness, { tokenId: BRAM_ID });

    expect(harness.sheets.rows.find(({ id }) => id === LYRA_SHEET_ID)?.tokenId).toBe(BRAM_ID);
  });
});
