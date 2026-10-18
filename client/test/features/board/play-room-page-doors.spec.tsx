import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN, detailOf } from '../../support/campaigns-api-fake';
import { BIA_AT_TABLE, lyra, vharnBoard, vharnState } from '../../support/table-session-fixtures';
import { CELL_DOOR_ID, cellDoor } from '../../support/wall-fixtures';

async function openRoom(asPlayer: boolean, doorState: 'closed' | 'open' = 'closed') {
  const deps: TestDependencies = testDependencies();
  deps.authApi.answerMeWith(ANA);
  if (asPlayer) {
    deps.campaignsApi.answer('detail', {
      ok: true,
      value: detailOf({ ...VHARN, myRole: 'player' }),
    });
  }
  const router = createMemoryRouter(buildRoutes(deps), {
    initialEntries: [`/campaigns/${VHARN.id}/table`],
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { level: 1 });
  const viewer = asPlayer ? { userId: BIA_AT_TABLE.userId, role: 'player' as const } : undefined;
  deps.tableSessionApi.emit(
    { kind: 'state', state: vharnState() },
    { kind: 'status', status: 'live' },
    {
      kind: 'board',
      state: vharnBoard({
        tokens: [lyra({ col: 6, row: 5 })],
        walls: [cellDoor({ doorState })],
        ...(viewer && { viewer }),
      }),
    },
  );
  await act(() => Promise.resolve());
  return deps;
}

describe('play room: doors', () => {
  it('Bia clicking the icon of the door sends setDoor open', async () => {
    const deps = await openRoom(true);

    deps.boardRenderers.latest().emit({ kind: 'doorPressed', wallId: CELL_DOOR_ID });

    await waitFor(() =>
      expect(deps.boardCommands.sentAs('setDoor')[0]?.fields).toEqual({
        wallId: CELL_DOOR_ID,
        state: 'open',
      }),
    );
  });

  it('the right click of Ana on an open door offers "Fechar" and "Trancar", and Trancar sends locked', async () => {
    const deps = await openRoom(false, 'open');

    deps.boardRenderers
      .latest()
      .emit({ kind: 'doorMenuRequested', wallId: CELL_DOOR_ID, x: 200, y: 200 });

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Fechar' })).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Trancar' }));
    await waitFor(() =>
      expect(deps.boardCommands.sentAs('setDoor')[0]?.fields).toEqual({
        wallId: CELL_DOOR_ID,
        state: 'locked',
      }),
    );
  });

  it('a player gets no door menu', async () => {
    const deps = await openRoom(true);

    deps.boardRenderers
      .latest()
      .emit({ kind: 'doorMenuRequested', wallId: CELL_DOOR_ID, x: 200, y: 200 });
    await act(() => Promise.resolve());

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('the player sees the icon of the door beside Lyra on the board', async () => {
    const deps = await openRoom(true);

    expect(deps.boardRenderers.latest().lastView?.doors.map(({ wallId }) => wallId)).toEqual([
      CELL_DOOR_ID,
    ]);
    expect(deps.boardRenderers.latest().lastView?.walls).toEqual([]);
  });
});
