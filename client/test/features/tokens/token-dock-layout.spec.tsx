import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { SceneTokenList } from '@/features/tokens/scene-token-list';
import { TokenDock } from '@/features/tokens/token-dock';
import { tokenDockPrefsKey } from '@/lib/token-dock-prefs';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createCharactersStore } from '@/stores/characters-store';
import { createRoomLayoutStore, type RoomLayoutStore } from '@/stores/room-layout-store';
import { createTablePresenceStore } from '@/stores/table-presence-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { StorageFake } from '../../support/storage-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  LYRA_ID,
  activeCondition,
  lyra,
  vharnBoard,
  VHARN_GRID,
} from '../../support/table-session-fixtures';

// The master's (Ana's) dock at Vharn: what the browser keeps for her there.
const ANA_AT_VHARN = tokenDockPrefsKey(ANA_AT_TABLE.userId, VHARN.id);
const PANEL_HEIGHT = 600;
const NATURAL_DOCK_HEIGHT = 200;
const POISONED = activeCondition({ description: 'Perde 1 PV por rodada.' });

// jsdom lays nothing out: the panel and the dock get fixed sizes for the divider to measure.
function stubLayout(): () => void {
  const proto = HTMLElement.prototype;
  const client = Object.getOwnPropertyDescriptor(proto, 'clientHeight');
  const offset = Object.getOwnPropertyDescriptor(proto, 'offsetHeight');
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => PANEL_HEIGHT });
  Object.defineProperty(proto, 'offsetHeight', {
    configurable: true,
    get: () => NATURAL_DOCK_HEIGHT,
  });
  return () => {
    if (client) Object.defineProperty(proto, 'clientHeight', client);
    if (offset) Object.defineProperty(proto, 'offsetHeight', offset);
  };
}

