import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SceneTabs } from '@/features/board/scene-tabs';
import { fakeClientWidth } from '../../support/client-width-fake';
import type { OpenTable } from '@/stores/open-tables-store';
import { GROUP_TAB } from '@/stores/scene-tabs-store';
import { detailOf, VHARN } from '../../support/campaigns-api-fake';
import {
  createDocumentWorkspaceStore,
  type DocumentWorkspaceStore,
} from '@/stores/document-workspace-store';
import type { StoreApi } from 'zustand/vanilla';
import { DocumentsApiFake } from '../../support/documents-api-fake';
import { LibraryMapsApiFake } from '../../support/library-maps-api-fake';
import { MUNDO_ID, libraryMapDetail } from '../../support/library-map-fixtures';
import { SheetTemplatesApiFake } from '../../support/sheet-templates-api-fake';
import { SheetsApiFake } from '../../support/sheets-api-fake';
import { InteractionClockFake } from '../../support/interaction-clock-fake';
import { documentFixture } from '../../support/documents-fixtures';
import { GOBLIN_SHEET_ID, LYRA_SHEET_ID } from '../../support/sheet-fixtures';
import { TORRE_SCENE, estradaBoard, sceneActivated } from '../../support/scene-tab-fixtures';
import { openTorreTab, openVharnTabs } from '../../support/scene-tabs-harness';
import { TableSessionApiFake } from '../../support/table-session-api-fake';

describe('SceneTabs', () => {
  let api: TableSessionApiFake;
  let table: OpenTable;

  beforeEach(() => {
    api = new TableSessionApiFake();
    table = openVharnTabs(api);
    openTorreTab(api, table);
    render(<SceneTabs tabs={table.tabs} />);
  });

  function tablist(): HTMLElement {
    return screen.getByRole('tablist', { name: 'Grids abertos' });
  }

  it('lists the group grid first, marked "Grupo" and with no close, then the extra ones', () => {
    const tabs = within(tablist()).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Cena 1Grupo', 'Torre']);
    expect(screen.queryByRole('button', { name: 'Fechar Cena 1' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Fechar Torre' })).not.toBeNull();
  });

  it('the close of a tab not shown is hidden from the eye only, until hover or focus', () => {
    act(() => table.tabs.getState().show(GROUP_TAB));
    const close = screen.getByRole('button', { name: 'Fechar Torre' });
    expect(close).toHaveClass('opacity-0');
    expect(close).toHaveClass('focus-visible:opacity-100');
    act(() => table.tabs.getState().show(TORRE_SCENE.id));
    expect(screen.getByRole('button', { name: 'Fechar Torre' })).not.toHaveClass('opacity-0');
  });

  it('marks the tab shown as selected, the only one in the Tab order', () => {
    const [group, torre] = within(tablist()).getAllByRole('tab');
    expect(torre).toHaveAttribute('aria-selected', 'true');
    expect(torre).toHaveAttribute('tabindex', '0');
    expect(group).toHaveAttribute('aria-selected', 'false');
    expect(group).toHaveAttribute('tabindex', '-1');
  });

  it('the arrows move the focus along the tabs and Enter shows the focused one', async () => {
    const [group, torre] = within(tablist()).getAllByRole('tab');
    torre?.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(group).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(torre).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}{Enter}');
    expect(table.tabs.getState().visibleKey).toBe(GROUP_TAB);
    expect(group).toHaveAttribute('aria-selected', 'true');
  });

  it('a click on a tab shows it', async () => {
    await userEvent.click(screen.getByRole('tab', { name: /Cena 1/ }));
    expect(table.tabs.getState().visibleKey).toBe(GROUP_TAB);
  });

  it('"Fechar Torre" closes its tab', async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Fechar Torre' }));
    expect(within(tablist()).getAllByRole('tab')).toHaveLength(1);
    expect(api.unwatched).toEqual([`${VHARN.id}:${TORRE_SCENE.id}`]);
  });

  it('the arrival of the group at another grid is said in the status', () => {
    api.emitTo(VHARN.id, { kind: 'sceneActivated', event: sceneActivated() });
    api.emitTo(VHARN.id, { kind: 'board', state: estradaBoard() });
    expect(screen.getByRole('status', { name: 'Aviso dos grids' })).toHaveTextContent(
      'O mestre levou o grupo para Estrada de Vharn.',
    );
    expect(screen.getByRole('tab', { name: /Estrada de Vharn/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('a tab whose grid has not loaded yet says so', () => {
    act(() => table.tabs.getState().open('2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e'));
    expect(within(tablist()).getAllByRole('tab').at(-1)).toHaveTextContent('Carregando…');
  });
});

describe('SceneTabs in a narrow strip', () => {
  // 340px fits two 112px tabs, their gap and the "+N" button with its gaps, not three.
  let width = 340;
  let restoreWidth: () => void = () => {};
  beforeEach(() => {
    width = 340;
    restoreWidth = fakeClientWidth(() => width);
  });
  afterEach(() => restoreWidth());

  it('moves what does not fit into "+N", keeping the group and the tab shown, and shows it from there', async () => {
    const api = new TableSessionApiFake();
    const table = openVharnTabs(api);
    openTorreTab(api, table);
    const documents = workspaceOfFakes();
    documents.getState().open({ campaign: detailOf(VHARN), document: documentFixture() });
    render(<SceneTabs tabs={table.tabs} documents={documents} campaignId={VHARN.id} />);
    await act(() => Promise.resolve());
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Cena 1Grupo',
      'Carta',
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Mais 1 aba' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Torre' }));
    expect(documents.getState().activeByCampaign[VHARN.id]).toBeNull();
    expect(table.tabs.getState().visibleKey).toBe(TORRE_SCENE.id);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Cena 1Grupo',
      'Torre',
    ]);
    expect(screen.getByRole('tablist')).not.toHaveAttribute('data-squeezed');
  });

  it('lets the pinned tabs shrink past the minimum when they alone pass the room, so none hides under "+N"', async () => {
    width = 200;
    const api = new TableSessionApiFake();
    const table = openVharnTabs(api);
    openTorreTab(api, table);
    render(<SceneTabs tabs={table.tabs} />);
    await act(() => Promise.resolve());
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Cena 1Grupo',
      'Torre',
    ]);
    expect(screen.getByRole('tablist')).toHaveAttribute('data-squeezed', 'true');
  });
});

