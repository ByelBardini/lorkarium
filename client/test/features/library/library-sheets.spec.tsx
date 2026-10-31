import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { SheetSummaryDto } from '@lorkarium/contracts';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { VHARN } from '../../support/campaigns-api-fake';
import { castBoard, lyraAnchor } from '../../support/cast-fixtures';
import { DataTransferFake } from '../../support/data-transfer-fake';
import { ATO_1, masterLibrary, playerLibrary } from '../../support/library-fixtures';
import { openLibrary, type LibraryRoomOptions } from '../../support/library-harness';
import { menuItemNames, openTreeMenu, treeItem, treeItemNames } from '../../support/library-tree';
import {
  GOBLIN_SHEET_ID,
  LYRA_SHEET_ID,
  SPARE_SHEET_ID,
  TORMENTA_TEMPLATE_ID,
  lyraSummary,
  spareSummary,
} from '../../support/sheet-fixtures';
import { tormentaSummary } from '../../support/sheet-template-fixtures';
import { CAIO_AT_TABLE, lyra, memberCard, vharnBoard } from '../../support/table-session-fixtures';

const CAIO = CAIO_AT_TABLE.userId;
const GOBLIN_TOKEN_ID = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
// Caio's character (the cast's card says "Kael"), a token's on the grid, and one nobody holds.
const CAIO_SHEET = lyraSummary({ name: 'Kael de Vharn', memberId: CAIO, folderId: ATO_1.id });
const GOBLIN_SHEET = lyraSummary({
  id: GOBLIN_SHEET_ID,
  name: 'Goblin chefe',
  tokenId: GOBLIN_TOKEN_ID,
  memberId: null,
});
const SPARE = spareSummary();

function withSheets(sheets: readonly SheetSummaryDto[] = [CAIO_SHEET, GOBLIN_SHEET, SPARE]) {
  const deps = testDependencies();
  deps.libraryApi.answer('list', {
    ok: true,
    value: masterLibrary({ sheetTemplates: [tormentaSummary()], sheets: [...sheets] }),
  });
  return deps;
}

// The cast names Caio's character; the group grid has the goblin.
async function openWithHolders(deps: TestDependencies, options: LibraryRoomOptions = {}) {
  const room = await openLibrary(deps, options);
  act(() => {
    deps.tableSessionApi.emitToCast(VHARN.id, {
      kind: 'board',
      state: castBoard({
        tokens: [lyraAnchor()],
        memberCards: [memberCard({ userId: CAIO, characterName: 'Kael' })],
      }),
    });
    deps.tableSessionApi.emit({
      kind: 'board',
      state: vharnBoard({ version: 5, tokens: [lyra({ id: GOBLIN_TOKEN_ID, name: 'Goblin' })] }),
    });
  });
  return room;
}

async function filterSheets(): Promise<void> {
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tipo de item' }), 'sheet');
}

