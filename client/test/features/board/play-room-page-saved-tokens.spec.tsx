import { cell } from '@lorkarium/game-core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { zombieSaved } from '../../support/saved-token-fixtures';
import { LYRA_ID, lyra, vharnBoard, vharnState } from '../../support/table-session-fixtures';
import { emulateViewport } from '../../support/viewport';

async function openRoom(): Promise<TestDependencies> {
  const deps = testDependencies();
  deps.authApi.answerMeWith(ANA);
  deps.savedTokens.savedTokens = [zombieSaved()];
  const router = createMemoryRouter(buildRoutes(deps), {
    initialEntries: [`/campaigns/${VHARN.id}/table`],
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { level: 1 });
  deps.tableSessionApi.emit(
    { kind: 'state', state: vharnState() },
    { kind: 'status', status: 'live' },
    { kind: 'board', state: vharnBoard({ tokens: [lyra()] }) },
  );
  await act(() => Promise.resolve());
  return deps;
}

async function openSavedTokens(): Promise<void> {
  const rail = screen.getByRole('tablist', { name: 'Painel da mesa' });
  await userEvent.click(within(rail).getByRole('tab', { name: 'Tokens salvos' }));
}

describe('PlayRoomPage, the saved tokens', () => {
  emulateViewport('desktop');

  it('arming the Zumbi draws its ghost, and a press on the board spawns it there', async () => {
    const deps = await openRoom();
    await openSavedTokens();

    await userEvent.click(await screen.findByRole('button', { name: 'Pôr Zumbi no mapa' }));
    const renderer = deps.boardRenderers.latest();
    await waitFor(() =>
      expect(renderer.lastView?.spawnGhost?.token).toMatchObject({ initials: 'ZB', width: 1 }),
    );
    act(() => renderer.emit({ kind: 'spawnPointPicked', cell: cell(6, 2) }));

    await waitFor(() => expect(deps.boardCommands.sentAs('createTokens')).toHaveLength(1));
    expect(deps.boardCommands.sentAs('createTokens')[0]?.fields).toMatchObject({
      tokens: [{ name: 'Zumbi', col: 6, row: 2 }],
    });
  });

  it('Esc disarms: the ghost goes away', async () => {
    const deps = await openRoom();
    await openSavedTokens();
    await userEvent.click(await screen.findByRole('button', { name: 'Pôr Zumbi no mapa' }));

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(deps.boardRenderers.latest().lastView?.spawnGhost).toBeNull());
  });

  it('"Salvar na minha lista…" on Lyra saves her into the list of the tab', async () => {
    const deps = await openRoom();
    const renderer = deps.boardRenderers.latest();
    act(() => renderer.emit({ kind: 'tokenMenuRequested', tokenId: LYRA_ID, x: 200, y: 120 }));
    const menu = await screen.findByRole('menu', { name: 'Ações de Lyra' });

    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Salvar na minha lista…' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Salvar' }),
    );

    await waitFor(() => expect(deps.savedTokens.calls).toContain('create:Lyra'));
    await openSavedTokens();
    expect(await screen.findByRole('button', { name: 'Pôr Lyra no mapa' })).toBeInTheDocument();
  });
});