function workspaceOfFakes(mapsApi = new LibraryMapsApiFake()): StoreApi<DocumentWorkspaceStore> {
  return createDocumentWorkspaceStore({
    api: new DocumentsApiFake(),
    sheetsApi: new SheetsApiFake(),
    sheetTemplatesApi: new SheetTemplatesApiFake(),
    mapsApi,
    clock: new InteractionClockFake(),
  });
}

describe('SceneTabs with the map tab', () => {
  it('shows the map after the grids, named after it, says it is a map and closes', async () => {
    const api = new TableSessionApiFake();
    const table = openVharnTabs(api);
    const mapsApi = new LibraryMapsApiFake();
    mapsApi.maps.set(MUNDO_ID, libraryMapDetail());
    const documents = workspaceOfFakes(mapsApi);
    const key = documents
      .getState()
      .openMap({ campaign: detailOf(VHARN), mapId: MUNDO_ID, mapName: 'Mundo' });
    render(<SceneTabs tabs={table.tabs} documents={documents} campaignId={VHARN.id} />);
    await act(() => Promise.resolve());
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Cena 1Grupo',
      'Mundo',
    ]);
    const tab = screen.getByRole('tab', { name: 'Mundo' });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(tab).toHaveAccessibleDescription('Mapa');
    expect(tab.querySelector('svg.lucide-map')).not.toBeNull();
    expect(documents.getState().activeByCampaign[VHARN.id]).toBe(key);
    await userEvent.click(screen.getByRole('button', { name: 'Fechar mapa Mundo' }));
    expect(screen.queryByRole('tab', { name: 'Mundo' })).not.toBeInTheDocument();
  });

  function stripOverMap(mapIsMain: boolean) {
    const table = openVharnTabs(new TableSessionApiFake());
    const mapsApi = new LibraryMapsApiFake();
    mapsApi.maps.set(MUNDO_ID, libraryMapDetail({ isMain: mapIsMain }));
    const documents = workspaceOfFakes(mapsApi);
    documents.getState().openMap({ campaign: detailOf(VHARN), mapId: MUNDO_ID, mapName: 'Mundo' });
    render(<SceneTabs tabs={table.tabs} documents={documents} campaignId={VHARN.id} />);
    return { documents };
  }

  it('the main map has no tab, and no grid reads as the one on screen', async () => {
    stripOverMap(true);
    await act(() => Promise.resolve());
    expect(screen.queryByRole('tab', { name: 'Mundo' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Cena 1/ })).toHaveAttribute('aria-selected', 'false');
  });

  it('with the main map on screen, the tab of a grid takes the room back', async () => {
    const { documents } = stripOverMap(true);
    await act(() => Promise.resolve());
    await userEvent.click(screen.getByRole('tab', { name: /Cena 1/ }));
    expect(documents.getState().activeByCampaign[VHARN.id] ?? null).toBeNull();
    expect(screen.getByRole('tab', { name: /Cena 1/ })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('SceneTabs with documents', () => {
  it('lists documents after the group and grid tabs and switches back without closing its draft', async () => {
    const api = new TableSessionApiFake();
    const table = openVharnTabs(api);
    openTorreTab(api, table);
    const documents = workspaceOfFakes();
    const key = documents
      .getState()
      .open({ campaign: detailOf(VHARN), document: documentFixture() });
    render(<SceneTabs tabs={table.tabs} documents={documents} campaignId={VHARN.id} />);
    await act(() => Promise.resolve());
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Cena 1Grupo', 'Torre', 'Carta']);
    expect(screen.getByRole('tab', { name: 'Carta' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Torre' })).toHaveAttribute('aria-selected', 'false');
    await userEvent.click(screen.getByRole('tab', { name: /Cena 1/ }));
    expect(documents.getState().activeByCampaign[VHARN.id]).toBeNull();
    expect(documents.getState().entries).toHaveLength(1);
    await userEvent.click(screen.getByRole('tab', { name: 'Carta' }));
    expect(documents.getState().activeByCampaign[VHARN.id]).toBe(key);
    await userEvent.click(screen.getByRole('button', { name: 'Fechar documento Carta' }));
    expect(screen.queryByRole('tab', { name: 'Carta' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Cena 1/ })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('SceneTabs with the viewer main sheet', () => {
  it("draws no tab for the viewer's main sheet, but one for any other sheet", async () => {
    // The fake answers every sheet as "Lyra de Vharn": the tabs are told apart by their key.
    const table = openVharnTabs(new TableSessionApiFake());
    const documents = workspaceOfFakes();
    const campaign = detailOf(VHARN);
    const main = documents
      .getState()
      .openSheet({ campaign, sheetId: LYRA_SHEET_ID, sheetName: 'Lyra' });
    documents.getState().openSheet({ campaign, sheetId: GOBLIN_SHEET_ID, sheetName: 'Goblin' });
    render(
      <SceneTabs
        tabs={table.tabs}
        documents={documents}
        campaignId={VHARN.id}
        mainSheetKey={main}
      />,
    );
    await act(() => Promise.resolve());
    const sheetTabs = screen.getAllByRole('tab', { name: /^Ficha · / });
    expect(sheetTabs).toHaveLength(1);
    await userEvent.click(sheetTabs[0] as HTMLElement);
    expect(documents.getState().activeByCampaign[VHARN.id]).not.toBe(main);
  });
});

describe('SceneTabs with sheets and templates', () => {
  it('shows only the name beside the icon; the accessible name keeps the kind', async () => {
    const table = openVharnTabs(new TableSessionApiFake());
    const documents = workspaceOfFakes();
    const campaign = detailOf(VHARN);
    documents.getState().openSheet({ campaign, sheetId: LYRA_SHEET_ID, sheetName: 'Lyra' });
    render(<SceneTabs tabs={table.tabs} documents={documents} campaignId={VHARN.id} />);
    await act(() => Promise.resolve());
    const tab = screen.getByRole('tab', { name: 'Ficha · Lyra de Vharn' });
    expect(tab).toHaveTextContent(/^Lyra de Vharn$/);
    expect(tab).toHaveAttribute('title', 'Ficha · Lyra de Vharn');
  });
});
