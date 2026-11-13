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
  /** The keys of the tools this role may not pick do nothing (a spectator's B, M and C). */
  role: CampaignRoleDto;
  enabled?: boolean;
  /** Shift+B: opens the library, or closes it. */
  toggleLibrary?: () => void;
}>;

const TOOL_OF: Partial<Record<BoardShortcut, BoardTool>> = {
  'select-tool': 'select',
  'ruler-tool': 'ruler',
  'draw-tool': 'draw',
  'area-tool': 'area',
  'conditions-tool': 'conditions',
  'walls-tool': 'walls',
  'lights-tool': 'lights',
};

const LAYER_OF: Partial<Record<BoardShortcut, TokenLayerDto>> = {
  'layer-tokens': 'tokens',
  'layer-objects': 'objects',
  'layer-background': 'background',
};

/** The room keys anywhere on the page (F, Esc, Shift+B, \, V, R, G, T, B, M and C but for a spectator, and P,
 *  L and 1 2 3 for the master), except while typing or in a dialog. Ctrl/⌘+C stays the copy.
 *
 *  Example: `useRoomShortcuts({ roomLayout, interaction, role: campaign.myRole })` */
export function useRoomShortcuts({
  roomLayout,
  interaction,
  role,
  enabled = true,
  toggleLibrary,
}: RoomShortcutStores): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      const shortcut = shortcutFor(event);
      if (!shortcut) return;
      // The composer takes the focus during this keydown: the T would be typed into it.
      if (shortcut === 'open-chat') event.preventDefault();
      runShortcut(shortcut, { roomLayout, interaction, role, toggleLibrary });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [roomLayout, interaction, role, enabled, toggleLibrary]);
}

function runShortcut(shortcut: BoardShortcut, stores: RoomShortcutStores): void {
  const layout = stores.roomLayout.getState();
  const board = stores.interaction.getState();
  if (shortcut === 'toggle-focus') return layout.toggleFocus();
  if (shortcut === 'open-chat') return layout.requestChatFocus();
  if (shortcut === 'toggle-library') return stores.toggleLibrary?.();
  if (shortcut === 'toggle-panel') return layout.togglePanel();
  const tool = TOOL_OF[shortcut];
  if (tool) return void (toolsOf(stores.role).includes(tool) && board.setTool(tool));
  if (shortcut === 'toggle-grid') return board.toggleLocalGrid();
  const layer = LAYER_OF[shortcut];
  if (layer) return board.setActiveLayer(layer);
  layout.exitFocus();
  board.escape();
}