describe('TokenDock layout', () => {
  let storage: StorageFake;
  let roomLayout: StoreApi<RoomLayoutStore>;
  let board: StoreApi<BoardStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let restoreLayout: () => void;

  beforeEach(() => {
    restoreLayout = stubLayout();
    storage = new StorageFake();
    roomLayout = createRoomLayoutStore(storage);
    board = createBoardStore(VHARN.id, () => undefined);
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands: new TableBoardCommandsFake(),
      describeRefusal: String,
    });
    board.getState().apply({
      kind: 'board',
      state: vharnBoard({ tokens: [lyra({ conditions: [POISONED] })] }),
    });
    interaction.getState().selectMany([LYRA_ID], { additive: false });
  });

  afterEach(() => restoreLayout());

  function renderDock(layout: StoreApi<RoomLayoutStore> = roomLayout) {
    const presence = createTablePresenceStore(VHARN.id);
    presence.setState({ members: [ANA_AT_TABLE, BIA_AT_TABLE] });
    return render(
      <TokenDock
        board={board}
        presence={presence}
        characters={createCharactersStore(VHARN.id, () => undefined)}
        interaction={interaction}
        isMaster
        onEditToken={() => undefined}
        roomLayout={layout}
      />,
    );
  }

  const divider = () => screen.getByRole('separator', { name: 'Altura da ficha do token' });
  const storedPrefs = () => JSON.parse(storage.values.get(ANA_AT_VHARN) ?? 'null') as unknown;

  describe('the divider between the tracker and the dock', () => {
    it('starts at the natural height, bounded by the dock and the tracker minimums', () => {
      renderDock();

      expect(divider()).toHaveAttribute('aria-orientation', 'horizontal');
      expect(divider()).toHaveAttribute('aria-valuenow', String(NATURAL_DOCK_HEIGHT));
      expect(divider()).toHaveAttribute('aria-valuemin', '96');
      expect(divider()).toHaveAttribute('aria-valuemax', String(PANEL_HEIGHT - 120));
      expect(storage.values.has(ANA_AT_VHARN)).toBe(false);
    });

    it('ArrowUp grows the dock a step, ArrowDown shrinks it, and each is remembered', async () => {
      renderDock();

      divider().focus();
      await userEvent.keyboard('{ArrowUp}');
      expect(divider()).toHaveAttribute('aria-valuenow', '224');
      expect(storedPrefs()).toEqual({ height: 224, conditions: 'full' });

      await userEvent.keyboard('{ArrowDown}{ArrowDown}');
      expect(divider()).toHaveAttribute('aria-valuenow', '176');
    });

    it('Home and End take it to the tallest and the lowest, never past them', async () => {
      renderDock();

      divider().focus();
      await userEvent.keyboard('{Home}{ArrowUp}');
      expect(divider()).toHaveAttribute('aria-valuenow', '480');

      await userEvent.keyboard('{End}{ArrowDown}');
      expect(divider()).toHaveAttribute('aria-valuenow', '96');
    });

    it('dragging it up gives the dock what the pointer moved', () => {
      renderDock();

      fireEvent.pointerDown(divider(), { button: 0, pointerId: 1, clientY: 300 });
      fireEvent.pointerMove(divider(), { pointerId: 1, clientY: 250 });
      fireEvent.pointerUp(divider(), { pointerId: 1, clientY: 250 });

      expect(divider()).toHaveAttribute('aria-valuenow', '250');
      expect(divider().parentElement).toHaveStyle({ height: '250px' });
      expect(storedPrefs()).toEqual({ height: 250, conditions: 'full' });
    });

    it('a height left here comes back on the next visit to this table', async () => {
      const first = renderDock();
      divider().focus();
      await userEvent.keyboard('{ArrowUp}');
      first.unmount();

      renderDock(createRoomLayoutStore(storage));

      expect(divider()).toHaveAttribute('aria-valuenow', '224');
    });

    it('another table of the same account starts at the natural height', async () => {
      renderDock();
      divider().focus();
      await userEvent.keyboard('{ArrowUp}');

      const elsewhere = tokenDockPrefsKey(ANA_AT_TABLE.userId, 'another-campaign');
      expect(createRoomLayoutStore(storage).getState().tokenDockPrefsOf(elsewhere).height).toBe(
        null,
      );
    });

    it('a double click brings the natural height back', async () => {
      renderDock();
      divider().focus();
      await userEvent.keyboard('{ArrowUp}');

      await userEvent.dblClick(divider());

      expect(divider()).toHaveAttribute('aria-valuenow', String(NATURAL_DOCK_HEIGHT));
      expect(divider().parentElement).not.toHaveStyle({ height: '224px' });
      expect(storedPrefs()).toEqual({ height: null, conditions: 'full' });
    });

    it('a collapsed dock has no divider', async () => {
      renderDock();

      await userEvent.click(screen.getByRole('button', { name: 'Recolher ficha' }));

      expect(screen.queryByRole('separator')).toBeNull();
    });
  });

  describe('the conditions view', () => {
    const dock = () => screen.getByRole('region', { name: 'Token selecionado' });
    const viewSwitch = () => within(dock()).getByRole('button', { name: 'Condições compactas' });
    const tags = () => within(dock()).getByRole('list', { name: 'Condições ativas de Lyra' });

    it('starts full: mark, name, rounds and ×, the switch not pressed', () => {
      renderDock();

      expect(viewSwitch()).toHaveAttribute('aria-pressed', 'false');
      expect(tags()).toHaveTextContent('Envenenado');
      expect(
        within(tags()).getByRole('button', { name: 'Mais uma rodada de Envenenado' }),
      ).toBeInTheDocument();
    });

    it('compact keeps the mark, the rounds and ×, and remembers it for this table', async () => {
      renderDock();

      await userEvent.click(viewSwitch());

      expect(viewSwitch()).toHaveAttribute('aria-pressed', 'true');
      expect(within(tags()).getByRole('img', { name: 'Envenenado' })).toBeInTheDocument();
      expect(tags()).not.toHaveTextContent('Envenenado');
      expect(tags()).toHaveTextContent('2');
      expect(within(tags()).queryByRole('button', { name: /rodada de Envenenado/ })).toBeNull();
      expect(
        within(tags()).getByRole('button', { name: 'Remover Envenenado' }),
      ).toBeInTheDocument();
      expect(storedPrefs()).toEqual({ height: null, conditions: 'compact' });
    });

    it('in compact, focusing the mark says the name, the rounds and the description', async () => {
      renderDock();
      await userEvent.click(viewSwitch());

      act(() => within(tags()).getByRole('img', { name: 'Envenenado' }).focus());

      const tip = await screen.findByRole('tooltip');
      expect(tip).toHaveTextContent('Envenenado');
      expect(tip).toHaveTextContent('Perde 1 PV por rodada.');
    });

    it('in compact, hovering the mark says the name too', async () => {
      renderDock();
      await userEvent.click(viewSwitch());

      await userEvent.hover(within(tags()).getByRole('img', { name: 'Envenenado' }));

      expect(await screen.findByRole('tooltip')).toHaveTextContent('Envenenado');
    });

    it('× still removes it in compact', async () => {
      const commands = new TableBoardCommandsFake();
      interaction = createBoardInteractionStore({
        scopeOf: () => VHARN_GRID,
        commands,
        describeRefusal: String,
      });
      interaction.getState().selectMany([LYRA_ID], { additive: false });
      renderDock();
      await userEvent.click(viewSwitch());

      await userEvent.click(within(tags()).getByRole('button', { name: 'Remover Envenenado' }));

      expect(commands.sent.map(({ name }) => name)).toContain('removeCondition');
    });

    it('the compact view chosen comes back on the next visit, and full brings the names back', async () => {
      const first = renderDock();
      await userEvent.click(viewSwitch());
      first.unmount();

      renderDock(createRoomLayoutStore(storage));
      expect(viewSwitch()).toHaveAttribute('aria-pressed', 'true');

      await userEvent.click(viewSwitch());
      expect(tags()).toHaveTextContent('Envenenado');
      expect(storedPrefs()).toEqual({ height: null, conditions: 'full' });
    });

    it('the list above keeps the names: compact is only the dock', async () => {
      renderDock();
      const presence = createTablePresenceStore(VHARN.id);
      render(
        <section aria-label="Na cena">
          <SceneTokenList board={board} presence={presence} interaction={interaction} isMaster />
        </section>,
      );

      await userEvent.click(viewSwitch());

      const scene = screen.getByRole('region', { name: 'Na cena' });
      expect(within(scene).getByRole('list', { name: 'Condições de Lyra' })).toHaveTextContent(
        'Envenenado',
      );
    });
  });
});
