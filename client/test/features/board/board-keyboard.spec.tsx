import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { northWall } from '../../support/wall-fixtures';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN, detailOf } from '../../support/campaigns-api-fake';
import {
  LYRA_ID,
  lyra,
  tokenMovedAt,
  vharnBoard,
  vharnState,
  BIA_AT_TABLE,
  VHARN_SCENE,
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

  function marquee(...tokenIds: string[]): void {
    deps.boardRenderers.latest().emit({ kind: 'tokensMarqueed', tokenIds, additive: false });
  }

  it('with Lyra and Kael selected an arrow moves both one cell, as one group command', async () => {
    marquee(LYRA_ID, KAEL_ID);
    await userEvent.keyboard('{ArrowRight}');
    expect(deps.boardCommands.sentAs('moveTokens')).toEqual([
      {
        name: 'moveTokens',
        campaignId: VHARN.id,
        fields: {
          moves: [
            { tokenId: LYRA_ID, col: 4, row: 4 },
            { tokenId: KAEL_ID, col: 8, row: 5 },
          ],
        },
      },
    ]);
    expect(deps.boardCommands.sentAs('moveToken')).toEqual([]);
  });

  it('a group with one token on the edge says "Fora da cena." and sends nothing', async () => {
    deps.tableSessionApi.emit({
      kind: 'boardEvent',
      event: tokenMovedAt(5, { tokenId: KAEL_ID, col: 19, row: 5 }),
    });
    marquee(LYRA_ID, KAEL_ID);
    await userEvent.keyboard('{ArrowRight}');
    expect(status()).toHaveTextContent('Fora da cena.');
    expect(deps.boardCommands.sent).toEqual([]);
  });

  it('] after a group goes back to a selection of one', async () => {
    marquee(LYRA_ID, KAEL_ID);
    await userEvent.keyboard(']');
    const view = deps.boardRenderers.latest().lastView;
    expect(view?.tokens.filter((token) => token.selected)).toHaveLength(1);
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

  describe('turning', () => {
    function faced(): unknown[] {
      return deps.boardCommands.sentAs('faceTokens').map(({ fields }) => fields);
    }

    it('E on Kael sends one turn to 45 and says "Kael olha para o sudeste." once confirmed', async () => {
      await userEvent.keyboard(']]');
      await userEvent.keyboard('e');
      await act(() => Promise.resolve());

      expect(faced()).toEqual([{ faces: [{ tokenId: KAEL_ID, facing: 45 }] }]);
      expect(status()).toHaveTextContent('Kael olha para o sudeste.');
    });

    it('Q on Kael looking right turns him to 315, the northeast', async () => {
      await userEvent.keyboard(']]');
      await userEvent.keyboard('q');
      await act(() => Promise.resolve());

      expect(faced()).toEqual([{ faces: [{ tokenId: KAEL_ID, facing: 315 }] }]);
      expect(status()).toHaveTextContent('Kael olha para o nordeste.');
    });

    it('two selected and E turn both 45° in one command', async () => {
      marquee(LYRA_ID, KAEL_ID);
      await userEvent.keyboard('e');

      expect(faced()).toEqual([
        {
          faces: [
            { tokenId: KAEL_ID, facing: 45 },
            { tokenId: LYRA_ID, facing: 45 },
          ],
        },
      ]);
    });

    it('E on a token the viewer cannot control says so and sends nothing', async () => {
      await userEvent.keyboard('[[');
      await userEvent.keyboard('e');

      expect(status()).toHaveTextContent('Esse token não é seu.');
      expect(faced()).toEqual([]);
    });

    it('the handle dragged shows the new facing at once, and released sends the turn', async () => {
      await userEvent.keyboard(']]');
      const renderer = deps.boardRenderers.latest();

      act(() => renderer.emit({ kind: 'tokenFacingPreviewed', tokenId: KAEL_ID, facing: 90 }));
      const kael = renderer.lastView?.tokens.find(({ id }) => id === KAEL_ID);
      await act(async () => renderer.emit({ kind: 'tokenFaced', tokenId: KAEL_ID, facing: 90 }));

      expect(kael?.facing).toBe(90);
      expect(faced()).toEqual([{ faces: [{ tokenId: KAEL_ID, facing: 90 }] }]);
      expect(status()).toHaveTextContent('Kael olha para o sul.');
    });

    it('a refused turn puts the facing back and says why', async () => {
      deps.boardCommands.answerWith({ ok: false, failure: 'forbidden' });
      await userEvent.keyboard(']]');
      const renderer = deps.boardRenderers.latest();

      await act(async () => renderer.emit({ kind: 'tokenFaced', tokenId: KAEL_ID, facing: 90 }));

      expect(renderer.lastView?.tokens.find(({ id }) => id === KAEL_ID)?.facing).toBe(0);
      expect(status()).toHaveTextContent('Esse token não é seu.');
    });

    it('the handle released where the token already looks sends nothing', async () => {
      await userEvent.keyboard(']]');

      act(() =>
        deps.boardRenderers.latest().emit({ kind: 'tokenFaced', tokenId: KAEL_ID, facing: 0 }),
      );

      expect(faced()).toEqual([]);
    });
  });
});

describe('board keyboard through the sight of Bia', () => {
  it('] skips Kael and the goblin in the penumbra: the first pick is her Lyra', async () => {
    const deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
    deps.campaignsApi.answer('detail', {
      ok: true,
      value: detailOf({ ...VHARN, myRole: 'player' }),
    });
    const router = createMemoryRouter(buildRoutes(deps), {
      initialEntries: [`/campaigns/${VHARN.id}/table`],
    });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { level: 1 });
    const others = { canControl: false, controllerIds: [] };
    deps.tableSessionApi.emit(
      { kind: 'state', state: vharnState() },
      { kind: 'status', status: 'live' },
      {
        kind: 'board',
        state: vharnBoard({
          viewer: { userId: BIA_AT_TABLE.userId, role: 'player' },
          scene: { ...VHARN_SCENE, vision: 'dark' },
          tokens: [
            lyra({ ...others, id: KAEL_ID, name: 'Kael', col: 0, row: 0 }),
            lyra({ sight: { bright: 3, dim: 3 } }),
            lyra({ ...others, id: GOBLIN_ID, name: 'Goblin', col: 8, row: 4 }),
          ],
        }),
      },
    );
    await act(() => Promise.resolve());
    screen.getByRole('application').focus();

    await userEvent.keyboard(']');

    const picked = deps.boardRenderers.latest().lastView?.tokens.filter(({ selected }) => selected);
    expect(picked?.map(({ id }) => id)).toEqual([LYRA_ID]);
  });
});

