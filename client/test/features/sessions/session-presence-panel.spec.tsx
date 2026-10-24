import type { SessionMemberDto } from '@lorkarium/contracts';
import { act, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { SessionPresencePanel } from '@/features/sessions/session-presence-panel';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createTablePresenceStore, type TablePresenceStore } from '@/stores/table-presence-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { InteractionClockFake } from '../../support/interaction-clock-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  biaLeft,
  kael,
  lyra,
  vharnBoard,
  vharnState,
  VHARN_GRID,
} from '../../support/table-session-fixtures';

const BIA_ONLINE: SessionMemberDto = { ...BIA_AT_TABLE, online: true };
const EVERYONE = [ANA_AT_TABLE, BIA_ONLINE, CAIO_AT_TABLE];

describe('SessionPresencePanel', () => {
  let presence: StoreApi<TablePresenceStore>;
  let board: StoreApi<BoardStore>;
  let cast: StoreApi<BoardStore>;
  let interaction: StoreApi<BoardInteractionStore>;

  beforeEach(() => {
    presence = createTablePresenceStore(VHARN.id);
    board = createBoardStore(VHARN.id, () => undefined);
    cast = createBoardStore(VHARN.id, () => undefined);
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands: new TableBoardCommandsFake(),
      describeRefusal: String,
    });
  });

  function renderPanel(members: SessionMemberDto[] = EVERYONE, withBoard = true): void {
    act(() => {
      presence.getState().apply({ kind: 'state', state: vharnState({ members }) });
      presence.getState().apply({ kind: 'status', status: 'live' });
      if (!withBoard) return;
      const tokens = [lyra(), kael({ controllerIds: [CAIO_AT_TABLE.userId] })];
      board.getState().apply({ kind: 'board', state: vharnBoard({ tokens }) });
    });
    render(
      <SessionPresencePanel
        store={presence}
        board={board}
        cast={cast}
        interaction={interaction}
        isMaster={true}
        clock={new InteractionClockFake()}
      />,
    );
  }

  const section = (name: string | RegExp) => screen.getByRole('region', { name });
  const cardTitles = () =>
    within(section(/^Jogadores/))
      .getAllByRole('article')
      .map((card) => card.getAttribute('aria-labelledby'))
      .map((id) => (id ? document.getElementById(id)?.textContent : null));

  it('Ana goes to "Mestre" with the seal, Bia and Caio to "Jogadores · 2 online" as cards', () => {
    renderPanel();

    const masters = section('Mestre');
    expect(within(masters).getByText('Ana')).toBeInTheDocument();
    expect(within(masters).getByText('Mestre', { selector: '[data-seal]' })).toBeInTheDocument();
    expect(section('Jogadores · 2 online')).toBeInTheDocument();
    expect(cardTitles()).toEqual(['Lyra', 'Kael']);
  });

  it('two masters read "Mestres"', () => {
    renderPanel([ANA_AT_TABLE, BIA_ONLINE, { ...CAIO_AT_TABLE, role: 'master' }]);

    expect(within(section('Mestres')).getByText('Caio')).toBeInTheDocument();
  });

  it('a player leaving goes to the end, dimmed, and the title counts one less online', () => {
    renderPanel([ANA_AT_TABLE, BIA_ONLINE, CAIO_AT_TABLE]);

    act(() => presence.getState().apply({ kind: 'memberLeft', event: biaLeft() }));

    expect(section('Jogadores · 1 online')).toBeInTheDocument();
    expect(cardTitles()).toEqual(['Kael', 'Lyra']);
  });

  it('a table without players says so', () => {
    renderPanel([ANA_AT_TABLE]);

    expect(section('Jogadores · 0 online')).toHaveTextContent('Nenhum jogador nesta mesa ainda.');
  });

  it('while the board loads, the sections show the presence only (no portrait, bars or fields)', () => {
    renderPanel(EVERYONE, false);

    expect(within(section(/^Jogadores/)).getByText('Bia')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('meter')).toBeNull();
  });

  it('a not_found failure shows the alert in place of the sections', () => {
    act(() => presence.getState().apply({ kind: 'failed', failure: 'not_found' }));
    render(
      <SessionPresencePanel
        store={presence}
        board={board}
        cast={cast}
        interaction={interaction}
        isMaster
        clock={new InteractionClockFake()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Essa mesa não existe ou você não participa dela.',
    );
    expect(screen.queryByRole('region', { name: /^Jogadores/ })).toBeNull();
  });

  it('reads "Conectando à mesa…" until the snapshot', () => {
    render(
      <SessionPresencePanel
        store={presence}
        board={board}
        cast={cast}
        interaction={interaction}
        isMaster
        clock={new InteractionClockFake()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Conectando à mesa…');
  });

  it('once live the status line says nothing', () => {
    renderPanel();

    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(screen.queryByText('Ao vivo')).toBeNull();
  });
});
