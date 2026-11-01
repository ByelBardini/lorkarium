import type { CreateSheetRequestDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { SheetsService } from '../../../src/modules/sheets/sheets.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, DUDA_ID, VHARN_ID } from '../../support/campaigns-factories';
import { ATO_1_ID, QUELM_FOLDER_ID } from '../../support/library-factories';
import { LYRA_CHARACTER_ID } from '../../support/characters-factories';
import { QUELM_TEMPLATE_ID, TORMENTA_ID } from '../../support/sheet-templates-fakes';
import {
  KAEL_CHARACTER_ID,
  LYRA_SHEET_ID,
  MIRA_CHARACTER_ID,
  QUELM_CHARACTER_ID,
  QUELM_SHEET_ID,
  QUELM_TOKEN_ID,
  SHEET_ACTION_ID,
  SheetsHarness,
} from '../../support/sheets-fakes';
import { BRAM_ID, LOBO_ID, LYRA_ID } from '../../support/tokens-factories';

const OTHER_ACTION_ID = 'ef3a2b1c-0d9e-4f8a-9b7c-6d5e4f3a2b1c';
type CreateExtra = Partial<Omit<CreateSheetRequestDto, 'templateId'>>;

function create(harness: SheetsHarness, extra: CreateExtra = {}, userId: string = ANA_ID) {
  const input = { actionId: SHEET_ACTION_ID, templateId: TORMENTA_ID, name: 'Lyra', ...extra };
  return new SheetsService(harness.deps).create(harness.as(userId), input);
}

function linkLyra(harness: SheetsHarness, tokenId: string = LYRA_ID) {
  return create(harness, { holder: { tokenId } });
}

function write(harness: SheetsHarness, userId: string, changes: Record<string, unknown>) {
  const input = { actionId: crypto.randomUUID(), changes } as never;
  return new SheetsService(harness.deps).updateValues(harness.as(userId), LYRA_SHEET_ID, input);
}

function manage(harness: SheetsHarness, changes: object, userId: string = ANA_ID) {
  const input = { actionId: crypto.randomUUID(), ...changes };
  return new SheetsService(harness.deps).update(harness.as(userId), LYRA_SHEET_ID, input);
}

describe('SheetsService: creating', () => {
  it('Ana creates the Goblin without a holder: only masters find it, and the library hears it', async () => {
    const harness = new SheetsHarness();

    const { sheet, receipt } = await create(harness, { name: 'Goblin' });

    expect(sheet).toMatchObject({ name: 'Goblin', folderId: null, tokenId: null, memberId: null });
    expect([sheet.canEdit, sheet.canManage]).toEqual([true, true]);
    expect(receipt).toEqual({
      ...{ actionId: SHEET_ACTION_ID, sheetId: LYRA_SHEET_ID },
      ...{ version: 0, operation: 'create' },
    });
    expect(harness.journal).toEqual([
      'lock',
      'insert',
      'receipt',
      'commit',
      'publish sheet',
      'publish',
    ]);
    expect(harness.library.changes).toEqual([
      { campaignId: VHARN_ID, at: '2026-10-31T15:00:00.000Z' },
    ]);
    const read = new SheetsService(harness.deps).get(harness.as(BIA_ID), LYRA_SHEET_ID);
    await expect(read).rejects.toMatchObject({ code: 'SHEET_NOT_FOUND' });
  });

  it('a sheet created in Ato 1 lands there; a folder of Quelm is FOLDER_NOT_FOUND', async () => {
    const harness = new SheetsHarness();

    const { sheet } = await create(harness, { folderId: ATO_1_ID });
    const refused = create(harness, { actionId: OTHER_ACTION_ID, folderId: QUELM_FOLDER_ID });

    expect(sheet.folderId).toBe(ATO_1_ID);
    await expect(refused).rejects.toMatchObject({ code: 'FOLDER_NOT_FOUND' });
  });

  it("a sheet of the linked Lyra goes to her character, Bia's, and no token holds it", async () => {
    const harness = new SheetsHarness();

    const { sheet } = await linkLyra(harness);

    expect(sheet).toMatchObject({ tokenId: null, memberId: BIA_ID, version: 0, canEdit: true });
    expect(harness.sheets.rows.at(-1)).toMatchObject({ characterId: LYRA_CHARACTER_ID });
  });

  it("the first sheet given to Caio becomes Kael's main one: lock, main, bump, then character:changed", async () => {
    const harness = new SheetsHarness();

    const { sheet } = await create(harness, { name: 'Kael', holder: { memberId: CAIO_ID } });

    expect(sheet).toMatchObject({ tokenId: null, memberId: CAIO_ID, canEdit: true });
    expect(harness.mainSheetOf(KAEL_CHARACTER_ID)).toBe(sheet.id);
    expect(harness.journal).toEqual([
      ...['lock', 'insert', 'lock characters', 'main sheet', 'bump characters', 'receipt'],
      ...['commit', 'publish sheet', 'publish', 'publish'],
    ]);
    const [change] = harness.characterPublisher.changes;
    expect(change).toMatchObject({ campaignId: VHARN_ID, version: 5 });
    expect(change?.characters.map(({ privileged }) => privileged.mainSheetId)).toEqual([sheet.id]);
    expect(harness.characters.rows).toHaveLength(4);
  });

  it('a second sheet of Lyra keeps the first as her main one, and no characters version is spent', async () => {
    const harness = new SheetsHarness();
    const first = await linkLyra(harness);

    await create(harness, { actionId: OTHER_ACTION_ID, holder: { memberId: BIA_ID } });

    expect(harness.mainSheetOf(LYRA_CHARACTER_ID)).toBe(first.sheet.id);
    expect(harness.characterPublisher.changes).toHaveLength(1);
    expect(harness.characters.versions[VHARN_ID]).toBe(5);
  });

  it('a sheet of a loose token touches no character', async () => {
    const harness = new SheetsHarness();

    await create(harness, { holder: { tokenId: BRAM_ID } });

    expect(harness.journal).not.toContain('lock characters');
    expect(harness.characterPublisher.changes).toEqual([]);
  });

  it.each([
    ['the master Ana', ANA_ID],
    ['the spectator Duda', DUDA_ID],
    ['a stranger', QUELM_TOKEN_ID],
  ])('giving a sheet to %s is MEMBER_NOT_FOUND and nothing is saved', async (_who, memberId) => {
    const harness = new SheetsHarness();

    await expect(create(harness, { holder: { memberId } })).rejects.toMatchObject({
      code: 'MEMBER_NOT_FOUND',
    });
    expect(harness.journal).not.toContain('insert');
    expect(harness.characterPublisher.changes).toEqual([]);
  });

  it('Lyra holds two sheets, and the list of the linked Lyra has both', async () => {
    const harness = new SheetsHarness();
    await linkLyra(harness);
    await create(harness, {
      actionId: OTHER_ACTION_ID,
      name: 'Grimório',
      holder: { memberId: BIA_ID },
    });

    const { sheets } = await new SheetsService(harness.deps).listOfToken(
      harness.as(BIA_ID),
      LYRA_ID,
    );

    expect(sheets.map(({ name }) => name)).toEqual(['Lyra', 'Grimório']);
    expect(sheets[0]).not.toHaveProperty('values');
  });

  it('the same create again replays its receipt without a second sheet, main sheet or event', async () => {
    const harness = new SheetsHarness();

    const first = await create(harness, { holder: { memberId: CAIO_ID } });
    const again = await create(harness, { holder: { memberId: CAIO_ID } });

    expect(again).toEqual(first);
    expect(harness.sheets.rows).toHaveLength(2);
    expect(harness.publisher.events).toHaveLength(1);
    expect(harness.library.changes).toHaveLength(1);
    expect(harness.characterPublisher.changes).toHaveLength(1);
  });

  it.each([
    ['the token of Quelm', { holder: { tokenId: QUELM_TOKEN_ID } }, 'TOKEN_NOT_FOUND'],
    ['the template of Quelm', { templateId: QUELM_TEMPLATE_ID }, 'SHEET_TEMPLATE_NOT_FOUND'],
  ])('creating with %s is refused with %s', async (_what, target, code) => {
    const harness = new SheetsHarness();

    const creation = new SheetsService(harness.deps).create(harness.as(ANA_ID), {
      ...{ actionId: SHEET_ACTION_ID, templateId: TORMENTA_ID, name: 'Lyra' },
      ...target,
    });

    await expect(creation).rejects.toMatchObject({ code });
  });

  it('Bia creating a sheet is FORBIDDEN', async () => {
    const harness = new SheetsHarness();

    await expect(create(harness, {}, BIA_ID)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('SheetsService: reading by token', () => {
  it('Caio lists the sheets of Lyra and sees only the table one', async () => {
    const harness = new SheetsHarness()
      .withLyraSheet()
      .withLyraSheet({ id: OTHER_ACTION_ID, name: 'Diário', visibility: 'table' });

    const { sheets } = await new SheetsService(harness.deps).listOfToken(
      harness.as(CAIO_ID),
      LYRA_ID,
    );

    expect(sheets.map(({ id }) => id)).toEqual([OTHER_ACTION_ID]);
  });

  it("the linked Lyra lists her character's sheets; Bram, loose, his own", async () => {
    const harness = new SheetsHarness()
      .withLyraSheet()
      .withLyraSheet({ id: OTHER_ACTION_ID, name: 'Bram', characterId: null, tokenId: BRAM_ID });
    const service = new SheetsService(harness.deps);

    const lyra = await service.listOfToken(harness.as(ANA_ID), LYRA_ID);
    const bram = await service.listOfToken(harness.as(ANA_ID), BRAM_ID);

    expect(lyra.sheets.map(({ id }) => id)).toEqual([LYRA_SHEET_ID]);
    expect(bram.sheets.map(({ id }) => id)).toEqual([OTHER_ACTION_ID]);
  });

  it('a token without sheets lists none; the token of Quelm is TOKEN_NOT_FOUND', async () => {
    const harness = new SheetsHarness();
    const service = new SheetsService(harness.deps);

    expect((await service.listOfToken(harness.as(ANA_ID), BRAM_ID)).sheets).toEqual([]);
    await expect(service.listOfToken(harness.as(ANA_ID), QUELM_TOKEN_ID)).rejects.toMatchObject({
      code: 'TOKEN_NOT_FOUND',
    });
  });

  it('the Lobo on the private Torre: Bia, its controller, lists none of its sheets', async () => {
    const harness = new SheetsHarness().withLyraSheet({ characterId: null, tokenId: LOBO_ID });

    const { sheets } = await new SheetsService(harness.deps).listOfToken(
      harness.as(BIA_ID),
      LOBO_ID,
    );

    expect(sheets).toEqual([]);
  });

  it('the sheet of Quelm by its id at Vharn is SHEET_NOT_FOUND', async () => {
    const harness = new SheetsHarness();

    const read = new SheetsService(harness.deps).get(harness.as(ANA_ID), QUELM_SHEET_ID);

    await expect(read).rejects.toMatchObject({ code: 'SHEET_NOT_FOUND' });
  });

  it('on a table sheet Caio and Duda read it with canEdit false', async () => {
    const harness = new SheetsHarness().withLyraSheet({ visibility: 'table' });
    const service = new SheetsService(harness.deps);

    const caio = await service.get(harness.as(CAIO_ID), LYRA_SHEET_ID);
    const duda = await service.get(harness.as(DUDA_ID), LYRA_SHEET_ID);

    expect([caio.sheet.canEdit, duda.sheet.canEdit]).toEqual([false, false]);
    expect(caio.template).toMatchObject({ name: 'Ficha Tormenta', version: 2 });
  });

  it('Caio, once the master lists him in the control of Lyra, reads her controllers sheet', async () => {
    const harness = new SheetsHarness().withLyraSheet();
    const before = new SheetsService(harness.deps).get(harness.as(CAIO_ID), LYRA_SHEET_ID);
    await expect(before).rejects.toMatchObject({ code: 'SHEET_NOT_FOUND' });
    await harness.characters.replaceControllers(LYRA_CHARACTER_ID, [BIA_ID, CAIO_ID]);

    const { sheet } = await new SheetsService(harness.deps).get(harness.as(CAIO_ID), LYRA_SHEET_ID);

    expect(sheet).toMatchObject({ canEdit: true, canManage: false });
  });
});

describe('SheetsService: reading by character', () => {
  function listOf(harness: SheetsHarness, userId: string, characterId: string) {
    return new SheetsService(harness.deps).listOfCharacter(harness.as(userId), characterId);
  }

  it('Bia lists both sheets of Lyra; Caio only the table one', async () => {
    const harness = new SheetsHarness()
      .withLyraSheet()
      .withLyraSheet({ id: OTHER_ACTION_ID, name: 'Diário', visibility: 'table' });

    const bia = await listOf(harness, BIA_ID, LYRA_CHARACTER_ID);
    const caio = await listOf(harness, CAIO_ID, LYRA_CHARACTER_ID);

    expect(bia.sheets.map(({ id }) => id)).toEqual([LYRA_SHEET_ID, OTHER_ACTION_ID]);
    expect(caio.sheets.map(({ id }) => id)).toEqual([OTHER_ACTION_ID]);
    expect(bia.sheets[0]).toMatchObject({ tokenId: null, memberId: BIA_ID });
    expect(bia.sheets[0]).not.toHaveProperty('values');
  });

  it('the stored Mira is CHARACTER_NOT_FOUND to Caio but listed to Ana', async () => {
    const harness = new SheetsHarness().withLyraSheet({ characterId: MIRA_CHARACTER_ID });

    await expect(listOf(harness, CAIO_ID, MIRA_CHARACTER_ID)).rejects.toMatchObject({
      code: 'CHARACTER_NOT_FOUND',
    });
    expect((await listOf(harness, ANA_ID, MIRA_CHARACTER_ID)).sheets).toHaveLength(1);
  });

  it('the character of Quelm at Vharn is CHARACTER_NOT_FOUND, citing it', async () => {
    const harness = new SheetsHarness();

    await expect(listOf(harness, ANA_ID, QUELM_CHARACTER_ID)).rejects.toMatchObject({
      code: 'CHARACTER_NOT_FOUND',
      message: expect.stringContaining(QUELM_CHARACTER_ID),
    });
  });
});

describe('SheetsService: values', () => {
  it('Bia writes forca 16: the version goes up, the table hears it without values, the library not', async () => {
    const harness = new SheetsHarness().withLyraSheet();

    const { sheet, receipt } = await write(harness, BIA_ID, { forca: 16 });

    expect(sheet.values).toEqual({ forca: 16 });
    expect(receipt).toMatchObject({ version: 5, operation: 'values' });
    expect(harness.publisher.events).toEqual([
      { campaignId: VHARN_ID, sheetId: LYRA_SHEET_ID, version: 5, at: '2026-10-31T15:00:00.000Z' },
    ]);
    expect(harness.journal).toEqual(['lock', 'patch values', 'receipt', 'commit', 'publish sheet']);
    expect(harness.library.changes).toEqual([]);
  });

  it('a patch with notas null removes the key, and Ana and Bia writing different keys keep both', async () => {
    const harness = new SheetsHarness().withLyraSheet({ values: { forca: 14, notas: 'x' } });

    await write(harness, BIA_ID, { forca: 16, notas: null });
    const { sheet } = await write(harness, ANA_ID, { destreza: 12 });

    expect(sheet.values).toEqual({ forca: 16, destreza: 12 });
  });

  it('values over the budget after the merge are refused and nothing is saved', async () => {
    const big = 'a'.repeat(200 * 1024);
    const harness = new SheetsHarness().withLyraSheet({ values: { historia: big } });

    await expect(write(harness, BIA_ID, { biografia: big })).rejects.toThrow('exceed 262144 bytes');
    expect(harness.sheets.rows.find(({ id }) => id === LYRA_SHEET_ID)?.values).toEqual({
      historia: big,
    });
    expect(harness.journal).not.toContain('publish sheet');
  });

  it('Caio on a controllers sheet is SHEET_NOT_FOUND, on a table one FORBIDDEN', async () => {
    const hidden = new SheetsHarness().withLyraSheet();
    const shown = new SheetsHarness().withLyraSheet({ visibility: 'table' });

    await expect(write(hidden, CAIO_ID, { forca: 1 })).rejects.toMatchObject({
      code: 'SHEET_NOT_FOUND',
    });
    await expect(write(shown, CAIO_ID, { forca: 1 })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('Ana writes values on a sheet nobody holds; Bia does not find it', async () => {
    const harness = new SheetsHarness().withLyraSheet({ characterId: null });

    const { sheet } = await write(harness, ANA_ID, { forca: 18 });

    expect(sheet.values).toEqual({ forca: 18 });
    await expect(write(harness, BIA_ID, { forca: 1 })).rejects.toMatchObject({
      code: 'SHEET_NOT_FOUND',
    });
  });

  it('an actionId used again for another command is SHEET_ACTION_REUSED', async () => {
    const harness = new SheetsHarness().withLyraSheet();
    const service = new SheetsService(harness.deps);
    await service.updateValues(harness.as(BIA_ID), LYRA_SHEET_ID, {
      ...{ actionId: SHEET_ACTION_ID, changes: { forca: 16 } },
    });

    const reused = service.updateValues(harness.as(BIA_ID), LYRA_SHEET_ID, {
      ...{ actionId: SHEET_ACTION_ID, changes: { forca: 17 } },
    });

    await expect(reused).rejects.toMatchObject({ code: 'SHEET_ACTION_REUSED' });
  });

  it('a failed commit rolls the values back and never publishes', async () => {
    const harness = new SheetsHarness().withLyraSheet();
    harness.failCommit = true;

    await expect(write(harness, BIA_ID, { forca: 16 })).rejects.toThrow('commit failed');
    expect(harness.sheets.rows.find(({ id }) => id === LYRA_SHEET_ID)?.values).toEqual({
      forca: 14,
    });
    expect(harness.publisher.events).toEqual([]);
  });
});

describe('SheetsService: managing', () => {
  it("Ana takes the sheet from Bia: it is nobody's, version 5, and the library hears it", async () => {
    const harness = new SheetsHarness().withLyraSheet();

    const { sheet, receipt } = await manage(harness, { holder: null });

    expect(sheet).toMatchObject({ tokenId: null, memberId: null, version: 5 });
    expect(harness.sheets.rows.at(-1)?.characterId).toBeNull();
    expect(receipt.operation).toBe('update');
    expect(harness.library.changes).toHaveLength(1);
    expect(harness.publisher.events.map(({ version }) => version)).toEqual([5]);
    await expect(
      new SheetsService(harness.deps).get(harness.as(BIA_ID), LYRA_SHEET_ID),
    ).rejects.toMatchObject({ code: 'SHEET_NOT_FOUND' });
  });

  it('Ana renames the sheet and moves it to Ato 1', async () => {
    const harness = new SheetsHarness().withLyraSheet();

    const { sheet } = await manage(harness, { name: 'Lyra, a Ruiva', folderId: ATO_1_ID });

    expect(sheet).toMatchObject({ name: 'Lyra, a Ruiva', folderId: ATO_1_ID, memberId: BIA_ID });
    expect(harness.library.changes).toHaveLength(1);
    expect(harness.journal).not.toContain('lock characters');
  });

  it('moving to a folder of Quelm is FOLDER_NOT_FOUND and nothing changes', async () => {
    const harness = new SheetsHarness().withLyraSheet();

    await expect(manage(harness, { folderId: QUELM_FOLDER_ID })).rejects.toMatchObject({
      code: 'FOLDER_NOT_FOUND',
    });
    expect(harness.library.changes).toEqual([]);
  });

  it('Ana gives the Goblin to Caio: Kael holds it and makes it his main sheet', async () => {
    const harness = new SheetsHarness().withLyraSheet({ characterId: null, name: 'Goblin' });

    const { sheet } = await manage(harness, { holder: { memberId: CAIO_ID } });

    expect(sheet).toMatchObject({ tokenId: null, memberId: CAIO_ID });
    expect(harness.mainSheetOf(KAEL_CHARACTER_ID)).toBe(LYRA_SHEET_ID);
    expect(harness.characterPublisher.changes.map(({ version }) => version)).toEqual([5]);
  });

  it("Ana moves Lyra's main sheet to Kael: Lyra has none, Kael gets it, in one version", async () => {
    const harness = new SheetsHarness()
      .withLyraSheet()
      .withMainSheet(LYRA_CHARACTER_ID, LYRA_SHEET_ID);

    await manage(harness, { holder: { memberId: CAIO_ID } });

    expect(harness.mainSheetOf(LYRA_CHARACTER_ID)).toBeNull();
    expect(harness.mainSheetOf(KAEL_CHARACTER_ID)).toBe(LYRA_SHEET_ID);
    const [change] = harness.characterPublisher.changes;
    expect(change?.version).toBe(5);
    expect(change?.characters.map(({ characterId }) => characterId)).toEqual([
      LYRA_CHARACTER_ID,
      KAEL_CHARACTER_ID,
    ]);
  });

  it('Ana puts the sheet in table, and Bia changing the visibility or the template is FORBIDDEN', async () => {
    const harness = new SheetsHarness().withLyraSheet();

    const { sheet } = await manage(harness, { visibility: 'table' });
    const visibility = manage(harness, { visibility: 'controllers' }, BIA_ID);
    const template = manage(harness, { templateId: TORMENTA_ID }, BIA_ID);

    expect(sheet.visibility).toBe('table');
    await expect(visibility).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(template).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('Ana deletes the sheet: it is gone and the table and the library hear it', async () => {
    const harness = new SheetsHarness().withLyraSheet();

    await new SheetsService(harness.deps).delete(harness.as(ANA_ID), LYRA_SHEET_ID, {
      actionId: SHEET_ACTION_ID,
    });

    expect(harness.sheets.rows.map(({ id }) => id)).toEqual([QUELM_SHEET_ID]);
    expect(harness.publisher.events.map(({ version }) => version)).toEqual([5]);
    expect(harness.library.changes).toHaveLength(1);
    expect(harness.characterPublisher.changes).toEqual([]);
  });

  it("Ana deletes Lyra's main sheet: Lyra has none and the table hears character:changed", async () => {
    const harness = new SheetsHarness()
      .withLyraSheet()
      .withMainSheet(LYRA_CHARACTER_ID, LYRA_SHEET_ID);

    await new SheetsService(harness.deps).delete(harness.as(ANA_ID), LYRA_SHEET_ID, {
      actionId: SHEET_ACTION_ID,
    });

    expect(harness.mainSheetOf(LYRA_CHARACTER_ID)).toBeNull();
    expect(harness.journal).toEqual([
      ...['lock', 'lock characters', 'main sheet', 'bump characters', 'delete', 'receipt'],
      ...['commit', 'publish sheet', 'publish', 'publish'],
    ]);
    const [change] = harness.characterPublisher.changes;
    expect(change?.characters[0]?.privileged).toMatchObject({ mainSheetId: null });
  });
});
