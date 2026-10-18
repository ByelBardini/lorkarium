import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN, detailOf } from '../../support/campaigns-api-fake';
import { BIA_AT_TABLE, vharnBoard, vharnState } from '../../support/table-session-fixtures';
import { northWall } from '../../support/wall-fixtures';

const DRAG = [
  { x: 9, y: 3 },
  { x: 9, y: 7 },
];

async function openRoom(asPlayer = false): Promise<TestDependencies> {
  const deps = testDependencies();
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
    { kind: 'board', state: vharnBoard({ walls: [northWall()], ...(viewer && { viewer }) }) },
  );
  await act(() => Promise.resolve());
  return deps;
}

describe('play room: the walls tool', () => {
  it('the master presses P: "Paredes (P)" turns on and the style panel opens', async () => {
    await openRoom();

    await userEvent.keyboard('p');

    expect(screen.getByRole('button', { name: 'Paredes (P)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('region', { name: 'Estilo da parede' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Status do tabuleiro' })).toHaveTextContent(
      'Arraste para criar a parede; Shift encaixa na grade.',
    );
  });

  it('a drag with the tool sends createWalls with the kind and shape chosen', async () => {
    const deps = await openRoom();
    await userEvent.keyboard('p');
    await userEvent.click(screen.getByRole('radio', { name: 'Grade' }));

    deps.boardRenderers.latest().emit({ kind: 'sketchFinished', points: DRAG, snap: false });

    await waitFor(() =>
      expect(deps.boardCommands.sentAs('createWalls').map(({ fields }) => fields)).toEqual([
        {
          walls: [
            {
              kind: 'grate',
              shape: 'line',
              x: 9,
              y: 3,
              width: 0,
              height: 4,
              points: [
                [0, 0],
                [0, 4],
              ],
            },
          ],
        },
      ]),
    );
  });

  it('a player has no "Paredes" button, and P does nothing', async () => {
    await openRoom(true);

    await userEvent.keyboard('p');

    expect(screen.queryByRole('button', { name: 'Paredes (P)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Estilo da parede' })).not.toBeInTheDocument();
  });
});

describe('play room: editing walls', () => {
  it('with "Apagar área", a box dragged over the middle of the north wall sends eraseWallArea', async () => {
    const deps = await openRoom();
    await userEvent.keyboard('p');
    await userEvent.click(screen.getByRole('radio', { name: 'Apagar área' }));

    deps.boardRenderers.latest().emit({
      kind: 'sketchFinished',
      points: [
        { x: 3, y: 1 },
        { x: 4.2, y: 2.5 },
        { x: 5, y: 3 },
      ],
      snap: false,
    });

    await waitFor(() =>
      expect(deps.boardCommands.sentAs('eraseWallArea')[0]?.fields).toEqual({
        box: { x: 3, y: 1, width: 2, height: 2 },
      }),
    );
    expect(deps.boardCommands.sentAs('createWalls')).toEqual([]);
  });

  it('with "Apagar trecho", a click on a side of the box sends eraseWallSegment for that side', async () => {
    const deps = await openRoom();
    await userEvent.keyboard('p');
    await userEvent.click(screen.getByRole('radio', { name: 'Apagar trecho' }));

    deps.boardRenderers
      .latest()
      .emit({ kind: 'wallErased', wallId: northWall().id, segmentIndex: 0 });

    await waitFor(() =>
      expect(deps.boardCommands.sentAs('eraseWallSegment')[0]?.fields).toEqual({
        wallId: northWall().id,
        segmentIndex: 0,
        expect: { x: 2, y: 2 },
      }),
    );
  });

  it('the board knows the action: Apagar parede reaches the view', async () => {
    const deps = await openRoom();
    await userEvent.keyboard('p');

    await userEvent.click(screen.getByRole('radio', { name: 'Apagar parede' }));

    expect(deps.boardRenderers.latest().lastView?.wallMode).toBe('eraseWall');
  });
});
