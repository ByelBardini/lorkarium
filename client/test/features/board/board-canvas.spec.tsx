import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { BoardCanvas } from '@/features/board/board-canvas';
import type { BoardIntent } from '@/renderer/board-renderer';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createDrawingStyleStore } from '@/stores/drawing-style-store';
import { StorageFake } from '../../support/storage-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { BoardRenderersFake } from '../../support/board-renderer-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { LYRA_ID, lyra, sceneUpdated, vharnBoard } from '../../support/table-session-fixtures';

describe('BoardCanvas', () => {
  let renderers: BoardRenderersFake;
  let board: StoreApi<BoardStore>;
  let intents: BoardIntent[];
  let interaction: StoreApi<BoardInteractionStore>;

  beforeEach(() => {
    renderers = new BoardRenderersFake();
    board = createBoardStore(VHARN.id, () => undefined);
    board.getState().apply({ kind: 'board', state: vharnBoard() });
    intents = [];
    interaction = createBoardInteractionStore({
      campaignId: VHARN.id,
      commands: new TableBoardCommandsFake(),
      describeRefusal: String,
    });
  });

  function canvas(): React.JSX.Element {
    return (
      <BoardCanvas
        board={board}
        createBoardRenderer={renderers.create}
        interaction={interaction}
        onIntent={(intent) => intents.push(intent)}
        onRenderer={() => undefined}
        drawingStyle={createDrawingStyleStore(new StorageFake())}
      />
    );
  }

  function host(): HTMLElement {
    return screen.getByRole('application');
  }

  it('mounts a focusable board named after the scene, with keyboard instructions', async () => {
    render(canvas());
    expect(host()).toHaveAttribute('aria-roledescription', 'tabuleiro');
    expect(host()).toHaveAccessibleName('Tabuleiro: Cena 1, 20 × 12 casas');
    expect(host()).toHaveAttribute('tabindex', '0');
    expect(host()).toHaveAccessibleDescription(/W A S D/);
    await act(() => Promise.resolve());
    expect(renderers.latest().mounted).toBe(true);
  });

  it('draws the scene once mounted, and draws again when scene:updated changes it', async () => {
    render(canvas());
    await act(() => Promise.resolve());
    expect(renderers.latest().lastView?.grid.cells).toEqual({ widthCells: 20, heightCells: 12 });
    act(() =>
      board
        .getState()
        .apply({ kind: 'boardEvent', event: { type: 'sceneUpdated', payload: sceneUpdated() } }),
    );
    expect(renderers.latest().lastView?.grid.cells).toEqual({ widthCells: 30, heightCells: 20 });
    expect(host()).toHaveAccessibleName('Tabuleiro: Cena 1, 30 × 20 casas');
  });

  it('passes the intents of the canvas on', async () => {
    render(canvas());
    await act(() => Promise.resolve());
    renderers.latest().emit({ kind: 'cameraChanged', zoom: 1.25 });
    expect(intents).toEqual([{ kind: 'cameraChanged', zoom: 1.25 }]);
  });

  it('under StrictMode (mount, unmount, mount) only one renderer stays alive', async () => {
    render(<StrictMode>{canvas()}</StrictMode>);
    await act(() => Promise.resolve());
    expect(renderers.made.length).toBeGreaterThan(1);
    expect(renderers.alive).toHaveLength(1);
  });

  it('unmounting before the slow mount finishes destroys it and never draws', async () => {
    renderers.mountMode = 'hold';
    const { unmount } = render(canvas());
    const slow = renderers.latest();
    unmount();
    await slow.finishMount();
    expect(slow.destroyed).toBe(true);
    expect(slow.draws).toEqual([]);
  });

  it('a mount that fails (no WebGL) says so in place of the board', async () => {
    renderers.mountMode = 'reject';
    render(canvas());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Seu navegador não conseguiu abrir o tabuleiro.',
    );
  });

  it('draws the tokens of the board, with the selection and the preview of the interaction', async () => {
    act(() => board.getState().apply({ kind: 'board', state: vharnBoard({ tokens: [lyra()] }) }));
    render(canvas());
    await act(() => Promise.resolve());
    act(() => {
      interaction.getState().select(LYRA_ID);
    });
    expect(renderers.latest().lastView?.tokens[0]).toMatchObject({ id: LYRA_ID, selected: true });
    expect(renderers.latest().lastView?.ghosts).toEqual([]);
  });
});
