import { describe, expect, it } from 'vitest';
import { SheetBarCreationService } from '../../../src/modules/sheets/sheet-bar-creation.service';
import { SheetHolderService } from '../../../src/modules/sheets/sheet-holder.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';
import { characterBarPo, LYRA_CHARACTER_ID } from '../../support/characters-factories';
import { sheetTemplatePo } from '../../support/sheet-templates-fakes';
import { LYRA_SHEET_ID, QUELM_SHEET_ID, SheetsHarness } from '../../support/sheets-fakes';
import { BRAM_ID } from '../../support/tokens-factories';

const BRAM_SHEET_ID = '0e1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b';
const SPARE_SHEET_ID = '1f2a3b4c-5d6e-4f7a-9b8c-0d1e2f3a4b5c';
const folego = { label: 'Fôlego', max: 6, color: 'gold' as const };

// Ficha Tormenta declares these permissions; Lyra holds its sheet, Bram another, one is nobody's.
function harnessWith(permissions: string[] = ['character:bars']): SheetsHarness {
  const harness = new SheetsHarness().withLyraSheet();
  harness.withLyraSheet({ id: BRAM_SHEET_ID, tokenId: BRAM_ID, characterId: null });
  harness.withLyraSheet({ id: SPARE_SHEET_ID, characterId: null });
  const template = harness.templates.rows.find(({ id }) => id === sheetTemplatePo().id);
  if (template) Object.assign(template, { manifest: { permissions, bars: [] } });
  return harness;
}

function create(harness: SheetsHarness, userId: string, sheetId = LYRA_SHEET_ID, bar = folego) {
  const service = new SheetBarCreationService({
    read: harness.daos,
    transaction: harness.deps.transaction,
    clock: harness.clock,
    characterPublisher: harness.characterPublisher,
    board: harness.board,
    holders: new SheetHolderService(),
  });
  return service.create(harness.as(userId), sheetId, { bar });
}

function lyraBars(harness: SheetsHarness) {
  const row = harness.characters.rows.find(({ character }) => character.id === LYRA_CHARACTER_ID);
  return row?.bars ?? [];
}

// Lyra with 8 bars: PV, Mana and 6 more.
function lyraFull(harness: SheetsHarness): void {
  const lyra = harness.characters.rows.find(({ character }) => character.id === LYRA_CHARACTER_ID);
  const extra = ['A', 'B', 'C', 'D', 'E', 'F'].map((label, index) =>
    characterBarPo({ id: crypto.randomUUID(), position: index + 2, label }),
  );
  if (lyra) Object.assign(lyra, { bars: [...lyra.bars, ...extra] });
}

describe('SheetBarCreationService: a character', () => {
  it('Bia creates Fôlego on Lyra full, after her bars, in one version and one character:changed', async () => {
    const harness = harnessWith();

    const made = await create(harness, BIA_ID);

    const bars = lyraBars(harness).map(({ id, label, current, max }) => ({
      id,
      label,
      current,
      max,
    }));
    expect(bars.map(({ label }) => label)).toEqual(['PV', 'Mana', 'Fôlego']);
    expect(made).toEqual({ barId: bars[2]?.id, created: true });
    expect(bars[2]).toMatchObject({ current: 6, max: 6 });
    expect(harness.characters.versions[VHARN_ID]).toBe(5);
    const [change, ...more] = harness.characterPublisher.changes;
    expect(more).toEqual([]);
    expect(change?.characters[0]?.privileged.bars.map(({ label }) => label)).toContain('Fôlego');
  });

  it('asking again answers the same id with created false, writing and telling nothing', async () => {
    const harness = harnessWith();
    const first = await create(harness, BIA_ID);
    harness.journal.length = 0;

    const again = await create(harness, BIA_ID, LYRA_SHEET_ID, { ...folego, label: ' FOLEGO ' });

    expect(again).toEqual({ barId: first.barId, created: false });
    expect(harness.journal).not.toContain('bars');
    expect(harness.characters.versions[VHARN_ID]).toBe(5);
    expect(harness.characterPublisher.changes).toHaveLength(1);
  });

  it('a template without character:bars is PERMISSION_NOT_DECLARED and writes nothing', async () => {
    const harness = harnessWith(['character:stats']);

    await expect(create(harness, BIA_ID)).rejects.toMatchObject({
      code: 'PERMISSION_NOT_DECLARED',
    });

    expect(lyraBars(harness).map(({ label }) => label)).toEqual(['PV', 'Mana']);
    expect(harness.characterPublisher.changes).toEqual([]);
  });

  it('Caio, who only reads a table sheet of Lyra, is FORBIDDEN', async () => {
    const harness = harnessWith();
    const lyra = harness.sheets.rows.find(({ id }) => id === LYRA_SHEET_ID);
    if (lyra) Object.assign(lyra, { visibility: 'table' });

    await expect(create(harness, CAIO_ID)).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(lyraBars(harness)).toHaveLength(2);
  });

  it('Lyra with 8 bars is BAR_LIMIT citing the label, and nothing changes', async () => {
    const harness = harnessWith();
    lyraFull(harness);

    await expect(create(harness, BIA_ID)).rejects.toMatchObject({
      code: 'BAR_LIMIT',
      message: 'Bar "Fôlego" does not fit: the holder has 8 bars; expected fewer than 8',
    });

    expect(lyraBars(harness)).toHaveLength(8);
    expect(harness.characterPublisher.changes).toEqual([]);
  });

  it('a failed commit rolls the bar back and publishes nothing', async () => {
    const harness = harnessWith();
    harness.failCommit = true;

    await expect(create(harness, BIA_ID)).rejects.toThrow('commit');

    expect(lyraBars(harness)).toHaveLength(2);
    expect(harness.characterPublisher.changes).toEqual([]);
  });
});

describe('SheetBarCreationService: other holders', () => {
  it('Caio creates the bar on his loose Bram: the grid moves to 8 and token:updated tells it', async () => {
    const harness = harnessWith();
    // The Salão is public: Caio acts there.
    harness.scenes.setVisibility(harness.scenes.rows[0]?.id ?? '', 'public');

    const made = await create(harness, CAIO_ID, BRAM_SHEET_ID);

    const bars = harness.tokens.barsOf(BRAM_ID);
    expect(made).toEqual({ barId: bars[0]?.id, created: true });
    expect(harness.scenes.rows[0]?.version).toBe(8);
    const [change] = harness.board.tokenChanges;
    expect(change).toMatchObject({ name: 'token:updated', controllerIds: [CAIO_ID] });
    expect(harness.characterPublisher.changes).toEqual([]);
  });

  it('a sheet nobody holds is SHEET_HAS_NO_TOKEN, even for the master', async () =>
    expect(create(harnessWith(), ANA_ID, SPARE_SHEET_ID)).rejects.toMatchObject({
      code: 'SHEET_HAS_NO_TOKEN',
    }));

  it('the sheet of Quelm asked at Vharn is SHEET_NOT_FOUND and no bar moves', async () => {
    const harness = harnessWith();

    await expect(create(harness, ANA_ID, QUELM_SHEET_ID)).rejects.toMatchObject({
      code: 'SHEET_NOT_FOUND',
    });

    expect(harness.journal).not.toContain('bars');
    expect(harness.journal).not.toContain('token bars');
  });
});
