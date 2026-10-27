import type { TokenDto } from '@lorkarium/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN, detailOf } from '../../support/campaigns-api-fake';
import { SQUARE_ID, square } from '../../support/drawing-fixtures';
import {
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  lyra,
  vharnBoard,
  vharnState,
} from '../../support/table-session-fixtures';

const GOBLIN = lyra({ id: 'goblin-token', name: 'Goblin', canControl: false });
const BIAS_WOLF = lyra({ id: 'wolf-token', name: 'Lobo', createdBy: BIA_AT_TABLE.userId });
const CAIOS_HAWK = lyra({ id: 'hawk-token', name: 'Falcão', createdBy: CAIO_AT_TABLE.userId });

async function openRoom(
  role: 'master' | 'player',
  tokens: readonly TokenDto[] = [GOBLIN],
  playersDeleteTokens = false,
): Promise<TestDependencies> {
  const deps = testDependencies();
  deps.authApi.answerMeWith(ANA);
  if (role === 'player') {
    deps.campaignsApi.answer('detail', {
      ok: true,
      value: detailOf({ ...VHARN, myRole: 'player', playersDeleteTokens }),
    });
  }
  const router = createMemoryRouter(buildRoutes(deps), {
    initialEntries: [`/campaigns/${VHARN.id}/table`],
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { level: 1 });
  const viewer = role === 'player' ? { userId: BIA_AT_TABLE.userId, role } : undefined;
  // The square is Bia's: the player deletes it, the master deletes anything.
  const drawing = square();
  deps.tableSessionApi.emit(
    { kind: 'state', state: vharnState() },
    { kind: 'status', status: 'live' },
    {
      kind: 'board',
      state: vharnBoard({ tokens: [...tokens], drawings: [drawing], ...(viewer && { viewer }) }),
    },
  );
  await act(() => Promise.resolve());
  return deps;
}

async function deleteKey(deps: TestDependencies, tokenIds: readonly string[], withSquare = true) {
  const renderer = deps.boardRenderers.latest();
  act(() => renderer.emit({ kind: 'tokensMarqueed', tokenIds, additive: false }));
  if (withSquare) {
    act(() => renderer.emit({ kind: 'drawingPicked', drawingId: SQUARE_ID, additive: true }));
  }
  screen.getByRole('application').focus();
  await userEvent.keyboard('{Delete}');
}

describe('play room: Delete with tokens in the selection', () => {
  it('the master gets "Excluir 1 token e 1 desenho?" and "Isso não tem volta." before anything is sent', async () => {
    const deps = await openRoom('master');

    await deleteKey(deps, ['goblin-token']);

    const dialog = screen.getByRole('alertdialog', { name: 'Excluir 1 token e 1 desenho?' });
    expect(dialog).toHaveTextContent('Isso não tem volta.');
    expect(deps.boardCommands.sent).toEqual([]);
  });

  it('"Excluir" deletes the token, without precondition, and the drawing', async () => {
    const deps = await openRoom('master');
    await deleteKey(deps, ['goblin-token']);

    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(deps.boardCommands.sentAs('deleteTokens').map(({ fields }) => fields)).toEqual([
      { tokenIds: ['goblin-token'] },
    ]);
    expect(deps.boardCommands.sentAs('deleteDrawings')[0]?.fields).toMatchObject({
      drawingIds: [SQUARE_ID],
    });
  });

  it.each(['the Cancelar button', 'Esc'])(
    '%s sends nothing and keeps the selection',
    async (how) => {
      const deps = await openRoom('master');
      await deleteKey(deps, ['goblin-token']);

      if (how === 'Esc') await userEvent.keyboard('{Escape}');
      else await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(deps.boardCommands.sent).toEqual([]);
      const selected = deps.boardRenderers.latest().lastView?.tokens.filter((t) => t.selected);
      expect(selected?.map(({ id }) => id)).toEqual(['goblin-token']);
    },
  );

  it('only a drawing selected is deleted at once, with no dialog', async () => {
    const deps = await openRoom('master');

    await deleteKey(deps, [], true);

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(deps.boardCommands.sentAs('deleteDrawings')).toHaveLength(1);
  });

  it('a player with a token and her own drawing selected deletes only the drawing, with no dialog', async () => {
    const deps = await openRoom('player');

    await deleteKey(deps, ['goblin-token']);

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(deps.boardCommands.sentAs('deleteTokens')).toEqual([]);
    expect(deps.boardCommands.sentAs('deleteDrawings')).toHaveLength(1);
  });

  it('with 65 tokens selected it asks for at most 64, and "Excluir" is disabled', async () => {
    const crowd = Array.from({ length: 65 }, (_, index) =>
      lyra({ id: `token-${index}`, name: `Goblin ${index}` }),
    );
    const deps = await openRoom('master', crowd);

    await deleteKey(
      deps,
      crowd.map(({ id }) => id),
      false,
    );

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Selecione até 64 tokens para excluir.');
    expect(within(dialog).getByRole('button', { name: 'Excluir' })).toBeDisabled();
  });

  it('Ctrl+Z after the deletion brings the drawing back, and never the token', async () => {
    const deps = await openRoom('master');
    await deleteKey(deps, ['goblin-token']);
    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    screen.getByRole('application').focus();

    await userEvent.keyboard('{Control>}z{/Control}');

    expect(deps.boardCommands.sentAs('createDrawings')).toHaveLength(1);
    expect(deps.boardCommands.sentAs('createTokens')).toEqual([]);
  });

  it('a refused deletion (offline) says so on the status line', async () => {
    const deps = await openRoom('master');
    deps.boardCommands.answerWith({ ok: false, failure: 'offline' });
    await deleteKey(deps, ['goblin-token'], false);

    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(screen.getByRole('status', { name: 'Status do tabuleiro' })).toHaveTextContent(
      'Sem conexão com o servidor.',
    );
  });
  describe('a player with the delete key', () => {
    it('Bia’s Delete on her own token asks "Excluir Lobo?" and "Excluir" deletes it', async () => {
      const deps = await openRoom('player', [BIAS_WOLF], true);
      await deleteKey(deps, ['wolf-token'], false);

      screen.getByRole('alertdialog', { name: 'Excluir Lobo?' });
      await userEvent.click(screen.getByRole('button', { name: 'Excluir' }));

      expect(deps.boardCommands.sentAs('deleteTokens').map(({ fields }) => fields)).toEqual([
        { tokenIds: ['wolf-token'] },
      ]);
    });

    it('with Caio’s token in the selection, his stays out and the dialog says how many go', async () => {
      const deps = await openRoom('player', [BIAS_WOLF, CAIOS_HAWK], true);
      await deleteKey(deps, ['wolf-token', 'hawk-token'], false);

      const dialog = screen.getByRole('alertdialog', { name: 'Excluir Lobo?' });
      expect(dialog).toHaveTextContent('1 token que não é seu fica.');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));

      expect(deps.boardCommands.sentAs('deleteTokens').map(({ fields }) => fields)).toEqual([
        { tokenIds: ['wolf-token'] },
      ]);
    });

    it('without the key, Bia’s Delete on her own token asks nothing and sends no token', async () => {
      const deps = await openRoom('player', [BIAS_WOLF], false);

      await deleteKey(deps, ['wolf-token']);

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(deps.boardCommands.sentAs('deleteTokens')).toEqual([]);
    });
  });
});
