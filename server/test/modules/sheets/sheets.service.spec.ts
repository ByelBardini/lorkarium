import type { CreateSheetRequestDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { SheetsService } from '../../../src/modules/sheets/sheets.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, DUDA_ID, VHARN_ID } from '../../support/campaigns-factories';
import { ATO_1_ID, QUELM_FOLDER_ID } from '../../support/library-factories';
import { VHARN_CAST_ID } from '../../support/scenes-factories';
import { QUELM_TEMPLATE_ID, TORMENTA_ID } from '../../support/sheet-templates-fakes';
import {
  LYRA_ANCHOR_ID,
  LYRA_SHEET_ID,
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

  it("a sheet of the linked Lyra goes to the anchor, Bia's character", async () => {
    const harness = new SheetsHarness();

    const { sheet } = await linkLyra(harness);

    expect(sheet).toMatchObject({ tokenId: LYRA_ANCHOR_ID, memberId: BIA_ID, version: 0 });
  });

  it('giving a sheet to Caio, who has no character, creates his anchor in the cast and his card', async () => {
    const harness = new SheetsHarness();

    const { sheet } = await create(harness, { name: 'Kael', holder: { memberId: CAIO_ID } });

    const anchor = harness.tokens.rows[0]?.token;
    expect(anchor).toMatchObject({ sceneId: VHARN_CAST_ID, name: 'Caio', initials: 'CA' });
    expect(anchor).toMatchObject({ side: 'ally', width: 1, height: 1, col: 0, row: 0 });
    expect(harness.tokens.rows[0]?.controllerIds).toEqual([CAIO_ID]);
    expect(sheet).toMatchObject({ tokenId: anchor?.id, memberId: CAIO_ID, canEdit: true });
    expect(await harness.cards.findOfMember(VHARN_ID, CAIO_ID)).toMatchObject({
      anchorTokenId: anchor?.id,
    });
    expect(harness.scenes.journal).toEqual(['lock cast', 'bump cast', 'bump cast']);
    expect(harness.journal).toEqual([
      ...['lock', 'save', 'save', 'insert', 'receipt', 'commit'],
      ...['publish', 'publish', 'publish sheet', 'publish'],
    ]);
  });

  it('the new anchor reaches the cast as token:created, then the card at the next cast version', async () => {
    const harness = new SheetsHarness();

    await create(harness, { holder: { memberId: CAIO_ID } });

    const created = harness.board.tokenChanges[0];
    expect(created).toMatchObject({ name: 'token:created', sceneId: VHARN_CAST_ID });
    expect(created?.privileged).toMatchObject({ version: 3, token: { name: 'Caio' } });
    expect(created?.controllerIds).toEqual([CAIO_ID]);
    expect(harness.board.memberCardChanges).toEqual([
      expect.objectContaining({ sceneId: VHARN_CAST_ID, version: 4 }),
    ]);
    expect(harness.board.memberCardChanges[0]?.card).toMatchObject({ userId: CAIO_ID });
  });

  it('giving a sheet to Bia, who has a character, uses its anchor and creates nothing', async () => {
    const harness = new SheetsHarness();

    const { sheet } = await create(harness, { holder: { memberId: BIA_ID } });

    expect(sheet).toMatchObject({ tokenId: LYRA_ANCHOR_ID, memberId: BIA_ID });
    expect(harness.tokens.rows).toEqual([]);
    expect(harness.scenes.journal).toEqual(['lock cast']);
    expect(harness.board.tokenChanges).toEqual([]);
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
    expect(harness.board.tokenChanges).toEqual([]);
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

  it('the same create again replays its receipt without a second sheet, anchor or event', async () => {
    const harness = new SheetsHarness();

    const first = await create(harness, { holder: { memberId: CAIO_ID } });
    const again = await create(harness, { holder: { memberId: CAIO_ID } });

    expect(again).toEqual(first);
    expect(harness.tokens.rows).toHaveLength(1);
    expect(harness.publisher.events).toHaveLength(1);
    expect(harness.library.changes).toHaveLength(1);
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

  it('a token without sheets lists none; the token of Quelm is TOKEN_NOT_FOUND', async () => {
    const harness = new SheetsHarness();
    const service = new SheetsService(harness.deps);

    expect((await service.listOfToken(harness.as(ANA_ID), BRAM_ID)).sheets).toEqual([]);
    await expect(service.listOfToken(harness.as(ANA_ID), QUELM_TOKEN_ID)).rejects.toMatchObject({
      code: 'TOKEN_NOT_FOUND',
    });
  });

  it('the Lobo on the private Torre: Bia, its controller, lists none of its sheets', async () => {
    const harness = new SheetsHarness().withLyraSheet({ tokenId: LOBO_ID });

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

  it('once the master takes Bia out of the control, her controllers sheet is SHEET_NOT_FOUND', async () => {
    const harness = new SheetsHarness().withLyraSheet();
    const anchor = await harness.sheets.placeOf(VHARN_ID, LYRA_ANCHOR_ID);
    if (anchor)
      harness.sheets.places.get(VHARN_ID)?.set(LYRA_ANCHOR_ID, { ...anchor, controllerIds: [] });

    const read = new SheetsService(harness.deps).get(harness.as(BIA_ID), LYRA_SHEET_ID);

    await expect(read).rejects.toMatchObject({ code: 'SHEET_NOT_FOUND' });
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
    const harness = new SheetsHarness().withLyraSheet({ tokenId: null });

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

    expect(sheet).toMatchObject({
      name: 'Lyra, a Ruiva',
      folderId: ATO_1_ID,
      tokenId: LYRA_ANCHOR_ID,
    });
    expect(harness.library.changes).toHaveLength(1);
  });

  it('moving to a folder of Quelm is FOLDER_NOT_FOUND and nothing changes', async () => {
    const harness = new SheetsHarness().withLyraSheet();

    await expect(manage(harness, { folderId: QUELM_FOLDER_ID })).rejects.toMatchObject({
      code: 'FOLDER_NOT_FOUND',
    });
    expect(harness.library.changes).toEqual([]);
  });

  it('Ana gives the Goblin to Caio: his anchor is created and the sheet hangs on it', async () => {
    const harness = new SheetsHarness().withLyraSheet({ tokenId: null, name: 'Goblin' });

    const { sheet } = await manage(harness, { holder: { memberId: CAIO_ID } });

    const anchorId = harness.tokens.rows[0]?.token.id;
    expect(sheet).toMatchObject({ tokenId: anchorId, memberId: CAIO_ID });
    expect(harness.board.memberCardChanges).toHaveLength(1);
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
  });
});
