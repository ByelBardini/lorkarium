import { useEffect } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { shortcutFor, type BoardShortcut } from '@/lib/board-shortcuts';
import type { TokenLayerDto } from '@lorkarium/contracts';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import type { RoomLayoutStore } from '@/stores/room-layout-store';

export type RoomShortcutStores = Readonly<{
  roomLayout: StoreApi<RoomLayoutStore>;
  interaction: StoreApi<BoardInteractionStore>;
}>;

const LAYER_OF: Partial<Record<BoardShortcut, TokenLayerDto>> = {
  'layer-tokens': 'tokens',
  'layer-objects': 'objects',
  'layer-background': 'background',
};

/** The room keys anywhere on the page (F, Esc, V, R, B, M, G, and P, L and 1 2 3 for the master),
 *  except while typing or in a dialog.
 *
 *  Example: `useRoomShortcuts({ roomLayout, interaction })` */
export function useRoomShortcuts({ roomLayout, interaction }: RoomShortcutStores): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const shortcut = shortcutFor(event);
      if (shortcut) runShortcut(shortcut, { roomLayout, interaction });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [roomLayout, interaction]);
}

function runShortcut(shortcut: BoardShortcut, stores: RoomShortcutStores): void {
  const layout = stores.roomLayout.getState();
  const board = stores.interaction.getState();
  if (shortcut === 'toggle-focus') return layout.toggleFocus();
  if (shortcut === 'select-tool') return board.setTool('select');
  if (shortcut === 'ruler-tool') return board.setTool('ruler');
  if (shortcut === 'draw-tool') return board.setTool('draw');
  if (shortcut === 'area-tool') return board.setTool('area');
  if (shortcut === 'walls-tool') return board.setTool('walls');
  if (shortcut === 'lights-tool') return board.setTool('lights');
  if (shortcut === 'toggle-grid') return board.toggleLocalGrid();
  const layer = LAYER_OF[shortcut];
  if (layer) return board.setActiveLayer(layer);
  layout.exitFocus();
  board.escape();
}
