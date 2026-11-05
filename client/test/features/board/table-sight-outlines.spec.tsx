import { act, render, renderHook, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { buildRoutes } from '@/app/router';
import { RoomContexts } from '@/features/board/room-contexts';
import {
  useAssetOutline,
  useRoomSightOutlines,
  useTableSightOutlines,
} from '@/features/board/table-sight-outlines';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createSightOutlineStore } from '@/stores/sight-outline-store';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { AssetOutlineApiFake } from '../../support/asset-outline-api-fake';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { TORRE_SCENE, torreBoard } from '../../support/scene-tab-fixtures';
import {
  kael,
  lyra,
  tokenUpdatedAt,
  vharnBoard,
  vharnState,
} from '../../support/table-session-fixtures';

const STATUE_IMAGE = '11112222-3333-4444-8555-666677778888';
const WAGON_IMAGE = '99990000-aaaa-4bbb-8ccc-ddddeeeeffff';
const TRIANGLE = [
  [
    [0.5, 0],
    [1, 1],
    [0, 1],
  ],
] as const;

function statue(imageAssetId: string | null = STATUE_IMAGE) {
  return lyra({ blocksSight: true, imageAssetId });
}

function boardOf(...tokens: ReturnType<typeof lyra>[]): StoreApi<BoardStore> {
  const board = createBoardStore(VHARN.id, () => undefined);
  board.getState().apply({ kind: 'board', state: vharnBoard({ tokens }) });
  return board;
}

describe('useRoomSightOutlines', () => {
  let api: AssetOutlineApiFake;

  beforeEach(() => {
    api = new AssetOutlineApiFake();
  });

  it('asks the outlines of the blockers of the board shown', () => {
    renderHook(() => useRoomSightOutlines(api, boardOf(statue()), null));

    expect(api.asked).toEqual([STATUE_IMAGE]);
  });

  it('asks the ones of the group grid too: "Na mesa" filters by it', () => {
    const shown = boardOf(statue());
    const group = boardOf(kael({ blocksSight: true, imageAssetId: WAGON_IMAGE }));

    renderHook(() => useRoomSightOutlines(api, shown, group));

    expect(api.asked).toEqual([STATUE_IMAGE, WAGON_IMAGE]);
  });

  it('asks nothing on a board with no blocker', () => {
    const board = boardOf(lyra({ imageAssetId: STATUE_IMAGE }));

    renderHook(() => useRoomSightOutlines(api, board, null));

    expect(api.asked).toEqual([]);
  });

  it('asks nothing while the table has not opened', () => {
    const { result } = renderHook(() => useRoomSightOutlines(api, null, null));

    expect(api.asked).toEqual([]);
    expect(result.current.getState().outlines.size).toBe(0);
  });

  it('the board arriving after the mount is asked', () => {
    const board = createBoardStore(VHARN.id, () => undefined);
    renderHook(() => useRoomSightOutlines(api, board, null));

    act(() => board.getState().apply({ kind: 'board', state: vharnBoard({ tokens: [statue()] }) }));

    expect(api.asked).toEqual([STATUE_IMAGE]);
  });

  it('a token switched on as a blocker is asked', () => {
    const board = boardOf(lyra({ imageAssetId: STATUE_IMAGE }));
    renderHook(() => useRoomSightOutlines(api, board, null));

    act(() => board.getState().apply({ kind: 'boardEvent', event: tokenUpdatedAt(5, statue()) }));

    expect(api.asked).toEqual([STATUE_IMAGE]);
  });

  it('the image swapped asks the new one', () => {
    const board = boardOf(statue());
    renderHook(() => useRoomSightOutlines(api, board, null));

    act(() =>
      board.getState().apply({ kind: 'boardEvent', event: tokenUpdatedAt(5, statue(WAGON_IMAGE)) }),
    );

    expect(api.asked).toEqual([STATUE_IMAGE, WAGON_IMAGE]);
  });

  it('the tab changing to another board asks the blockers of that one', () => {
    const first = boardOf(statue());
    const second = boardOf(statue(WAGON_IMAGE));
    const { rerender } = renderHook(({ board }) => useRoomSightOutlines(api, board, null), {
      initialProps: { board: first },
    });

    rerender({ board: second });

    expect(api.asked).toEqual([STATUE_IMAGE, WAGON_IMAGE]);
  });

  it('keeps the same store across renders, so what was fetched is not fetched again', () => {
    const board = boardOf(statue());
    const { result, rerender } = renderHook(() => useRoomSightOutlines(api, board, null));
    const store = result.current;

    rerender();

    expect(result.current).toBe(store);
    expect(api.asked).toEqual([STATUE_IMAGE]);
  });

  it('leaving the room stops asking', () => {
    const board = boardOf(lyra());
    const { unmount } = renderHook(() => useRoomSightOutlines(api, board, null));

    unmount();
    board.getState().apply({ kind: 'boardEvent', event: tokenUpdatedAt(5, statue()) });

    expect(api.asked).toEqual([]);
  });
});

