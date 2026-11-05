import type { TokenDto } from '@lorkarium/contracts';
import type { SightOutline } from '@lorkarium/game-core';
import { createContext, useContext, useEffect, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { NO_SIGHT_OUTLINES, blockerAssetIdsOf, type SightOutlines } from '@/lib/sight-geometry';
import type { AssetOutlineApi } from '@/services/assets-api';
import type { BoardStore, BoardStoreState } from '@/stores/board-store';
import { createSightOutlineStore, type SightOutlineStore } from '@/stores/sight-outline-store';

const NO_REQUEST: SightOutlineStore['request'] = () => Promise.resolve();

/** The outlines known in the room: given once by it instead of threading them through every
 *  component that reads the sight filter. Outside a room it is empty: blockers by the rectangle. */
export const TableSightOutlinesContext = createContext<SightOutlines>(NO_SIGHT_OUTLINES);

/** The outlines of the room around this component.
 *
 *  Example: `sightGeometryOf(board, useTableSightOutlines(), landing)` */
export function useTableSightOutlines(): SightOutlines {
  return useContext(TableSightOutlinesContext);
}

/** How a component inside the room asks an outline of an image that is on no blocker yet. Outside
 *  a room it asks nothing. */
export const TableSightOutlineRequestContext = createContext(NO_REQUEST);

/** The outline of one image, asked for if nobody has: `undefined` while not known (or with no
 *  image), `null` when it has none (or the request failed).
 *
 *  Example: `const outline = useAssetOutline(form.imageAssetId)` */
export function useAssetOutline(assetId: string | null): SightOutline | null | undefined {
  const request = useContext(TableSightOutlineRequestContext);
  const outlines = useTableSightOutlines();
  useEffect(() => {
    if (assetId) void request([assetId]);
  }, [assetId, request]);
  return assetId ? outlines.get(assetId) : undefined;
}

/** The room's store of outlines, which asks for those of the blockers of the grid shown and of the
 *  group grid ("Na mesa" filters by that one) as they appear or change image. Code outside React
 *  reads it by `getState().outlines`; a board of `null` is a table not open yet.
 *
 *  Example: `const sightOutlines = useRoomSightOutlines(props.assets, table?.board ?? null, shown.group?.board ?? null)` */
export function useRoomSightOutlines(
  assets: AssetOutlineApi,
  shown: StoreApi<BoardStore> | null,
  group: StoreApi<BoardStore> | null,
): StoreApi<SightOutlineStore> {
  const [outlines] = useState(() => createSightOutlineStore(assets));
  useBlockerOutlinesAsked(shown, outlines);
  useBlockerOutlinesAsked(group, outlines);
  return outlines;
}

function useBlockerOutlinesAsked(
  board: StoreApi<BoardStore> | null,
  outlines: StoreApi<SightOutlineStore>,
): void {
  useEffect(() => {
    if (!board) return undefined;
    const ask = onNewTokens((tokens) => {
      void outlines.getState().request(blockerAssetIdsOf(tokens));
    });
    ask(board.getState());
    return board.subscribe(ask);
  }, [board, outlines]);
}

// A drag changes the board store at every cell and leaves `tokens` alone: nothing to ask then.
function onNewTokens(ask: (tokens: readonly TokenDto[]) => void): (state: BoardStoreState) => void {
  let seen: readonly TokenDto[] | null = null;
  return ({ board }) => {
    if (!board || board.tokens === seen) return;
    seen = board.tokens;
    ask(board.tokens);
  };
}
