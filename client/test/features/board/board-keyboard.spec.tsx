import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import {
  LYRA_ID,
  lyra,
  tokenMovedAt,
  vharnBoard,
  vharnState,
} from '../../support/table-session-fixtures';

const KAEL_ID = '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b';
const GOBLIN_ID = '7f6e5d4c-3b2a-4f1e-8d9c-0b1a2c3d4e5f';

describe('board keyboard', () => {
  let deps: TestDependencies;

  beforeEach(async () => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
    const router = createMemoryRouter(buildRoutes(deps), {
      initialEntries: [`/campaigns/${VHARN.id}/table`],
    });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { level: 1 });
    const kael = lyra({ id: KAEL_ID, name: 'Kael', initials: 'KA', col: 7, row: 5 });
    const goblin = lyra({ id: GOBLIN_ID, name: 'Goblin', col: 2, row: 9, canControl: false });
    deps.tableSessionApi.emit(
      { kind: 'state', state: vharnState() },
      { kind: 'status', status: 'live' },
      { kind: 'board', state: vharnBoard({ tokens: [kael, lyra(), goblin] }) },
    );
    await act(() => Promise.resolve());
    board().focus();
  });

  function board(): HTMLElement {
    return screen.getByRole('application');
  }

  function status(): HTMLElement {
    return screen.getByRole('status', { name: 'Status do tabuleiro' });
  }

  function selected(): string | undefined {
    return deps.boardRenderers.latest().lastView?.tokens.find((token) => token.selected)?.id;
  }

  it('] selects the tokens in reading order and says who and where', async () => {
    await userEvent.keyboard(']');
    expect(selected()).toBe(LYRA_ID);
    expect(status()).toHaveTextContent('Lyra selecionado, coluna 4, linha 5');
    await userEvent.keyboard(']');
    expect(selected()).toBe(KAEL_ID);
    expect(status()).toHaveTextContent('Kael selecionado, coluna 8, linha 6');
  });

  it('[ from nothing selects the last token in reading order', async () => {
    await userEvent.keyboard('[[');
    expect(selected()).toBe(GOBLIN_ID);
  });

  it('an arrow moves the selected token one cell, as a command, and says where once confirmed', async () => {
    await userEvent.keyboard(']]');
    await userEvent.keyboard('{ArrowRight}');
    expect(deps.boardCommands.sentAs('moveToken')).toEqual([
      { name: 'moveToken', campaignId: VHARN.id, fields: { tokenId: KAEL_ID, col: 8, row: 5 } },
    ]);
    deps.tableSessionApi.emit({
      kind: 'boardEvent',
      event: tokenMovedAt(5, { tokenId: KAEL_ID, col: 8, row: 5 }),
    });
    await act(() => Promise.resolve());
    expect(status()).toHaveTextContent('Kael foi para a coluna 9, linha 6');
  });

  it('an arrow on a token the viewer cannot control says so and sends nothing', async () => {
    await userEvent.keyboard('[[');
    await userEvent.keyboard('{ArrowUp}');
    expect(status()).toHaveTextContent('Esse token não é seu.');
    expect(deps.boardCommands.sent).toEqual([]);
  });

  it('a refused arrow move says why', async () => {
    deps.boardCommands.answerWith({ ok: false, failure: 'out_of_scene' });
    await userEvent.keyboard(']');
    await userEvent.keyboard('{ArrowDown}');
    await act(() => Promise.resolve());
    expect(status()).toHaveTextContent('Fora da cena.');
  });

  it('Esc clears the selection', async () => {
    await userEvent.keyboard(']');
    await userEvent.keyboard('{Escape}');
    expect(selected()).toBeUndefined();
  });

  it('Enter on the selected token opens the "Combate" tab', async () => {
    deps.roomLayout.getState().showTab('people');
    await userEvent.keyboard(']{Enter}');
    expect(screen.getByRole('tab', { name: 'Combate' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Tab leaves the board: there is no focus trap', async () => {
    await userEvent.tab();
    expect(board()).not.toHaveFocus();
  });
});
