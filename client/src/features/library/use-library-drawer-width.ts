import { useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { useRoomLayout, type RoomLayoutStore } from '@/stores/room-layout-store';

/** The drawer width: the one remembered, or the one under the pointer while the edge drags. */
export type LibraryDrawerWidth = Readonly<{
  width: number;
  /** A width while dragging (`final` false) or the one to keep (`final` true). */
  onWidth: (width: number, final: boolean) => void;
}>;

/** The width of the library drawer: remembered in the room layout, followed live while the edge
 *  drags and stored only when it lets go (one write per drag, not per pointer move).
 *
 *  Example: `const sizing = useLibraryDrawerWidth(roomLayout); sizing.onWidth(600, true)` */
export function useLibraryDrawerWidth(roomLayout: StoreApi<RoomLayoutStore>): LibraryDrawerWidth {
  const stored = useRoomLayout(roomLayout, (state) => state.libraryWidth);
  const [dragged, setDragged] = useState<number | null>(null);
  const onWidth = (width: number, final: boolean): void => {
    if (!final) return setDragged(width);
    roomLayout.getState().setLibraryWidth(width);
    setDragged(null);
  };
  return { width: dragged ?? stored, onWidth };
}
