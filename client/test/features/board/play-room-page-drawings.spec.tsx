import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cell } from '@lorkarium/game-core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { PATH_ID, path, SQUARE_ID, square } from '../../support/drawing-fixtures';
import { LYRA_ID, kael, lyra, vharnBoard, vharnState } from '../../support/table-session-fixtures';

const PASTED_ID = 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b';

describe('play room: drawings, copy and undo', () => {
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
      {
        kind: 'board',
        state: vharnBoard({ tokens: [lyra(), kael()], drawings: [square(), path()] }),
      },
    );
    await act(() => Promise.resolve());
  });

  function boardStatus(): HTMLElement {
    return screen.getByRole('status', { name: 'Status do tabuleiro' });
  }

  function renderer() {
    return deps.boardRenderers.latest();
  }

  describe('the draw tool', () => {
    it('B turns on "Desenhar (B)" and opens the style panel', async () => {
      await userEvent.keyboard('b');

      expect(screen.getByRole('button', { name: 'Desenhar (B)' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByRole('region', { name: 'Estilo do desenho' })).toBeInTheDocument();
      expect(renderer().lastView?.sketch).toMatchObject({ kind: 'freehand' });
    });

    it('a sketch released on the board sends one createDrawings in the panel style', async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Desenhar (B)' }));
      await userEvent.click(screen.getByRole('radio', { name: 'Quadrado' }));

      renderer().emit({
        kind: 'sketchFinished',
        points: [
          { x: 1, y: 1 },
          { x: 3, y: 2 },
        ],
        snap: false,
      });

      expect(deps.boardCommands.sentAs('createDrawings').map(({ fields }) => fields)).toEqual([
        {
          drawings: [
            {
              kind: 'rectangle',
              x: 1,
              y: 1,
              width: 2,
              height: 1,
              fill: null,
              stroke: 'gold',
              strokeWidth: 'medium',
            },
          ],
        },
      ]);
    });

    it('the confirmed drawings are drawn on the board', () => {
      expect(renderer().lastView?.drawings.map(({ id }) => id)).toEqual([SQUARE_ID, PATH_ID]);
    });
  });

  describe('selecting, moving and deleting drawings', () => {
    async function pickDrawings(): Promise<void> {
      await userEvent.click(screen.getByRole('button', { name: 'Desenhar (B)' }));
      await userEvent.click(screen.getByRole('radio', { name: 'Selecionar' }));
    }

    it('with Selecionar the drawings are drawn but not pickable, even the master’s', () => {
      expect(renderer().lastView?.drawings.map(({ pickable }) => pickable)).toEqual([false, false]);
    });

    it('Selecionar in the draw panel makes the drawings pickable and the line says how', async () => {
      await pickDrawings();

      expect(renderer().lastView).toMatchObject({ tool: 'draw', drawMode: 'select' });
      expect(renderer().lastView?.drawings.map(({ pickable }) => pickable)).toEqual([true, true]);
      expect(boardStatus()).toHaveTextContent('Clique num desenho ou arraste uma caixa');
    });

    it('Lyra selected before the draw tool does not follow the square dropped', async () => {
      renderer().emit({ kind: 'tokenPicked', tokenId: LYRA_ID, additive: false });
      await pickDrawings();
      renderer().emit({ kind: 'drawingPicked', drawingId: SQUARE_ID, additive: false });

      renderer().emit({
        kind: 'drawingsDropped',
        anchorId: SQUARE_ID,
        drawingIds: [SQUARE_ID],
        dx: 2,
        dy: 1,
      });

      await waitFor(() =>
        expect(deps.boardCommands.sentAs('moveDrawings')[0]?.fields).toEqual({
          moves: [{ drawingId: SQUARE_ID, x: 4.5, y: 4 }],
        }),
      );
      await act(() => Promise.resolve());
      expect(deps.boardCommands.sentAs('moveTokens')).toEqual([]);
    });

    it('Delete on the board deletes the selected drawings in one command', async () => {
      renderer().emit({
        kind: 'drawingsMarqueed',
        drawingIds: [SQUARE_ID, PATH_ID],
        additive: false,
      });
      screen.getByRole('application').focus();

      await userEvent.keyboard('{Delete}');

      expect(deps.boardCommands.sentAs('deleteDrawings')[0]?.fields).toMatchObject({
        drawingIds: [SQUARE_ID, PATH_ID],
      });
    });

    it('Delete with only Lyra selected asks "Excluir Lyra?" before sending anything', async () => {
      renderer().emit({ kind: 'tokenPicked', tokenId: LYRA_ID, additive: false });
      screen.getByRole('application').focus();

      await userEvent.keyboard('{Delete}');

      expect(screen.getByRole('alertdialog', { name: 'Excluir Lyra?' })).toBeInTheDocument();
      expect(deps.boardCommands.sent).toEqual([]);
    });
  });

  describe('copy and paste', () => {
    it('Ctrl+C on Lyra and Ctrl+V with the cursor on (10, 6) pastes her there', async () => {
      deps.boardCommands.answerWith({ ok: true, version: 5, createdIds: [PASTED_ID] });
      renderer().emit({ kind: 'tokenPicked', tokenId: LYRA_ID, additive: false });

      await userEvent.keyboard('{Control>}c{/Control}');
      expect(boardStatus()).toHaveTextContent('1 item copiado.');
      renderer().emit({ kind: 'pointerHovered', cell: cell(10, 6) });
      await userEvent.keyboard('{Control>}v{/Control}');

      expect(deps.boardCommands.sentAs('createTokens')[0]?.fields).toMatchObject({
        tokens: [{ name: 'Lyra', col: 10, row: 6 }],
      });
      const [pasted] = (
        deps.boardCommands.sentAs('createTokens')[0]?.fields as { tokens: object[] }
      ).tokens;
      expect(pasted).not.toHaveProperty('conditions');
    });

    it('Ctrl+V with nothing copied sends nothing', async () => {
      await userEvent.keyboard('{Control>}v{/Control}');

      expect(deps.boardCommands.sent).toEqual([]);
    });

    it('Ctrl+C in a field of a dialog copies the text, not the board', async () => {
      renderer().emit({ kind: 'tokenPicked', tokenId: LYRA_ID, additive: false });
      await userEvent.click(screen.getByRole('button', { name: 'Novo token' }));
      const dialog = await screen.findByRole('dialog', { name: 'Novo token' });
      within(dialog).getByLabelText('Nome').focus();

      await userEvent.keyboard('{Control>}c{/Control}');

      expect(deps.openTables.getState().tables[0]?.edits.getState().copied).toBeNull();
    });
  });

  describe('undo and redo', () => {
    async function moveLyraRight(): Promise<void> {
      renderer().emit({ kind: 'tokenPicked', tokenId: LYRA_ID, additive: false });
      screen.getByRole('application').focus();
      await userEvent.keyboard('{ArrowRight}');
    }

    it('Ctrl+Z after moving Lyra moves her back, expecting her where she went', async () => {
      await moveLyraRight();

      await userEvent.keyboard('{Control>}z{/Control}');

      expect(deps.boardCommands.sentAs('moveTokens').map(({ fields }) => fields)).toEqual([
        { moves: [{ tokenId: LYRA_ID, col: 3, row: 4, expect: { col: 4, row: 4 } }] },
      ]);
    });

    it('Ctrl+Y redoes it', async () => {
      await moveLyraRight();
      await userEvent.keyboard('{Control>}z{/Control}');

      await userEvent.keyboard('{Control>}y{/Control}');

      expect(deps.boardCommands.sentAs('moveTokens')[1]?.fields).toEqual({
        moves: [{ tokenId: LYRA_ID, col: 4, row: 4, expect: { col: 3, row: 4 } }],
      });
    });

    it('an undo after someone else moved Lyra says it cannot be undone', async () => {
      await moveLyraRight();
      deps.boardCommands.answerWith({ ok: false, failure: 'stale_undo' });

      await userEvent.keyboard('{Control>}z{/Control}');

      expect(boardStatus()).toHaveTextContent('Alguém mexeu nisso depois; não dá para desfazer.');
    });
  });
});
