import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { SceneTabs } from '@/features/board/scene-tabs';
import type { OpenTable } from '@/stores/open-tables-store';
import { GROUP_TAB } from '@/stores/scene-tabs-store';
import { VHARN } from '../../support/campaigns-api-fake';
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
