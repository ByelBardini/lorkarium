import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { pingColorOf } from '@/lib/ping-color';
import type { OpenTable } from '@/stores/open-tables-store';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { TORRE_SCENE, torreBoard } from '../../support/scene-tab-fixtures';
import {
  BIA_AT_TABLE,
  VHARN_GRID,
  boardPinged,
  vharnBoard,
  vharnState,
} from '../../support/table-session-fixtures';

const STRANGER_ID = 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b';

describe('play room: pings', () => {
  let deps: TestDependencies;
  let table: OpenTable;

  beforeEach(async () => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
    const router = createMemoryRouter(buildRoutes(deps), {
      initialEntries: [`/campaigns/${VHARN.id}/table`],
    });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { level: 1 });
    deps.tableSessionApi.emit(
      { kind: 'state', state: vharnState() },
      { kind: 'status', status: 'live' },
      { kind: 'board', state: vharnBoard() },
    );
    await act(() => Promise.resolve());
    const [open] = deps.openTables.getState().tables;
    if (!open) throw new Error('VHARN did not open');
    table = open;
  });

  function statusLine(): HTMLElement {
    return screen.getByRole('status', { name: 'Status do tabuleiro' });
  }

  it('pinging shows it at once with my name and color, and sends board:ping on the grid of the tab', async () => {
    deps.boardRenderers.latest().emit({ kind: 'pingRequested', x: 5.5, y: 2.2 });
    await act(() => Promise.resolve());

    const mine = { x: 5.5, y: 2.2, label: 'Ana', color: pingColorOf(ANA.id) };
    expect(deps.boardRenderers.latest().pings).toEqual([mine]);
    expect(deps.pings.sent).toEqual([{ scope: VHARN_GRID, point: { x: 5.5, y: 2.2 } }]);
  });

  it("Bia's ping shows with her name and color, and the status line announces it", () => {
    act(() => deps.tableSessionApi.emit({ kind: 'pinged', event: boardPinged() }));

    const bias = { x: 5.5, y: 2.2, label: 'Bia', color: pingColorOf(BIA_AT_TABLE.userId) };
    expect(deps.boardRenderers.latest().pings).toEqual([bias]);
    expect(statusLine()).toHaveTextContent('Bia marcou um ponto (coluna 6, linha 3).');
  });

  it('a ping of someone not in the roster says "Alguém"', () => {
    act(() =>
      deps.tableSessionApi.emit({ kind: 'pinged', event: boardPinged({ userId: STRANGER_ID }) }),
    );

    expect(deps.boardRenderers.latest().pings.map(({ label }) => label)).toEqual(['Alguém']);
    expect(statusLine()).toHaveTextContent('Alguém marcou um ponto (coluna 6, linha 3).');
  });

  it('a ping of a grid open in another tab does not reach the tab shown', async () => {
    act(() => table.tabs.getState().open(TORRE_SCENE.id));
    deps.tableSessionApi.emitToGrid(TORRE_SCENE.id, { kind: 'board', state: torreBoard() });
    act(() => table.tabs.getState().show('group'));
    await act(() => Promise.resolve());

    act(() =>
      deps.tableSessionApi.emitToGrid(TORRE_SCENE.id, {
        kind: 'pinged',
        event: boardPinged({ sceneId: TORRE_SCENE.id }),
      }),
    );

    expect(deps.boardRenderers.latest().pings).toEqual([]);
  });

  it('a refused ping shows no error: the local one was already drawn', async () => {
    deps.pings.answer = { ok: false, failure: 'rate_limited' };

    deps.boardRenderers.latest().emit({ kind: 'pingRequested', x: 1.5, y: 1.5 });
    await act(() => Promise.resolve());

    expect(deps.boardRenderers.latest().pings).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(statusLine()).not.toHaveTextContent('Muitas ações seguidas');
  });
});
