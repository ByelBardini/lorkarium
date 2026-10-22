import { act, render, screen } from '@testing-library/react';
import { cell } from '@lorkarium/game-core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import type { BoardIntent } from '@/renderer/board-renderer';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import {
  BIA_AT_TABLE,
  KAEL_ID,
  VHARN_SCENE,
  activeCondition,
  kael,
  lyra,
  tokenDeletedAt,
  vharnBoard,
  vharnState,
} from '../../support/table-session-fixtures';

const KAEL_HOVERED: BoardIntent = {
  kind: 'tokenHovered',
  tokenId: KAEL_ID,
  rect: { x: 320, y: 256, width: 64, height: 64 },
};
const NOTHING_HOVERED: BoardIntent = { kind: 'tokenHovered', tokenId: null, rect: null };

describe('play room: the card of the hovered token', () => {
  let deps: TestDependencies;

  beforeEach(async () => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
    const router = createMemoryRouter(buildRoutes(deps), {
      initialEntries: [`/campaigns/${VHARN.id}/table`],
    });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { level: 1 });
    const poisoned = kael({ conditions: [activeCondition()] });
    deps.tableSessionApi.emit(
      { kind: 'state', state: vharnState() },
      { kind: 'status', status: 'live' },
      { kind: 'board', state: vharnBoard({ tokens: [lyra(), poisoned] }) },
    );
    await act(() => Promise.resolve());
  });

  function hover(intent: BoardIntent = KAEL_HOVERED): void {
    act(() => deps.boardRenderers.latest().emit(intent));
  }

  function wait(ms: number): void {
    act(() => deps.interactionClock.advance(ms));
  }

  function shownCard(): HTMLElement | null {
    return screen.queryByRole('tooltip', { hidden: true });
  }

  it('shows nothing before 300 ms, then the card of Kael', () => {
    hover();
    wait(299);
    expect(shownCard()).toBeNull();
    wait(1);
    expect(shownCard()).toHaveTextContent('Kael');
    expect(shownCard()).toHaveTextContent('Envenenado');
  });

  it('leaving the token closes it at once', () => {
    hover();
    wait(300);
    hover(NOTHING_HOVERED);
    expect(shownCard()).toBeNull();
  });

  it('leaving before the 300 ms never opens it', () => {
    hover();
    wait(200);
    hover(NOTHING_HOVERED);
    wait(500);
    expect(shownCard()).toBeNull();
  });

  it('Kael deleted with the card open closes it', () => {
    hover();
    wait(300);
    act(() => deps.tableSessionApi.emit({ kind: 'boardEvent', event: tokenDeletedAt(5, KAEL_ID) }));
    expect(shownCard()).toBeNull();
  });

  it('a token dragged closes it', () => {
    hover();
    wait(300);
    hover({ kind: 'tokenDragged', tokenId: KAEL_ID, origin: cell(5, 4), cell: cell(6, 4) });
    expect(shownCard()).toBeNull();
  });

  it('the token menu opening closes it', async () => {
    hover();
    wait(300);
    hover({ kind: 'tokenMenuRequested', tokenId: KAEL_ID, x: 330, y: 270 });
    await screen.findByRole('menu', { name: 'Ações de Kael' });
    expect(shownCard()).toBeNull();
  });

  it('a token out of sight in the dark never opens one', () => {
    const unseen = kael({ canControl: false, controllerIds: [], conditions: [activeCondition()] });
    act(() =>
      deps.tableSessionApi.emit({
        kind: 'board',
        state: vharnBoard({
          viewer: { userId: BIA_AT_TABLE.userId, role: 'player' },
          scene: { ...VHARN_SCENE, vision: 'dark' },
          tokens: [lyra(), unseen],
        }),
      }),
    );
    hover();
    wait(300);
    expect(shownCard()).toBeNull();
  });
});
