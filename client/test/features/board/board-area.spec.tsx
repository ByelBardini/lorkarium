import { cell } from '@lorkarium/game-core';
import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import {
  KAEL_ID,
  LYRA_ID,
  kael,
  lyra,
  vharnBoard,
  vharnState,
} from '../../support/table-session-fixtures';

describe('board area: a group on the board', () => {
  let deps: TestDependencies;

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
      { kind: 'board', state: vharnBoard({ tokens: [lyra(), kael()] }) },
    );
    await act(() => Promise.resolve());
  });

  function renderer() {
    return deps.boardRenderers.latest();
  }

  it('dragging Lyra out of a marquee of Lyra and Kael drops both with one moveTokens', async () => {
    renderer().emit({ kind: 'tokensMarqueed', tokenIds: [LYRA_ID, KAEL_ID], additive: false });
    renderer().emit({
      kind: 'tokenDragged',
      tokenId: LYRA_ID,
      origin: cell(3, 4),
      cell: cell(3, 6),
    });
    expect(renderer().lastView?.ghosts.map(({ tokenId, col, row }) => [tokenId, col, row])).toEqual(
      [
        [LYRA_ID, 3, 6],
        [KAEL_ID, 5, 6],
      ],
    );
    renderer().emit({ kind: 'tokenDropped', tokenId: LYRA_ID, cell: cell(3, 6) });
    await act(() => Promise.resolve());
    expect(deps.boardCommands.sentAs('moveTokens').map(({ fields }) => fields)).toEqual([
      {
        moves: [
          { tokenId: LYRA_ID, col: 3, row: 6 },
          { tokenId: KAEL_ID, col: 5, row: 6 },
        ],
      },
    ]);
  });

  it('dragging a token outside the selection drags it alone', async () => {
    renderer().emit({ kind: 'tokenPicked', tokenId: KAEL_ID, additive: false });
    renderer().emit({
      kind: 'tokenDragged',
      tokenId: LYRA_ID,
      origin: cell(3, 4),
      cell: cell(3, 6),
    });
    renderer().emit({ kind: 'tokenDropped', tokenId: LYRA_ID, cell: cell(3, 6) });
    await act(() => Promise.resolve());
    expect(deps.boardCommands.sentAs('moveToken').map(({ fields }) => fields)).toEqual([
      { tokenId: LYRA_ID, col: 3, row: 6 },
    ]);
    expect(deps.boardCommands.sentAs('moveTokens')).toEqual([]);
  });

  describe('resizing by the handles', () => {
    const WIDE = { col: 5, row: 4, width: 2, height: 1 };

    function resized(): unknown[] {
      return deps.boardCommands.sentAs('resizeTokens').map(({ fields }) => fields);
    }

    function kaelView() {
      return renderer().lastView?.tokens.find(({ id }) => id === KAEL_ID);
    }

    it('a handle dragged shows the new box at once, and released sends the resize', async () => {
      act(() => renderer().emit({ kind: 'tokenResizePreviewed', tokenId: KAEL_ID, box: WIDE }));
      expect(kaelView()).toMatchObject(WIDE);

      await act(async () => renderer().emit({ kind: 'tokenResized', tokenId: KAEL_ID, box: WIDE }));

      expect(resized()).toEqual([{ resizes: [{ tokenId: KAEL_ID, ...WIDE }] }]);
      expect(screen.getByRole('status', { name: 'Status do tabuleiro' })).toHaveTextContent(
        'Kael agora ocupa 2 × 1 casas.',
      );
    });

    it('Esc on the handle (a null preview) puts the token back', () => {
      act(() => renderer().emit({ kind: 'tokenResizePreviewed', tokenId: KAEL_ID, box: WIDE }));
      act(() => renderer().emit({ kind: 'tokenResizePreviewed', tokenId: KAEL_ID, box: null }));

      expect(kaelView()).toMatchObject({ col: 5, row: 4, width: 1, height: 1 });
    });

    it('released on the box it already had, nothing is sent', () => {
      const same = { col: 5, row: 4, width: 1, height: 1 };
      act(() => renderer().emit({ kind: 'tokenResized', tokenId: KAEL_ID, box: same }));

      expect(resized()).toEqual([]);
    });
  });
});
