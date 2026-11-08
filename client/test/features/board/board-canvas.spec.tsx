import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { BoardCanvas } from '@/features/board/board-canvas';
import { TableSightOutlinesContext } from '@/features/board/table-sight-outlines';
import type { BoardIntent } from '@/renderer/board-renderer';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createEffectAreaStyleStore } from '@/stores/effect-area-style-store';
import { createWallStyleStore } from '@/stores/wall-style-store';
import { createDrawingStyleStore } from '@/stores/drawing-style-store';
import { StorageFake } from '../../support/storage-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { BoardRenderersFake } from '../../support/board-renderer-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import {
  BIA_AT_TABLE,
  LYRA_ID,
  VHARN_SCENE,
  groupDraggedOver,
  lyra,
  sceneUpdated,
  vharnBoard,
  VHARN_GRID,
} from '../../support/table-session-fixtures';

describe('BoardCanvas', () => {
  let renderers: BoardRenderersFake;
  let board: StoreApi<BoardStore>;
  let intents: BoardIntent[];
  let interaction: StoreApi<BoardInteractionStore>;
  let clock: number;

  beforeEach(() => {
    clock = 0;
    renderers = new BoardRenderersFake();
    board = createBoardStore(VHARN.id, () => undefined);
    board.getState().apply({ kind: 'board', state: vharnBoard() });
    intents = [];
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
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
        effectAreaStyle={createEffectAreaStyleStore(new StorageFake())}
        wallStyle={createWallStyleStore(new StorageFake())}
        lossClock={() => clock}
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

  it('the ogre a silhouette for Bia is drawn whole once the master drags Lyra’s torch to him', async () => {
    const OGRE_ID = 'aa11bb22-cc33-4d44-8e55-ff6677889900';
    const torch = { light: { bright: 3, dim: 3, color: null, angle: 360 }, lightLit: true };
    const ogre = lyra({ id: OGRE_ID, name: 'Ogro', col: 8, canControl: false, controllerIds: [] });
    board.getState().apply({
      kind: 'board',
      state: vharnBoard({
        viewer: { userId: BIA_AT_TABLE.userId, role: 'player' },
        scene: { ...VHARN_SCENE, vision: 'dark' },
        tokens: [lyra({ sight: null, ...torch }), ogre],
      }),
    });
    render(canvas());
    await act(() => Promise.resolve());
    const ogreView = () => renderers.latest().lastView?.tokens.find(({ id }) => id === OGRE_ID);
    expect(ogreView()).toMatchObject({ silhouette: 'round', name: '' });

    act(() =>
      board.getState().apply({
        kind: 'tokensDragged',
        drag: groupDraggedOver([{ tokenId: LYRA_ID, cell: { col: 6, row: 4 } }]),
      }),
    );

    expect(ogreView()).toMatchObject({ silhouette: null, name: 'Ogro', pickable: true });
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

  it('the blocker selected by the master is drawn with the outline known in the room', async () => {
    const imageAssetId = '11112222-3333-4444-8555-666677778888';
    const triangle = [
      [
        [0.5, 0],
        [1, 1],
        [0, 1],
      ],
    ] as const;
    const statue = lyra({ blocksSight: true, imageAssetId });
    act(() => board.getState().apply({ kind: 'board', state: vharnBoard({ tokens: [statue] }) }));
    render(
      <TableSightOutlinesContext value={new Map([[imageAssetId, triangle]])}>
        {canvas()}
      </TableSightOutlinesContext>,
    );
    await act(() => Promise.resolve());

    act(() => {
      interaction.getState().select(LYRA_ID);
    });

    expect(renderers.latest().lastView?.sightBlockerOutline?.polygons[0]).toHaveLength(3);
  });

  async function loseAt(seconds: number): Promise<void> {
    clock = seconds * 1000;
    renderers.latest().lose();
    await act(() => Promise.resolve());
  }

  it('a lost context destroys the renderer and mounts a new one at its camera, with the same view', async () => {
    render(canvas());
    await act(() => Promise.resolve());
    const first = renderers.latest();
    first.cameraNow = { offsetX: -320, offsetY: 140, zoom: 2.5 };
    await loseAt(0);
    const second = renderers.latest();
    expect(first.destroyed).toBe(true);
    expect(second).not.toBe(first);
    expect(second.mountedCamera).toEqual({ offsetX: -320, offsetY: 140, zoom: 2.5 });
    expect(second.lastView).toBe(first.lastView);
    expect(renderers.alive).toEqual([second]);
  });

  it('a lost context is not passed on to the room, and the status line says the board came back', async () => {
    render(canvas());
    await act(() => Promise.resolve());
    await loseAt(0);
    expect(intents).toEqual([]);
    expect(interaction.getState().notice).toBe('O tabuleiro foi recarregado.');
  });

  it('three losses within 60 s give up; "Recarregar tabuleiro" mounts a fresh renderer', async () => {
    render(canvas());
    await act(() => Promise.resolve());
    await loseAt(0);
    await loseAt(20);
    await loseAt(40);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Seu navegador não conseguiu abrir o tabuleiro.',
    );
    expect(renderers.alive).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Recarregar tabuleiro' }));
    expect(renderers.made).toHaveLength(4);
    expect(renderers.alive).toEqual([renderers.latest()]);
    expect(renderers.latest().mounted).toBe(true);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('after "Recarregar tabuleiro" the budget starts over: the next loss remounts', async () => {
    render(canvas());
    await act(() => Promise.resolve());
    for (const seconds of [0, 20, 40]) await loseAt(seconds);
    await userEvent.click(screen.getByRole('button', { name: 'Recarregar tabuleiro' }));
    await loseAt(41);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(renderers.alive).toEqual([renderers.latest()]);
  });

  it('unmounting in the middle of a remount leaves no renderer alive', async () => {
    const { unmount } = render(canvas());
    await act(() => Promise.resolve());
    renderers.mountMode = 'hold';
    await loseAt(0);
    const remounting = renderers.latest();
    unmount();
    await remounting.finishMount();
    expect(renderers.alive).toEqual([]);
    expect(remounting.draws).toEqual([]);
  });
});
