import { useCallback, useEffect, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { posedTokenOf } from '@/lib/patrol-poses';
import type { BoardScope } from '@/services/board-command-sender';
import type { TokenPatrolCommands } from '@/services/token-patrol-commands';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import { createTokenPatrolEditor, type TokenPatrolEditor } from '@/stores/token-patrol-flow';
import { PATROL_POINTS_FULL } from './patrol-messages';

export type RoomPatrolEditorDeps = Readonly<{
  commands: Pick<TokenPatrolCommands, 'setTokenPatrol'>;
  /** The grid shown: its board, the interaction of its tab and its scope. */
  board: StoreApi<BoardStore> | null;
  interaction: StoreApi<BoardInteractionStore>;
  scopeOf: () => BoardScope;
}>;

export type RoomPatrolEditor = Readonly<{
  editor: StoreApi<TokenPatrolEditor>;
  /** "Patrulha…": the editor opens on that token where it shows now. */
  open: (tokenId: string) => void;
}>;

/** The patrol editor of a room visit: one for the room, opened on a token of the grid shown and
 *  closed when another grid is shown (its draft belongs to the grid it was drawn on).
 *
 *  Example: `const patrol = useRoomPatrolEditor({ commands, board: table?.board ?? null, interaction, scopeOf })` */
export function useRoomPatrolEditor(deps: RoomPatrolEditorDeps): RoomPatrolEditor {
  const { board, interaction, scopeOf } = deps;
  const [editor] = useState(() =>
    createTokenPatrolEditor({ commands: deps.commands, fullNotice: PATROL_POINTS_FULL }),
  );
  useEffect(() => () => editor.getState().cancel(), [editor, board]);
  const open = useCallback(
    (tokenId: string) => {
      const state = board?.getState();
      const token = state?.board?.tokens.find(({ id }) => id === tokenId);
      if (!state || !token) return;
      const shown = posedTokenOf(token, state.patrol.poses);
      const say = (notice: string): void => interaction.getState().say(notice);
      editor.getState().open({ scope: scopeOf(), token: shown, say });
    },
    [board, editor, interaction, scopeOf],
  );
  return { editor, open };
}
