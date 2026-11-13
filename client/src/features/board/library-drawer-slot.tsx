import type { ReactNode } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { roomPanelInsetClass } from '@/lib/room-panel-inset';
import { cn } from '@/lib/utils';
import { useRoomLayout, type RoomLayoutStore } from '@/stores/room-layout-store';

export type LibraryDrawerSlotProps = Readonly<{
  roomLayout: StoreApi<RoomLayoutStore>;
  children: ReactNode;
}>;

/** Where the library drawer floats over the board: from the room's left edge, over the toolbar
 *  (z-20 keeps it on top; covering the tools is fine while it is open), to the side panel. It lets the clicks through: only the drawer takes them, so
 *  the board beside it stays in play and the canvas never resizes.
 *
 *  Example: `<LibraryDrawerSlot roomLayout={roomLayout}>{libraryDrawer}</LibraryDrawerSlot>` */
export function LibraryDrawerSlot({ roomLayout, children }: LibraryDrawerSlotProps) {
  const panel = useRoomLayout(roomLayout, (state) => state.panel);
  const focus = useRoomLayout(roomLayout, (state) => state.focus);
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-y-0 left-0 z-20 flex max-md:right-0',
        roomPanelInsetClass({ panel, focus }),
      )}
    >
      {children}
    </div>
  );
}
