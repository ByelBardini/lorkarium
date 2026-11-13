import { imageIdOf, mapIdOf, sheetIdOf } from '@/lib/library-entries';
import { useState } from 'react';
import type { LibraryIntent } from './library-intents';
import { sceneIdOf } from './library-view';
import type { TreeEditing } from './tree-rows';
import type { LibrarySubmit } from './use-library-submit';

type EditState = Readonly<{ kind: 'rename'; key: string }> | null;

/** The master's name fields in the tree, and how to open them. */
export type TreeEditingControls = Readonly<{
  /** `null` for a player: nothing is edited. */
  editing: TreeEditing | null;
  /** A field is open: the context menu stays the browser's. */
  active: boolean;
  startRename: (key: string) => void;
}>;

/** The name field of the tree: renaming an item in place, one at a time.
 *
 *  Example: `const { editing, startRename } = useTreeEditing(master?.submit ?? null, focusItem)` */
export function useTreeEditing(
  submit: LibrarySubmit | null,
  focusItem: (key: string) => void,
): TreeEditingControls {
  const [state, setState] = useState<EditState>(null);
  const controls = {
    active: state !== null,
    startRename: (key: string) => setState({ kind: 'rename', key }),
  };
  if (!submit) return { ...controls, editing: null };
  const editing: TreeEditing = {
    renamingKey: state?.key ?? null,
    onRename: (key, name) => void submit(renameIntent(key, name)),
    onDone: (refocusKey) => {
      setState(null);
      if (refocusKey) focusItem(refocusKey);
    },
  };
  return { ...controls, editing };
}

function renameIntent(key: string, name: string): LibraryIntent {
  const mapId = mapIdOf(key);
  if (mapId) return { intent: 'updateMap', mapId, changes: { name } };
  const sheetId = sheetIdOf(key);
  if (sheetId)
    return { intent: 'updateSheet', sheetId, changes: { actionId: crypto.randomUUID(), name } };
  const imageId = imageIdOf(key);
  if (imageId) return { intent: 'updateImage', imageId, changes: { name } };
  const sceneId = sceneIdOf(key);
  if (sceneId) return { intent: 'updateScene', sceneId, changes: { name } };
  return { intent: 'updateFolder', folderId: key, changes: { name } };
}
