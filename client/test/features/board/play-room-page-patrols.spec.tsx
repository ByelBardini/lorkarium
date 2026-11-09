import type { TokenDto } from '@lorkarium/contracts';
import { cell } from '@lorkarium/game-core';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN, detailOf } from '../../support/campaigns-api-fake';
import {
  BIA_AT_TABLE,
  KAEL_ID,
  LYRA_ID,
  kael,
  lyra,
  vharnBoard,
  vharnState,
} from '../../support/table-session-fixtures';

async function openRoom(
  role: 'master' | 'player',
  tokens: readonly TokenDto[] = [kael({ col: 4, row: 4 }), lyra()],
): Promise<TestDependencies> {
  const deps = testDependencies();
  deps.authApi.answerMeWith(ANA);
  if (role === 'player') {
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
  const viewer = role === 'player' ? { userId: BIA_AT_TABLE.userId, role } : undefined;
  deps.tableSessionApi.emit(
    { kind: 'state', state: vharnState() },
    { kind: 'status', status: 'live' },
    { kind: 'board', state: vharnBoard({ tokens: [...tokens], ...(viewer && { viewer }) }) },
  );
  await act(() => Promise.resolve());
  return deps;
}

async function openKaelEditor(deps: TestDependencies): Promise<void> {
  const renderer = deps.boardRenderers.latest();
  act(() => renderer.emit({ kind: 'tokenMenuRequested', tokenId: KAEL_ID, x: 200, y: 120 }));
  const menu = await screen.findByRole('menu', { name: 'Ações de Kael' });
  await userEvent.click(within(menu).getByRole('menuitem', { name: 'Patrulha…' }));
}

describe('PlayRoomPage, the patrol editor', () => {
  it('"Patrulha…" on Kael opens his panel and the board draws the draft from his cell', async () => {
    const deps = await openRoom('master');

    await openKaelEditor(deps);

    expect(screen.getByRole('region', { name: 'Patrulha de Kael' })).toBeInTheDocument();
    expect(deps.boardRenderers.latest().lastView?.patrolPath).toMatchObject({
      draft: true,
      points: [{ x: 288, y: 288 }],
    });
  });

  it('two clicks on the map and "Salvar" send the route of three points', async () => {
    const deps = await openRoom('master');
    await openKaelEditor(deps);
    const renderer = deps.boardRenderers.latest();

    act(() => {
      renderer.emit({ kind: 'patrolPointPicked', cell: cell(8, 4) });
      renderer.emit({ kind: 'patrolPointPicked', cell: cell(8, 8) });
    });
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(deps.boardCommands.sentAs('setTokenPatrol')[0]?.fields).toEqual({
      tokenId: KAEL_ID,
      patrol: {
        path: [cell(4, 4), cell(8, 4), cell(8, 8)],
        repeat: 'loop',
        speed: 1,
        turns: true,
        gait: 'glide',
      },
    });
    expect(screen.queryByRole('region', { name: 'Patrulha de Kael' })).not.toBeInTheDocument();
  });

  it('the 33rd click says "Até 32 pontos." on the status line', async () => {
    const deps = await openRoom('master');
    await openKaelEditor(deps);
    const renderer = deps.boardRenderers.latest();

    act(() => {
      for (let index = 1; index <= 32; index += 1) {
        renderer.emit({ kind: 'patrolPointPicked', cell: cell(index % 2 === 0 ? 0 : 1, 0) });
      }
    });

    expect(screen.getByRole('status', { name: 'Status do tabuleiro' })).toHaveTextContent(
      'Até 32 pontos.',
    );
  });

  it('a player who controls Lyra sees no patrol item in her menu', async () => {
    const deps = await openRoom('player', [lyra()]);
    const renderer = deps.boardRenderers.latest();

    act(() => renderer.emit({ kind: 'tokenMenuRequested', tokenId: LYRA_ID, x: 200, y: 120 }));
    const menu = await screen.findByRole('menu', { name: 'Ações de Lyra' });

    expect(within(menu).queryByRole('menuitem', { name: 'Patrulha…' })).toBeNull();
  });
});
