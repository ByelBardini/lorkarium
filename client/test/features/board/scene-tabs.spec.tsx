import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SceneTabs } from '@/features/board/scene-tabs';
import { fakeClientWidth } from '../../support/client-width-fake';
import type { OpenTable } from '@/stores/open-tables-store';
import { GROUP_TAB } from '@/stores/scene-tabs-store';
import { detailOf, VHARN } from '../../support/campaigns-api-fake';
import { createDocumentWorkspaceStore } from '@/stores/document-workspace-store';
import { DocumentsApiFake } from '../../support/documents-api-fake';
import { SheetTemplatesApiFake } from '../../support/sheet-templates-api-fake';
import { SheetsApiFake } from '../../support/sheets-api-fake';
import { InteractionClockFake } from '../../support/interaction-clock-fake';
import { documentFixture } from '../../support/documents-fixtures';
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
  // 300px fits two 112px tabs beside the "+N" button, not three.
  let restoreWidth: () => void = () => {};
  beforeEach(() => {
    restoreWidth = fakeClientWidth(() => 300);
  });
  afterEach(() => restoreWidth());

  it('moves what does not fit into "+N", keeping the group and the tab shown, and shows it from there', async () => {
    const api = new TableSessionApiFake();
    const table = openVharnTabs(api);
    openTorreTab(api, table);
    const documents = createDocumentWorkspaceStore({
      api: new DocumentsApiFake(),
      sheetsApi: new SheetsApiFake(),
      sheetTemplatesApi: new SheetTemplatesApiFake(),
      clock: new InteractionClockFake(),
    });
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
  });
});

describe('SceneTabs with documents', () => {
  it('lists documents after the group and grid tabs and switches back without closing its draft', async () => {
    const api = new TableSessionApiFake();
    const table = openVharnTabs(api);
    openTorreTab(api, table);
    const documents = createDocumentWorkspaceStore({
      api: new DocumentsApiFake(),
      sheetsApi: new SheetsApiFake(),
      sheetTemplatesApi: new SheetTemplatesApiFake(),
      clock: new InteractionClockFake(),
    });
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
