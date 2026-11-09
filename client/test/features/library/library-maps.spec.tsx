import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { CampaignLibraryDto, LibraryMapSummaryDto } from '@lorkarium/contracts';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { LYRA_PORTRAIT } from '../../support/assets-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { DataTransferFake } from '../../support/data-transfer-fake';
import { ATO_1, masterLibrary, playerLibrary } from '../../support/library-fixtures';
import { openLibrary } from '../../support/library-harness';
import {
  MUNDO_ID,
  REINO_ID,
  libraryMapDetail,
  libraryMapSummary,
} from '../../support/library-map-fixtures';
import {
  menuItemNames,
  newItemDialog,
  openTreeMenu,
  pickNewItemKind,
  startHeaderNewItem,
  treeItem,
  treeItemNames,
} from '../../support/library-tree';

const MUNDO = libraryMapSummary();
const SEGREDO = libraryMapSummary({ visibility: 'private' });

function listing(maps: readonly LibraryMapSummaryDto[]): { ok: true; value: CampaignLibraryDto } {
  return { ok: true, value: masterLibrary({ maps: [...maps] }) };
}

function withMaps(...maps: readonly LibraryMapSummaryDto[]): TestDependencies {
  const deps = testDependencies();
  deps.libraryApi.answer('list', listing(maps));
  return deps;
}

function callsTo(deps: TestDependencies, method: string): readonly (readonly unknown[])[] {
  return deps.libraryMapsApi.calls.filter((call) => call.method === method).map(({ args }) => args);
}

function statusLine(): HTMLElement {
  return within(screen.getByRole('dialog', { name: 'Biblioteca' })).getByRole('status');
}

async function pickMap(name = 'Mundo'): Promise<HTMLElement> {
  await userEvent.click(treeItem(name));
  return screen.getByRole('region', { name: 'Mapa escolhido' });
}

function panelButton(panel: HTMLElement, name: string): HTMLElement {
  return within(panel).getByRole('button', { name });
}

async function fillMap(dialog: HTMLElement): Promise<void> {
  await userEvent.type(within(dialog).getByLabelText('Nome'), 'Mundo');
  await userEvent.upload(
    within(dialog).getByLabelText('Arquivo de imagem'),
    new File(['png'], 'mundo.png', { type: 'image/png' }),
  );
}

describe('creating a map in the library', () => {
  it('the "Mapa" card uploads for a map, registers at the root and picks the new item', async () => {
    const deps = withMaps();
    deps.libraryMapsApi.answer('create', { ok: true, value: MUNDO });
    await openLibrary(deps);
    deps.libraryApi.answer('list', listing([MUNDO]));
    const dialog = await startHeaderNewItem('Mapa');
    await fillMap(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }));
    expect(deps.assets.sent[0]).toMatchObject({ kind: 'upload', purpose: 'library_map' });
    expect(callsTo(deps, 'create')).toEqual([
      [
        VHARN.id,
        { name: 'Mundo', assetId: LYRA_PORTRAIT.id, folderId: null, visibility: 'private' },
      ],
    ]);
    expect(await screen.findByRole('region', { name: 'Mapa escolhido' })).toBeInTheDocument();
    expect(treeItem('Mundo')).toHaveAttribute('aria-selected', 'true');
  });

  it('"Criar novo item" of a folder creates the map inside that folder', async () => {
    const deps = withMaps();
    deps.libraryMapsApi.answer('create', { ok: true, value: { ...MUNDO, folderId: ATO_1.id } });
    await openLibrary(deps);
    const menu = await openTreeMenu(treeItem('Ato 1'));
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Criar novo item' }));
    expect(await newItemDialog()).toHaveAccessibleDescription('Vai para Ato 1.');
    const dialog = await pickNewItemKind('Mapa');
    await fillMap(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }));
    expect(callsTo(deps, 'create')[0]?.[1]).toMatchObject({ folderId: ATO_1.id });
  });

  it('a refused registration keeps the name and the image already sent', async () => {
    const deps = withMaps();
    deps.libraryMapsApi.answer('create', { ok: false, failure: { kind: 'offline' } });
    await openLibrary(deps);
    const dialog = await startHeaderNewItem('Mapa');
    await fillMap(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Sem conexão');
    expect(within(dialog).getByLabelText('Nome')).toHaveValue('Mundo');
    deps.libraryMapsApi.answer('create', { ok: true, value: MUNDO });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar' }));
    expect(deps.assets.sent).toHaveLength(1);
    expect(callsTo(deps, 'create')).toHaveLength(2);
  });

  it('asks for a name and an image before "Criar"', async () => {
    await openLibrary(withMaps());
    const dialog = await startHeaderNewItem('Mapa');
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Mundo');
    expect(within(dialog).getByRole('button', { name: 'Criar' })).toBeDisabled();
  });
});

