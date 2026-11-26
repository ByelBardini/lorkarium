import type { StoreApi } from 'zustand/vanilla';
import { tokenDockPrefsKey } from '@/lib/token-dock-prefs';
import { useBoard, type BoardStore } from '@/stores/board-store';

/** Where one account's dock at this table is remembered (`null` before the board arrives).
 *
 *  Example: `const key = useTokenDockPrefsKey(board)` */
export function useTokenDockPrefsKey(board: StoreApi<BoardStore>): string | null {
  return useBoard(board, (state) =>
    state.board ? tokenDockPrefsKey(state.board.viewer.userId, state.campaignId) : null,
  );
}
