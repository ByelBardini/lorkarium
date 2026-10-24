import { useState } from 'react';
import type { LibraryIntent } from './library-intents';
import { sceneIdOf } from './library-view';
import type { TreeEditing } from './tree-rows';
import type { LibrarySubmit } from './use-library-submit';

type EditState =
  | Readonly<{ kind: 'rename'; key: string }>
  | Readonly<{ kind: 'newFolder'; parentId: string | null }>
  | null;

/** The master's name fields in the tree, and how to open them. */
export type TreeEditingControls = Readonly<{
  /** `null` for a player: nothing is edited. */
  editing: TreeEditing | null;
  /** A field is open: the context menu stays the browser's. */
  active: boolean;
  startRename: (key: string) => void;
  startNewFolder: (parentId: string | null) => void;
}>;

/** One name field at a time in the tree: renaming an item or naming a new folder.
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
    startNewFolder: (parentId: string | null) => setState({ kind: 'newFolder', parentId }),
  };
  if (!submit) return { ...controls, editing: null };
  const editing: TreeEditing = {
    renamingKey: state?.kind === 'rename' ? state.key : null,
    newFolderParent: state?.kind === 'newFolder' ? state.parentId : undefined,
    onRename: (key, name) => void submit(renameIntent(key, name)),
    onCreateFolder: (parentId, name) => {
      setState(null);
      void submit({ intent: 'createFolder', folder: { name, parentId } });
    },
    onDone: (refocusKey) => {
      setState(null);
      if (refocusKey) focusItem(refocusKey);
    },
  };
  return { ...controls, editing };
}

function renameIntent(key: string, name: string): LibraryIntent {
  const sceneId = sceneIdOf(key);
  if (sceneId) return { intent: 'updateScene', sceneId, changes: { name } };
  return { intent: 'updateFolder', folderId: key, changes: { name } };
}
