import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { RoomRail } from '@/features/board/room-rail';
import { useRoomShortcuts } from '@/features/board/use-room-shortcuts';
import { createBoardInteractionStore } from '@/stores/board-interaction-store';
import { diceTrayStoreOf, type DiceTrayStore } from '@/stores/dice-tray-store';
import { createRoomLayoutStore, type RoomLayoutStore } from '@/stores/room-layout-store';
import {
  createTablePresenceStore,
  selectOnlineCount,
  type TablePresenceStore,
} from '@/stores/table-presence-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { ACERTO } from '../../support/dice-fixtures';
import { StorageFake } from '../../support/storage-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { VHARN_GRID, vharnState } from '../../support/table-session-fixtures';
import { emulateViewport } from '../../support/viewport';

type Rail = Readonly<{
  layout: StoreApi<RoomLayoutStore>;
  presence: StoreApi<TablePresenceStore>;
  diceTray: StoreApi<DiceTrayStore>;
}>;

function RailWithKeys({ layout, presence, diceTray }: Rail): React.JSX.Element {
  const interaction = createBoardInteractionStore({
    scopeOf: () => VHARN_GRID,
    commands: new TableBoardCommandsFake(),
    describeRefusal: String,
  });
  useRoomShortcuts({ roomLayout: layout, interaction, role: 'master' });
  return <RoomRail roomLayout={layout} presence={presence} diceTray={diceTray} />;
}

function renderRail(): Rail {
  const layout = createRoomLayoutStore(new StorageFake());
  const presence = createTablePresenceStore(VHARN.id);
  presence.getState().apply({ kind: 'state', state: vharnState() });
  presence.getState().apply({ kind: 'status', status: 'live' });
  const openTables = createStore(() => ({ tables: [{ campaignId: VHARN.id }] }));
  const diceTray = diceTrayStoreOf(openTables, VHARN.id);
  render(<RailWithKeys layout={layout} presence={presence} diceTray={diceTray} />);
  return { layout, presence, diceTray };
}

const rail = (): HTMLElement => screen.getByRole('tablist', { name: 'Painel da mesa' });
const railTab = (name: string): HTMLElement => within(rail()).getByRole('tab', { name });

describe('RoomRail beside the board', () => {
  emulateViewport('desktop');

  it('has Combate, Na mesa and Dados, each with its tooltip, the open one selected', () => {
    renderRail();
    const names = within(rail())
      .getAllByRole('tab')
      .map((tab) => tab.getAttribute('aria-label'));
    expect(names).toEqual(['Combate', 'Na mesa', 'Dados']);
    expect(railTab('Dados')).toHaveAttribute('title', 'Dados');
    expect(railTab('Combate')).toHaveAttribute('aria-selected', 'true');
    expect(railTab('Combate')).toHaveAttribute('aria-expanded', 'true');
    expect(railTab('Dados')).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking the open tab collapses the panel, and again opens it', async () => {
    const { layout } = renderRail();
    await userEvent.click(railTab('Combate'));
    expect(layout.getState().panel).toBe('closed');
    expect(railTab('Combate')).toHaveAttribute('aria-selected', 'false');
    expect(railTab('Combate')).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(railTab('Combate'));
    expect(layout.getState().panel).toBe('open');
  });

  it('clicking another tab opens the panel on it', async () => {
    const { layout } = renderRail();
    await userEvent.click(railTab('Dados'));
    expect(layout.getState()).toMatchObject({ panel: 'open', tab: 'dice' });
  });

  it('"Na mesa" carries the count of who is online, said to assistive tech', () => {
    const { presence } = renderRail();
    const online = selectOnlineCount(presence.getState());
    expect(railTab('Na mesa')).toHaveTextContent(String(online));
    expect(railTab('Na mesa')).toHaveAccessibleDescription(`${online} online`);
  });

  it('with another tab open, "Dados" shows how many parts the tray holds, said to assistive tech', () => {
    const { diceTray } = renderRail();
    expect(railTab('Dados')).not.toHaveAccessibleDescription(/rolagem/);
    act(() => void diceTray.getState().addSavedRoll(ACERTO));
    expect(railTab('Dados')).toHaveTextContent('1');
    expect(railTab('Dados')).toHaveAccessibleDescription('1 parte na rolagem');
    act(() => void diceTray.getState().addSavedRoll(ACERTO));
    expect(railTab('Dados')).toHaveAccessibleDescription('2 partes na rolagem');
  });

  it('an empty tray puts no badge on "Dados"', () => {
    renderRail();
    expect(railTab('Dados')).toHaveTextContent('');
  });

  it('the backslash key collapses the panel and opens it again', () => {
    const { layout } = renderRail();
    fireEvent.keyDown(document.body, { key: '\\' });
    expect(layout.getState().panel).toBe('closed');
    fireEvent.keyDown(document.body, { key: '\\' });
    expect(layout.getState().panel).toBe('open');
  });
});

describe('RoomRail on a phone', () => {
  emulateViewport('mobile');

  it('draws no rail: the "Painel" sheet stays', () => {
    renderRail();
    expect(screen.queryByRole('tablist', { name: 'Painel da mesa' })).toBeNull();
  });
});
