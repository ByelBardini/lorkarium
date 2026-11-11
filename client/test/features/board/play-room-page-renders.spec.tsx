import { act, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRoutes } from '@/app/router';
import type { BoardAreaProps } from '@/features/board/board-area';
import type { RoomHeaderProps } from '@/features/board/room-header';
import type { RoomPanelProps } from '@/features/board/room-panel';
import type { BoardIntent } from '@/renderer/board-renderer';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { KAEL_ID, kael, lyra, vharnBoard, vharnState } from '../../support/table-session-fixtures';

// The three big parts of the room, counted where they render.
const parts = vi.hoisted(() => ({ header: 0, board: 0, panel: 0 }));
vi.mock('@/features/board/room-header', async (original) => {
  const actual = await original<typeof import('@/features/board/room-header')>();
  function CountedRoomHeader(props: RoomHeaderProps): React.JSX.Element {
    parts.header += 1;
    return createElement(actual.RoomHeader, props);
  }
  return { ...actual, RoomHeader: CountedRoomHeader };
});
vi.mock('@/features/board/board-area', async (original) => {
  const actual = await original<typeof import('@/features/board/board-area')>();
  function CountedBoardArea(props: BoardAreaProps): React.JSX.Element {
    parts.board += 1;
    return createElement(actual.BoardArea, props);
  }
  return { ...actual, BoardArea: CountedBoardArea };
});
vi.mock('@/features/board/room-panel', async (original) => {
  const actual = await original<typeof import('@/features/board/room-panel')>();
  function CountedRoomSidePanel(props: RoomPanelProps): React.JSX.Element {
    parts.panel += 1;
    return createElement(actual.RoomSidePanel, props);
  }
  return { ...actual, RoomSidePanel: CountedRoomSidePanel };
});

const KAEL_HOVERED: BoardIntent = {
  kind: 'tokenHovered',
  tokenId: KAEL_ID,
  rect: { x: 320, y: 256, width: 64, height: 64 },
};
const NOTHING_HOVERED: BoardIntent = { kind: 'tokenHovered', tokenId: null, rect: null };

describe('play room renders', () => {
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
    Object.assign(parts, { header: 0, board: 0, panel: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function hover(intent: BoardIntent): void {
    act(() => deps.boardRenderers.latest().emit(intent));
  }

  it('the card of a hovered token opens and closes without rendering the header, the board or the panel', () => {
    hover(KAEL_HOVERED);
    act(() => deps.interactionClock.advance(300));
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent('Kael');
    hover(NOTHING_HOVERED);

    expect(parts).toEqual({ header: 0, board: 0, panel: 0 });
  });

  it('the room rendering again keeps the keys of copy, paste and undo where they are', () => {
    const added = vi.spyOn(window, 'addEventListener');
    const room = deps.openTables.getState().tables[0];
    const interaction = room?.tabs.getState().tabs[0]?.interaction;

    act(() => interaction?.getState().setTool('ruler'));

    const keydowns = added.mock.calls.filter(([type]) => type === 'keydown');
    expect(parts.board).toBeGreaterThan(0);
    expect(keydowns).toEqual([]);
  });
});