describe('useTableSightOutlines', () => {
  it('outside a room it is empty, always the same map', () => {
    const { result, rerender } = renderHook(() => useTableSightOutlines());
    const first = result.current;

    rerender();

    expect(first.size).toBe(0);
    expect(result.current).toBe(first);
  });

  it('inside the room it follows the outlines as they arrive', async () => {
    const api = new AssetOutlineApiFake();
    api.answer(STATUE_IMAGE, TRIANGLE);
    function Reader() {
      const outlines = useTableSightOutlines();
      return <output>{outlines.get(STATUE_IMAGE)?.length ?? 'none'}</output>;
    }
    function Room() {
      const sightOutlines = useRoomSightOutlines(api, BOARD, null);
      return (
        <RoomContexts players={[]} tokenKeys={NO_KEYS} sightOutlines={sightOutlines}>
          <Reader />
        </RoomContexts>
      );
    }
    const BOARD = boardOf(statue());
    const NO_KEYS = { create: false, delete: false };

    render(<Room />);

    expect(screen.getByRole('status')).toHaveTextContent('none');
    await act(() => Promise.resolve());
    expect(screen.getByRole('status')).toHaveTextContent('1');
  });
});

describe('useAssetOutline', () => {
  const NO_KEYS = { create: false, delete: false };

  function renderInRoom(api: AssetOutlineApiFake, assetId: string | null) {
    const store = createSightOutlineStore(api);
    const wrapper = ({ children }: Readonly<{ children: React.ReactNode }>) => (
      <RoomContexts players={[]} tokenKeys={NO_KEYS} sightOutlines={store}>
        {children}
      </RoomContexts>
    );
    return renderHook((id: string | null) => useAssetOutline(id), {
      wrapper,
      initialProps: assetId,
    });
  }

  it('asks an image that is on no blocker, and undefined stands for not known yet', async () => {
    const api = new AssetOutlineApiFake();
    api.answer(STATUE_IMAGE, TRIANGLE);
    const { result } = renderInRoom(api, STATUE_IMAGE);

    expect(api.asked).toEqual([STATUE_IMAGE]);
    expect(result.current).toBeUndefined();
    await act(() => Promise.resolve());
    expect(result.current).toEqual(TRIANGLE);
  });

  it('an image with no outline reads null, apart from not known yet', async () => {
    const { result } = renderInRoom(new AssetOutlineApiFake(), STATUE_IMAGE);

    await act(() => Promise.resolve());

    expect(result.current).toBeNull();
  });

  it('no image asks nothing', () => {
    const api = new AssetOutlineApiFake();
    const { result } = renderInRoom(api, null);

    expect(api.asked).toEqual([]);
    expect(result.current).toBeUndefined();
  });

  it('the image swapped asks the new one', async () => {
    const api = new AssetOutlineApiFake();
    const { rerender } = renderInRoom(api, STATUE_IMAGE);

    rerender(WAGON_IMAGE);
    await act(() => Promise.resolve());

    expect(api.asked).toEqual([STATUE_IMAGE, WAGON_IMAGE]);
  });

  it('outside a room there is nothing to ask and nothing known', () => {
    const { result } = renderHook(() => useAssetOutline(STATUE_IMAGE));

    expect(result.current).toBeUndefined();
  });
});

describe('play room: the outlines of the blockers', () => {
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
      { kind: 'board', state: vharnBoard({ tokens: [statue()] }) },
    );
    await act(() => Promise.resolve());
  });

  it('opening the table asks the outline of the blocker on the scene', () => {
    expect(deps.assets.outlines.asked).toEqual([STATUE_IMAGE]);
  });

  it('showing another grid tab asks the outline of the blocker there', async () => {
    const [table] = deps.openTables.getState().tables;

    act(() => table?.tabs.getState().open(TORRE_SCENE.id));
    deps.tableSessionApi.emitToGrid(TORRE_SCENE.id, {
      kind: 'board',
      state: torreBoard({ tokens: [statue(WAGON_IMAGE)] }),
    });
    await act(() => Promise.resolve());

    expect(deps.assets.outlines.asked).toEqual([STATUE_IMAGE, WAGON_IMAGE]);
  });

  it('with another grid tab shown, a blocker reaching the group grid is still asked', async () => {
    const [table] = deps.openTables.getState().tables;
    act(() => table?.tabs.getState().open(TORRE_SCENE.id));
    deps.tableSessionApi.emitToGrid(TORRE_SCENE.id, { kind: 'board', state: torreBoard() });
    await act(() => Promise.resolve());

    deps.tableSessionApi.emit({
      kind: 'board',
      state: vharnBoard({ tokens: [statue(WAGON_IMAGE)] }),
    });
    await act(() => Promise.resolve());

    expect(deps.assets.outlines.asked).toEqual([STATUE_IMAGE, WAGON_IMAGE]);
  });
});