describe('board keyboard against a wall', () => {
  async function openAs(role: 'master' | 'player') {
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
    // Lyra at (3, 4); a wall down x = 4 right beside her.
    const beside = northWall({
      x: 4,
      y: 0,
      width: 0,
      height: 12,
      points: [
        [0, 0],
        [0, 12],
      ],
    } as never);
    const viewer = role === 'player' ? { userId: BIA_AT_TABLE.userId, role } : undefined;
    deps.tableSessionApi.emit(
      { kind: 'state', state: vharnState() },
      { kind: 'status', status: 'live' },
      {
        kind: 'board',
        state: vharnBoard({ tokens: [lyra()], walls: [beside], ...(viewer && { viewer }) }),
      },
    );
    await act(() => Promise.resolve());
    screen.getByRole('application').focus();
    await userEvent.keyboard(']');
    return deps;
  }

  it('Bia pressing → into the wall hears that it blocks the way and nothing is sent', async () => {
    const deps = await openAs('player');

    await userEvent.keyboard('{ArrowRight}');

    expect(deps.boardCommands.sentAs('moveToken')).toEqual([]);
    expect(screen.getByRole('status', { name: 'Status do tabuleiro' })).toHaveTextContent(
      'Uma parede bloqueia o caminho.',
    );
  });

  it('Ana, the master, steps through the wall', async () => {
    const deps = await openAs('master');

    await userEvent.keyboard('{ArrowRight}');

    expect(deps.boardCommands.sentAs('moveToken')[0]?.fields).toMatchObject({ col: 4, row: 4 });
  });
});
