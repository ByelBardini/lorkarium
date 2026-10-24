import { useEffect } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { shortcutFor, type BoardShortcut } from '@/lib/board-shortcuts';
import type { CampaignRoleDto, TokenLayerDto } from '@lorkarium/contracts';
import { toolsOf } from '@/lib/table-role';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardTool } from '@/stores/board-tool-state';
import type { RoomLayoutStore } from '@/stores/room-layout-store';

export type RoomShortcutStores = Readonly<{
  roomLayout: StoreApi<RoomLayoutStore>;
  interaction: StoreApi<BoardInteractionStore>;
  /** The keys of the tools this role may not pick do nothing (a spectator's B and M). */
  role: CampaignRoleDto;
}>;

const TOOL_OF: Partial<Record<BoardShortcut, BoardTool>> = {
  'select-tool': 'select',
  'ruler-tool': 'ruler',
  'draw-tool': 'draw',
  'area-tool': 'area',
  'walls-tool': 'walls',
  'lights-tool': 'lights',
};

const LAYER_OF: Partial<Record<BoardShortcut, TokenLayerDto>> = {
  'layer-tokens': 'tokens',
  'layer-objects': 'objects',
  'layer-background': 'background',
};

/** The room keys anywhere on the page (F, Esc, V, R, G, B and M but for a spectator, and P, L and
 *  1 2 3 for the master), except while typing or in a dialog.
 *
 *  Example: `useRoomShortcuts({ roomLayout, interaction, role: campaign.myRole })` */
export function useRoomShortcuts({ roomLayout, interaction, role }: RoomShortcutStores): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const shortcut = shortcutFor(event);
      if (shortcut) runShortcut(shortcut, { roomLayout, interaction, role });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [roomLayout, interaction, role]);
}

function runShortcut(shortcut: BoardShortcut, stores: RoomShortcutStores): void {
  const layout = stores.roomLayout.getState();
  const board = stores.interaction.getState();
  if (shortcut === 'toggle-focus') return layout.toggleFocus();
  const tool = TOOL_OF[shortcut];
  if (tool) return void (toolsOf(stores.role).includes(tool) && board.setTool(tool));
  if (shortcut === 'toggle-grid') return board.toggleLocalGrid();
  const layer = LAYER_OF[shortcut];
  if (layer) return board.setActiveLayer(layer);
  layout.exitFocus();
  board.escape();
}
