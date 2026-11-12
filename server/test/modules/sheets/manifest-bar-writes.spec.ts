import type { CreateSheetRequestDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { SheetsService } from '../../../src/modules/sheets/sheets.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';
import { characterBarPo, LYRA_CHARACTER_ID } from '../../support/characters-factories';
import { manifestBars } from '../../support/manifest-bars-fakes';
import { TORMENTA_ID } from '../../support/sheet-templates-fakes';
import {
  KAEL_CHARACTER_ID,
  LYRA_SHEET_ID,
  QUELM_SHEET_ID,
  SHEET_ACTION_ID,
  SheetsHarness,
} from '../../support/sheets-fakes';
import { BRAM_ID } from '../../support/tokens-factories';
import { planAccount } from '../../support/plan-account-fakes';

type CreateExtra = Partial<Omit<CreateSheetRequestDto, 'templateId'>>;

function create(harness: SheetsHarness, extra: CreateExtra = {}) {
  const input = { actionId: SHEET_ACTION_ID, templateId: TORMENTA_ID, name: 'Lyra', ...extra };
  return new SheetsService(harness.deps).create(harness.as(ANA_ID), input);
}

function give(harness: SheetsHarness, holder: object | null, sheetId: string = LYRA_SHEET_ID) {
  const input = { actionId: crypto.randomUUID(), holder } as never;
  return new SheetsService(harness.deps).update(harness.as(ANA_ID), sheetId, input);
}

function barsOf(harness: SheetsHarness, characterId: string) {
  const row = harness.characters.rows.find(({ character }) => character.id === characterId);
  return row?.bars.map(({ label, current, max }) => ({ label, current, max })) ?? [];
}

function labelsOf(harness: SheetsHarness, characterId: string): string[] {
  return barsOf(harness, characterId).map(({ label }) => label);
}

// Lyra with 8 bars: PV, Mana and 6 more.
function lyraFull(harness: SheetsHarness): void {
  const lyra = harness.characters.rows.find(({ character }) => character.id === LYRA_CHARACTER_ID);
  const extra = ['A', 'B', 'C', 'D', 'E', 'F'].map((label, index) =>
    characterBarPo({ id: crypto.randomUUID(), position: index + 2, label }),
  );
  if (lyra) Object.assign(lyra, { bars: [...lyra.bars, ...extra] });
}

describe('giveManifestBars: a character', () => {
  it('giving the sheet to Bia adds MP, EF and ES to Lyra and keeps her PV at 25', async () => {
    const harness = new SheetsHarness().withManifestBars(manifestBars('PV', 'MP', 'EF', 'ES'));

    const { receipt } = await create(harness, { holder: { memberId: BIA_ID } });

    expect(barsOf(harness, LYRA_CHARACTER_ID)).toEqual([
      { label: 'PV', current: 25, max: 30 },
      { label: 'Mana', current: 4, max: 10 },
      { label: 'MP', current: 11, max: 11 },
      { label: 'EF', current: 12, max: 12 },
      { label: 'ES', current: 13, max: 13 },
    ]);
    expect(receipt.skippedBars).toEqual([]);
  });

  it('the main sheet and the bars cost one characters version and one character:changed', async () => {
    const harness = new SheetsHarness().withManifestBars(manifestBars('MP'));

    const { sheet } = await create(harness, { holder: { memberId: BIA_ID } });

    expect(harness.characters.versions[VHARN_ID]).toBe(5);
    const [change, ...more] = harness.characterPublisher.changes;
    expect(more).toEqual([]);
    expect(change).toMatchObject({ campaignId: VHARN_ID, version: 5 });
    const [lyra] = change?.characters ?? [];
    expect(lyra?.privileged.mainSheetId).toBe(sheet.id);
    expect(lyra?.privileged.bars.map(({ label }) => label)).toEqual(['PV', 'Mana', 'MP']);
  });

  it('a second sheet adds its bars in a version of their own, without touching the main one', async () => {
    const harness = new SheetsHarness()
      .withLyraSheet()
      .withMainSheet(LYRA_CHARACTER_ID, LYRA_SHEET_ID);
    harness.withManifestBars(manifestBars('EF'));

    await create(harness, { holder: { memberId: BIA_ID } });

    expect(harness.journal).not.toContain('main sheet');
    expect(harness.characters.versions[VHARN_ID]).toBe(5);
    expect(labelsOf(harness, LYRA_CHARACTER_ID)).toEqual(['PV', 'Mana', 'EF']);
    expect(harness.characterPublisher.changes).toHaveLength(1);
  });

  it(' pv  and MANA count as the PV and Mana Lyra has: only EF is added', async () => {
    const harness = new SheetsHarness().withManifestBars(manifestBars(' pv ', 'MANA', 'EF'));

    await create(harness, { holder: { memberId: BIA_ID } });

    expect(labelsOf(harness, LYRA_CHARACTER_ID)).toEqual(['PV', 'Mana', 'EF']);
  });

  it('giving the same sheet again adds nothing and spends no characters version', async () => {
    const harness = new SheetsHarness().withManifestBars(manifestBars('MP', 'EF'));
    await create(harness, { holder: { memberId: BIA_ID } });
    const version = harness.characters.versions[VHARN_ID];
    harness.journal.length = 0;

    await give(harness, { memberId: BIA_ID });

    expect(labelsOf(harness, LYRA_CHARACTER_ID)).toEqual(['PV', 'Mana', 'MP', 'EF']);
    expect(harness.journal).not.toContain('bars');
    expect(harness.characters.versions[VHARN_ID]).toBe(version);
  });

  it('Lyra with 8 bars gets none: the receipt lists MP and ES, and a replay answers the same', async () => {
    const harness = new SheetsHarness().withManifestBars(manifestBars('PV', 'MP', 'ES'));
    lyraFull(harness);

    const first = await create(harness, { holder: { memberId: BIA_ID } });
    const again = await create(harness, { holder: { memberId: BIA_ID } });

    expect(first.receipt.skippedBars).toEqual(['MP', 'ES']);
    expect(again.receipt).toEqual(first.receipt);
    expect(harness.journal).not.toContain('bars');
    expect(labelsOf(harness, LYRA_CHARACTER_ID)).toHaveLength(8);
  });

  it('Lyra with 6 bars and 3 missing gets 2; the third is skipped', async () => {
    const harness = new SheetsHarness().withManifestBars(manifestBars('MP', 'EF', 'ES'));
    lyraFull(harness);
    const lyra = harness.characters.rows.find(
      ({ character }) => character.id === LYRA_CHARACTER_ID,
    );
    if (lyra) Object.assign(lyra, { bars: lyra.bars.slice(0, 6) });

    const { receipt } = await create(harness, { holder: { memberId: BIA_ID } });

    expect(labelsOf(harness, LYRA_CHARACTER_ID).slice(6)).toEqual(['MP', 'EF']);
    expect(receipt.skippedBars).toEqual(['ES']);
  });

  it('on a free table, creating the sheet for Bia leaves Lyra at the 2 bars of the plan', async () => {
    const harness = new SheetsHarness().withManifestBars(manifestBars('MP', 'EF'));
    harness.campaigns.owner = planAccount({ plan: 'free' });

    const { receipt } = await create(harness, { holder: { memberId: BIA_ID } });

    expect(labelsOf(harness, LYRA_CHARACTER_ID)).toEqual(['PV', 'Mana']);
    expect(receipt.skippedBars).toEqual(['MP', 'EF']);
  });

  it('on a free table, giving the sheet to Bia skips every bar past the 2 of the plan', async () => {
    const harness = new SheetsHarness().withManifestBars(manifestBars('MP'));
    harness.campaigns.owner = planAccount({ plan: 'free' });
    await create(harness);

    const { receipt } = await give(harness, { memberId: BIA_ID });

    expect(labelsOf(harness, LYRA_CHARACTER_ID)).toEqual(['PV', 'Mana']);
    expect(receipt.skippedBars).toEqual(['MP']);
  });

  it('taking the sheet from Lyra removes none of her bars', async () => {
    const harness = new SheetsHarness().withManifestBars(manifestBars('MP'));
    await create(harness, { holder: { memberId: BIA_ID } });

    const { receipt } = await give(harness, null);

    expect(labelsOf(harness, LYRA_CHARACTER_ID)).toEqual(['PV', 'Mana', 'MP']);
    expect(receipt.skippedBars).toEqual([]);
  });

  it('a template without bars writes no bar and locks no grid', async () => {
    const harness = new SheetsHarness();

    await create(harness, { holder: { memberId: CAIO_ID } });

    expect(harness.journal).not.toContain('bars');
    expect(labelsOf(harness, KAEL_CHARACTER_ID)).toEqual([]);
  });

  it('a failed commit rolls the new bars back and publishes nothing', async () => {
    const harness = new SheetsHarness().withManifestBars(manifestBars('MP'));
    harness.failCommit = true;

    await expect(create(harness, { holder: { memberId: BIA_ID } })).rejects.toThrow('commit');

    expect(labelsOf(harness, LYRA_CHARACTER_ID)).toEqual(['PV', 'Mana']);
    expect(harness.characterPublisher.changes).toEqual([]);
  });

  it('the sheet of Quelm given at Vharn is SHEET_NOT_FOUND and no bar of Vharn moves', async () => {
    const harness = new SheetsHarness().withManifestBars(manifestBars('MP'));

    await expect(give(harness, { memberId: BIA_ID }, QUELM_SHEET_ID)).rejects.toMatchObject({
      code: 'SHEET_NOT_FOUND',
    });

    expect(labelsOf(harness, LYRA_CHARACTER_ID)).toEqual(['PV', 'Mana']);
    expect(harness.journal).not.toContain('bars');
  });
});

describe('giveManifestBars: a loose token', () => {
  it('giving the sheet to Bram adds the bars on his grid and tells token:updated after the sheet', async () => {
    const harness = new SheetsHarness().withManifestBars(manifestBars('PV', 'MP'));

    await create(harness, { holder: { tokenId: BRAM_ID } });

    expect(harness.tokens.barsOf(BRAM_ID).map(({ label, current }) => [label, current])).toEqual([
      ['PV', 10],
      ['MP', 11],
    ]);
    expect(harness.scenes.rows[0]?.version).toBe(8);
    const [change] = harness.board.tokenChanges;
    expect(change).toMatchObject({ name: 'token:updated', controllerIds: [CAIO_ID] });
    expect(change?.privileged).toMatchObject({ version: 8, token: { id: BRAM_ID } });
    expect(change?.privileged.token.bars.map(({ label }) => label)).toEqual(['PV', 'MP']);
    expect(harness.characterPublisher.changes).toEqual([]);
  });

  it('on a free table, Bram stops at the 2 bars of the plan and the rest is skipped', async () => {
    const harness = new SheetsHarness().withManifestBars(manifestBars('PV', 'MP', 'EF'));
    harness.scenes.owners.set(VHARN_ID, planAccount({ plan: 'free' }));

    const { receipt } = await create(harness, { holder: { tokenId: BRAM_ID } });

    expect(harness.tokens.barsOf(BRAM_ID).map(({ label }) => label)).toEqual(['PV', 'MP']);
    expect(receipt.skippedBars).toEqual(['EF']);
  });

  it('a template without bars leaves the grid of Bram unlocked', async () => {
    const harness = new SheetsHarness();

    await create(harness, { holder: { tokenId: BRAM_ID } });

    expect(harness.scenes.journal).toEqual([]);
    expect(harness.board.tokenChanges).toEqual([]);
  });

  it('Bram already holding every bar: the grid keeps its version and nobody hears of him', async () => {
    const harness = new SheetsHarness().withManifestBars(manifestBars('MP'));
    const { sheet } = await create(harness, { holder: { tokenId: BRAM_ID } });

    await give(harness, { tokenId: BRAM_ID }, sheet.id);

    expect(harness.scenes.rows[0]?.version).toBe(8);
    expect(harness.board.tokenChanges).toHaveLength(1);
  });
});