describe('a map in the tree', () => {
  it('"Mapas" keeps only the maps and the folders above them', async () => {
    await openLibrary(
      withMaps(MUNDO, libraryMapSummary({ id: REINO_ID, name: 'Reino', folderId: ATO_1.id })),
    );
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tipo de item' }), 'map');
    expect(treeItemNames()).toEqual(['Ato 1', 'Reino', 'Sem pasta', 'Mundo']);
    expect(treeItem('Mundo')).toHaveAccessibleDescription('Mapa · Público');
  });

  it('a private main map says it is the main one, and stays private', async () => {
    await openLibrary(withMaps({ ...SEGREDO, isMain: true }));
    expect(treeItem('Mundo')).toHaveAccessibleDescription('Mapa · Privado · Principal');
    const panel = await pickMap();
    expect(within(panel).getByText('Principal')).toBeInTheDocument();
    expect(within(panel).getByRole('radio', { name: 'Privado' })).toBeChecked();
    expect(within(panel).getByRole('note')).toHaveTextContent(
      'Todos da mesa veem este mapa enquanto ele for o principal.',
    );
  });

  it('a map in a folder sits one level under it, showing only once the folder is open', async () => {
    const deps = withMaps({ ...MUNDO, folderId: ATO_1.id });
    await openLibrary(deps);
    expect(treeItemNames()).not.toContain('Mundo');
    await userEvent.click(treeItem('Ato 1'));
    expect(treeItem('Mundo')).toHaveAttribute('aria-level', '2');
  });

  it('dragging moves it at once and a refusal brings it back', async () => {
    const deps = withMaps(MUNDO);
    deps.libraryMapsApi.answer('update', { ok: false, failure: { kind: 'forbidden' } });
    await openLibrary(deps);
    const answerList = deps.libraryApi.hold('list');
    const transfer = new DataTransferFake();
    fireEvent.dragStart(treeItem('Mundo'), { dataTransfer: transfer });
    fireEvent.drop(treeItem('Ato 1'), { dataTransfer: transfer });
    await waitFor(() =>
      expect(callsTo(deps, 'update')).toEqual([[VHARN.id, MUNDO_ID, { folderId: ATO_1.id }]]),
    );
    await waitFor(() => expect(treeItemNames()).not.toContain('Mundo'));
    await act(async () => answerList(listing([MUNDO])));
    await waitFor(() => expect(treeItemNames()).toContain('Mundo'));
    expect(statusLine()).toHaveTextContent('Só o mestre mexe na biblioteca.');
  });

  it("the master's menu opens, renames, marks as main and deletes after asking", async () => {
    const deps = withMaps(MUNDO);
    deps.libraryMapsApi.answer('update', { ok: true, value: MUNDO });
    deps.libraryMapsApi.answer('remove', { ok: true, value: null });
    await openLibrary(deps);
    const menu = await openTreeMenu(treeItem('Mundo'));
    expect(menuItemNames(menu)).toEqual([
      'Abrir',
      'Renomear',
      'Marcar como principal',
      'Excluir mapa',
    ]);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Renomear' }));
    const field = await screen.findByRole('textbox', { name: 'Nome do mapa' });
    await userEvent.clear(field);
    await userEvent.type(field, 'Novo Mundo{Enter}');
    await waitFor(() =>
      expect(callsTo(deps, 'update')).toEqual([[VHARN.id, MUNDO_ID, { name: 'Novo Mundo' }]]),
    );
    const again = await openTreeMenu(treeItem('Mundo'));
    await userEvent.click(within(again).getByRole('menuitem', { name: 'Excluir mapa' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Excluir Mundo?' });
    expect(callsTo(deps, 'remove')).toEqual([]);
    await userEvent.click(within(confirm).getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(callsTo(deps, 'remove')).toEqual([[VHARN.id, MUNDO_ID]]));
  });

  it('a map deleted by someone else leaves nothing picked', async () => {
    const deps = withMaps(MUNDO);
    deps.libraryMapsApi.answer('update', { ok: true, value: MUNDO });
    await openLibrary(deps);
    const panel = await pickMap();
    deps.libraryApi.answer('list', listing([]));
    await userEvent.click(within(panel).getByRole('radio', { name: 'Privado' }));
    expect(await screen.findByRole('region', { name: 'Grid escolhido' })).toBeInTheDocument();
  });
});

describe('the panel of a map', () => {
  it('"Marcar como principal" sends once while the answer is on its way', async () => {
    const deps = withMaps(SEGREDO);
    deps.libraryMapsApi.answer('setMain', { ok: true, value: null });
    await openLibrary(deps);
    const panel = await pickMap();
    expect(within(panel).getByRole('note')).toHaveTextContent(
      'Ao marcar como principal, todos da mesa passam a ver este mapa.',
    );
    const answerList = deps.libraryApi.hold('list');
    const mark = panelButton(panel, 'Marcar como principal');
    await userEvent.click(mark);
    await waitFor(() => expect(mark).toBeDisabled());
    await userEvent.click(mark);
    expect(callsTo(deps, 'setMain')).toEqual([[VHARN.id, MUNDO_ID]]);
    await act(async () => answerList(listing([{ ...SEGREDO, isMain: true }])));
    expect(
      await within(panel).findByRole('button', { name: 'Deixar de ser principal' }),
    ).toBeEnabled();
  });

  it('"Deixar de ser principal" takes the mark off', async () => {
    const deps = withMaps({ ...MUNDO, isMain: true });
    deps.libraryMapsApi.answer('unsetMain', { ok: true, value: null });
    await openLibrary(deps);
    const panel = await pickMap();
    await userEvent.click(panelButton(panel, 'Deixar de ser principal'));
    await waitFor(() => expect(callsTo(deps, 'unsetMain')).toEqual([[VHARN.id, MUNDO_ID]]));
  });

  it('changing who sees it sends the visibility', async () => {
    const deps = withMaps(SEGREDO);
    deps.libraryMapsApi.answer('update', { ok: true, value: MUNDO });
    await openLibrary(deps);
    const panel = await pickMap();
    await userEvent.click(within(panel).getByRole('radio', { name: 'Público' }));
    await waitFor(() =>
      expect(callsTo(deps, 'update')).toEqual([[VHARN.id, MUNDO_ID, { visibility: 'public' }]]),
    );
  });

  it('"Abrir" opens the map in the room\'s tab and goes back to the room', async () => {
    const deps = withMaps(MUNDO);
    deps.libraryMapsApi.maps.set(MUNDO_ID, libraryMapDetail());
    const { router } = await openLibrary(deps);
    const panel = await pickMap();
    await userEvent.click(panelButton(panel, 'Abrir'));
    expect(deps.documentWorkspace.getState().maps.map(({ mapName }) => mapName)).toEqual(['Mundo']);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/campaigns/${VHARN.id}/table`),
    );
    act(() => deps.documentWorkspace.getState().clear());
  });

  it('a player only has "Abrir"', async () => {
    const deps = testDependencies();
    deps.libraryApi.answer('list', { ok: true, value: playerLibrary({ maps: [MUNDO] }) });
    await openLibrary(deps, { role: 'player' });
    const panel = await pickMap();
    expect(
      within(panel)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Abrir']);
    expect(within(panel).queryByRole('textbox')).toBeNull();
  });

  it('reconnecting blocks every change but keeps "Abrir"', async () => {
    const deps = withMaps(MUNDO);
    await openLibrary(deps);
    const panel = await pickMap();
    act(() => deps.tableSessionApi.emit({ kind: 'status', status: 'reconnecting' }));
    expect(within(panel).getByRole('textbox', { name: 'Nome do mapa' })).toBeDisabled();
    expect(within(panel).getByRole('radio', { name: 'Privado' })).toBeDisabled();
    expect(panelButton(panel, 'Marcar como principal')).toBeDisabled();
    expect(panelButton(panel, 'Excluir mapa')).toBeDisabled();
    expect(panelButton(panel, 'Abrir')).toBeEnabled();
  });

  it('deleting the main map shows the refusal on the status line', async () => {
    const deps = withMaps({ ...MUNDO, isMain: true });
    deps.libraryMapsApi.answer('remove', { ok: false, failure: { kind: 'map_is_main' } });
    await openLibrary(deps);
    const panel = await pickMap();
    await userEvent.click(panelButton(panel, 'Excluir mapa'));
    const confirm = await screen.findByRole('alertdialog', { name: 'Excluir Mundo?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Excluir' }));
    await waitFor(() =>
      expect(statusLine()).toHaveTextContent('Escolha outro mapa principal antes de excluir este.'),
    );
  });
});
