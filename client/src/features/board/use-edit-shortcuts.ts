import { useEffect } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { editShortcutFor, type EditShortcut } from '@/lib/board-shortcuts';
import { copiedOf } from '@/lib/paste-placement';
import type { BoardScope, TableBoardCommands } from '@/services/table-board-commands';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import type {
  EditContext,
  EditOutcome,
  PasteOutcome,
  TableEditStore,
} from '@/stores/table-edit-store';
import {
  OUT_OF_SCENE,
  PASTE_TOKENS_MASTER_ONLY,
  boardCommandFailureMessage,
  copiedAnnouncement,
} from './board-messages';

export type EditShortcutDeps = Readonly<{
  /** The grid the keys act on, read when each one is pressed. */
  scopeOf: () => BoardScope;
  table: Readonly<{ board: StoreApi<BoardStore>; edits: StoreApi<TableEditStore> }> | null;
  interaction: StoreApi<BoardInteractionStore>;
  commands: TableBoardCommands;
  isMaster: boolean;
}>;

type EditWork = () => Promise<void>;

/** Ctrl/⌘ + C copies the selection to the table's copy area, + V pastes it under the cursor,
 *  + Z undoes and + Y (or Shift+Z) redoes this user's own actions. A key is only taken when
 *  there is something to do, so copying text elsewhere on the page still works.
 *
 *  Example: `useEditShortcuts({ scopeOf, table, interaction, commands, isMaster })` */
export function useEditShortcuts(deps: EditShortcutDeps): void {
  const { scopeOf, table, interaction, commands, isMaster } = deps;
  useEffect(() => {
    if (!table) return;
    const current = { scopeOf, table, interaction, commands, isMaster };
    const onKeyDown = (event: KeyboardEvent): void => {
      const shortcut = editShortcutFor(event);
      const work = shortcut && editWorkOf(shortcut, current);
      if (!work) return;
      event.preventDefault();
      void work();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [scopeOf, table, interaction, commands, isMaster]);
}

type OpenEditDeps = EditShortcutDeps & Readonly<{ table: NonNullable<EditShortcutDeps['table']> }>;

function editWorkOf(shortcut: EditShortcut, deps: OpenEditDeps): EditWork | null {
  if (shortcut === 'copy') return copyWorkOf(deps);
  const edits = deps.table.edits.getState();
  if (shortcut === 'paste') return edits.copied ? () => paste(deps) : null;
  const { past, future } = edits.history;
  const stack = shortcut === 'undo' ? past : future;
  if (stack.length === 0) return null;
  return async () => sayOutcome(deps, await edits[shortcut](contextOf(deps)));
}

function copyWorkOf({ table, interaction }: OpenEditDeps): EditWork | null {
  const board = table.board.getState().board;
  const { selectedTokenIds, selectedDrawingIds, selectedEffectAreaIds } = interaction.getState();
  const tokens = board?.tokens.filter(({ id }) => selectedTokenIds.includes(id)) ?? [];
  const drawings = board?.drawings.filter(({ id }) => selectedDrawingIds.includes(id)) ?? [];
  const areas = board?.effectAreas.filter(({ id }) => selectedEffectAreaIds.includes(id)) ?? [];
  const count = tokens.length + drawings.length + areas.length;
  if (count === 0) return null;
  return async () => {
    table.edits.getState().copy(copiedOf(tokens, drawings, areas, board?.combat ?? null));
    interaction.getState().say(copiedAnnouncement(count));
  };
}

async function paste(deps: OpenEditDeps): Promise<void> {
  const scene = deps.table.board.getState().board?.scene;
  if (!scene) return;
  const cursor = deps.interaction.getState().hoverCell;
  const target = {
    cursor,
    scene: { widthCells: scene.widthCells, heightCells: scene.heightCells },
  };
  const pasted = await deps.table.edits.getState().paste(contextOf(deps), target);
  sayPasted(deps, pasted);
}

function sayPasted(deps: OpenEditDeps, { outcome, skippedTokens }: PasteOutcome): void {
  if (outcome.kind === 'refused' || outcome.kind === 'out_of_scene')
    return sayOutcome(deps, outcome);
  if (skippedTokens) deps.interaction.getState().say(PASTE_TOKENS_MASTER_ONLY);
}

function sayOutcome({ interaction }: OpenEditDeps, outcome: EditOutcome): void {
  if (outcome.kind === 'out_of_scene') return interaction.getState().say(OUT_OF_SCENE);
  if (outcome.kind !== 'refused') return;
  interaction.getState().say(boardCommandFailureMessage(outcome.failure));
}

function contextOf({ scopeOf, commands, isMaster, interaction }: OpenEditDeps): EditContext {
  return { scope: scopeOf(), commands, isMaster, readOnly: interaction.getState().readOnly };
}