describe('sheets in the library', () => {
  it('"Fichas" shows the sheets with their folders, each saying who holds it', async () => {
    const deps = withSheets();
    await openWithHolders(deps);
    await filterSheets();
    expect(treeItemNames()).toEqual([
      'Ato 1',
      'Kael de Vharn',
      'Sem pasta',
      'Goblin chefe',
      'Ficha reserva',
    ]);
    expect(treeItem('Kael de Vharn')).toHaveAccessibleDescription('Ficha · de Caio (Kael)');
    expect(treeItem('Goblin chefe')).toHaveAccessibleDescription('Ficha · token Goblin');
    expect(treeItem('Ficha reserva')).toHaveAccessibleDescription('Ficha · sem dono, só mestres');
  });

  it('picking a sheet shows it with "Abrir ficha", which opens its tab in the room', async () => {
    const deps = withSheets();
    const { router } = await openWithHolders(deps);
    await userEvent.click(treeItem('Ficha reserva'));
    const panel = screen.getByRole('region', { name: 'Ficha escolhida' });
    expect(within(panel).getByText('Ficha · sem dono, só mestres')).toBeInTheDocument();
    expect(within(panel).getByText('Modelo · Ficha Tormenta')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Abrir ficha' }));
    expect(deps.documentWorkspace.getState().sheets.map(({ sheetId }) => sheetId)).toEqual([
      SPARE_SHEET_ID,
    ]);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/campaigns/${VHARN.id}/table`),
    );
    act(() => deps.documentWorkspace.getState().clear());
  });

  it('"Abrir ficha em janela" opens its window and leaves the library open', async () => {
    const deps = withSheets();
    const { router } = await openWithHolders(deps);
    const menu = await openTreeMenu(treeItem('Ficha reserva'));
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Abrir ficha em janela' }));
    expect(deps.chatWindowHost.calls.map(({ url }) => url)).toEqual([
      '/chat-window.html?panel=sheet',
    ]);
    expect(router.state.location.pathname).toBe(`/campaigns/${VHARN.id}/table/library`);
    act(() => deps.documentWorkspace.getState().clear());
  });

  it('a player sees only the sheets the server gave them, with the "Fichas" filter and "Abrir"', async () => {
    const deps = testDependencies();
    deps.libraryApi.answer('list', { ok: true, value: playerLibrary({ sheets: [lyraSummary()] }) });
    await openLibrary(deps, { role: 'player' });
    await filterSheets();
    expect(treeItemNames()).toEqual(['Sem pasta', 'Lyra de Vharn']);
    await userEvent.click(treeItem('Lyra de Vharn'));
    const panel = screen.getByRole('region', { name: 'Ficha escolhida' });
    expect(within(panel).queryByText(/^Modelo ·/u)).not.toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Abrir ficha' }));
    expect(deps.documentWorkspace.getState().sheets.map(({ sheetId }) => sheetId)).toEqual([
      LYRA_SHEET_ID,
    ]);
    act(() => deps.documentWorkspace.getState().clear());
  });

  it("the master's menu on a sheet: open, rename, give, take, who sees, delete", async () => {
    const deps = withSheets();
    await openWithHolders(deps);
    const menu = await openTreeMenu(treeItem('Ficha reserva'));
    expect(menuItemNames(menu)).toEqual([
      'Abrir ficha',
      'Abrir ficha em janela',
      'Renomear',
      'Dar a',
      'Tirar do dono',
      'Quem vê a ficha',
      'Excluir ficha…',
    ]);
    expect(within(menu).getByRole('menuitem', { name: 'Tirar do dono' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('"Dar a ▸ Caio (Kael)" gives the sheet to the player', async () => {
    const deps = withSheets();
    await openWithHolders(deps);
    const menu = await openTreeMenu(treeItem('Ficha reserva'));
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Dar a' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Caio (Kael)' }));
    await waitFor(() => expect(deps.sheetsApi.updates).toHaveLength(1));
    expect(deps.sheetsApi.updates[0]).toEqual({
      sheetId: SPARE_SHEET_ID,
      input: { actionId: expect.any(String), holder: { memberId: CAIO } },
    });
  });

  it('"Tirar do dono" and "Quem vê ▸ A mesa toda" change the sheet held by a token', async () => {
    const deps = withSheets();
    await openWithHolders(deps);
    await userEvent.click(
      within(await openTreeMenu(treeItem('Goblin chefe'))).getByRole('menuitem', {
        name: 'Tirar do dono',
      }),
    );
    await waitFor(() => expect(deps.sheetsApi.updates).toHaveLength(1));
    const menu = await openTreeMenu(treeItem('Goblin chefe'));
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Quem vê a ficha' }));
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'A mesa toda (só leitura)' }),
    );
    await waitFor(() => expect(deps.sheetsApi.updates).toHaveLength(2));
    expect(deps.sheetsApi.updates.map(({ sheetId, input }) => [sheetId, input])).toEqual([
      [GOBLIN_SHEET_ID, { actionId: expect.any(String), holder: null }],
      [GOBLIN_SHEET_ID, { actionId: expect.any(String), visibility: 'table' }],
    ]);
  });

  it('"Renomear" renames in place, as a sheet name', async () => {
    const deps = withSheets();
    await openWithHolders(deps);
    const menu = await openTreeMenu(treeItem('Ficha reserva'));
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Renomear' }));
    const field = await screen.findByRole('textbox', { name: 'Nome da ficha' });
    expect(field).toHaveAttribute('maxLength', '60');
    await userEvent.clear(field);
    await userEvent.type(field, 'Capitão da guarda{Enter}');
    await waitFor(() => expect(deps.sheetsApi.updates).toHaveLength(1));
    expect(deps.sheetsApi.updates[0]?.input).toEqual({
      actionId: expect.any(String),
      name: 'Capitão da guarda',
    });
  });

  it('"Excluir ficha…" asks first and then deletes it', async () => {
    const deps = withSheets();
    deps.sheetsApi.removeResult = { ok: true, value: null };
    await openWithHolders(deps);
    const menu = await openTreeMenu(treeItem('Ficha reserva'));
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Excluir ficha…' }));
    const question = await screen.findByRole('alertdialog', { name: 'Excluir Ficha reserva?' });
    expect(deps.sheetsApi.removes).toEqual([]);
    await userEvent.click(within(question).getByRole('button', { name: 'Excluir' }));
    await waitFor(() =>
      expect(deps.sheetsApi.removes).toEqual([
        { sheetId: SPARE_SHEET_ID, input: { actionId: expect.any(String) } },
      ]),
    );
  });

  it('dragging a sheet onto a folder moves it', async () => {
    const deps = withSheets();
    await openWithHolders(deps);
    const transfer = new DataTransferFake();
    fireEvent.dragStart(treeItem('Ficha reserva'), { dataTransfer: transfer });
    fireEvent.drop(treeItem('Ato 1'), { dataTransfer: transfer });
    await waitFor(() => expect(deps.sheetsApi.updates).toHaveLength(1));
    expect(deps.sheetsApi.updates[0]).toEqual({
      sheetId: SPARE_SHEET_ID,
      input: { actionId: expect.any(String), folderId: ATO_1.id },
    });
  });
});

describe('a new sheet from the library', () => {
  async function fillNewSheet(name: string, holder: string): Promise<HTMLElement> {
    const dialog = await screen.findByRole('dialog', { name: 'Nova ficha' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nome da ficha' }), name);
    expect(within(dialog).getByRole('combobox', { name: 'Modelo' })).toHaveTextContent(
      'Ficha Tormenta',
    );
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Dono' }));
    await userEvent.click(await screen.findByRole('option', { name: holder }));
    return dialog;
  }

  it('"Criar item ▸ Nova ficha" asks it at the root for the player chosen, then picks it, opening the folder the list shows it in', async () => {
    const deps = withSheets([]);
    deps.sheetsApi.createResult = {
      ok: true,
      value: {
        sheet: { ...CAIO_SHEET, values: {}, canEdit: true, canManage: true },
        receipt: { actionId: 'a', sheetId: CAIO_SHEET.id, version: 0, operation: 'create' },
      },
    };
    await openWithHolders(deps);
    deps.libraryApi.answer('list', {
      ok: true,
      value: masterLibrary({ sheetTemplates: [tormentaSummary()], sheets: [CAIO_SHEET] }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Criar item' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Nova ficha' }));
    const dialog = await fillNewSheet('Kael de Vharn', 'Caio (Kael)');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar ficha' }));
    await waitFor(() => expect(deps.sheetsApi.creates).toHaveLength(1));
    expect(deps.sheetsApi.creates[0]).toEqual({
      actionId: expect.any(String),
      templateId: TORMENTA_TEMPLATE_ID,
      name: 'Kael de Vharn',
      folderId: null,
      holder: { memberId: CAIO },
    });
    await waitFor(() => expect(treeItem('Kael de Vharn')).toHaveAttribute('aria-selected', 'true'));
  });

  it('"Nova ficha aqui" of a folder makes it there, held by nobody', async () => {
    const deps = withSheets([]);
    await openWithHolders(deps);
    const menu = await openTreeMenu(treeItem('Ato 1'));
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Nova ficha aqui' }));
    const dialog = await fillNewSheet('Capitão', 'Ninguém (só mestres)');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar ficha' }));
    await waitFor(() => expect(deps.sheetsApi.creates).toHaveLength(1));
    expect(deps.sheetsApi.creates[0]).toEqual({
      actionId: expect.any(String),
      templateId: TORMENTA_TEMPLATE_ID,
      name: 'Capitão',
      folderId: ATO_1.id,
    });
  });

  it('a blank name cannot be sent, and a refusal is said in the status line', async () => {
    const deps = withSheets([]);
    deps.sheetsApi.createResult = { ok: false, failure: { kind: 'member_not_found' } };
    await openWithHolders(deps);
    await userEvent.click(screen.getByRole('button', { name: 'Criar item' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Nova ficha' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nova ficha' });
    expect(within(dialog).getByRole('button', { name: 'Criar ficha' })).toBeDisabled();
    await fillNewSheet('Kael de Vharn', 'Caio (Kael)');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar ficha' }));
    expect(await screen.findByText('Esse jogador não está mais na mesa.')).toBeInTheDocument();
  });
});
