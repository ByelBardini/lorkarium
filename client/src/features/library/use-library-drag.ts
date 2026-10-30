type LibraryDragged = Readonly<{ kind: 'folder' | 'scene' | 'image'; id: string }>;
import { useState, type DragEvent } from 'react';
import { canDrop } from '@/lib/folder-tree';
import { imageIdOf, type MixedLibrary } from '@/lib/library-entries';
import type { LibraryIntent } from './library-intents';
import { NO_FOLDER, sceneIdOf } from './library-view';
import type { LibrarySubmit } from './use-library-submit';

// The type Lorkarium puts on the drag; the text one is for browsers that drag only with text.
const DRAG_TYPE = 'application/x-lorkarium-library';

type DragProps = Readonly<Record<string, unknown>>;

/** The native drag and drop of the library: grids and folders of the tree onto a folder (or
 *  "Sem pasta"). A target that cannot take what is dragged says `aria-dropeffect="none"`; a
 *  grid is no target, so a drop on it lands in its folder. */
export type LibraryDrag = Readonly<{
  treeItemProps: (key: string) => DragProps;
}>;

type DragOptions = Readonly<{
  library: MixedLibrary;
  /** The master, with the table live. */
  enabled: boolean;
  submit: LibrarySubmit;
}>;

/** Dragging in the library: what goes where, and the move sent on the drop.
 *
 *  Example: `const drag = useLibraryDrag({ library, enabled: isMaster && live, submit })` */
export function useLibraryDrag({ library, enabled, submit }: DragOptions): LibraryDrag {
  const [dragged, setDragged] = useState<LibraryDragged | null>(null);
  const sources = (item: LibraryDragged, name: string): DragProps => ({
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.stopPropagation();
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item));
      event.dataTransfer.setData('text/plain', name);
      setDragged(item);
    },
    onDragEnd: () => setDragged(null),
  });
  const target = (key: string): DragProps =>
    dragged
      ? dropTarget(library, dragged, key, (intent) => {
          setDragged(null);
          if (intent) void submit(intent);
        })
      : {};
  if (!enabled) return { treeItemProps: () => ({}) };
  return {
    treeItemProps: (key) => {
      if (sceneIdOf(key) || imageIdOf(key)) return sourceOf(library, key, sources);
      return { ...sourceOf(library, key, sources), ...target(key) };
    },
  };
}

function sourceOf(
  library: MixedLibrary,
  key: string,
  sources: (item: LibraryDragged, name: string) => DragProps,
): DragProps {
  const image = library.images?.find(({ id }) => id === imageIdOf(key));
  if (image) return sources({ kind: 'image', id: image.id }, image.name);
  const sceneId = sceneIdOf(key);
  const scene = library.scenes.find(({ id }) => id === sceneId);
  if (scene) return sources({ kind: 'scene', id: scene.id }, scene.name);
  const folder = library.folders.find(({ id }) => id === key);
  return folder ? sources({ kind: 'folder', id: folder.id }, folder.name) : {};
}

function dropTarget(
  library: MixedLibrary,
  dragged: LibraryDragged,
  key: string,
  onDrop: (intent: LibraryIntent | null) => void,
): DragProps {
  const folderId = key === NO_FOLDER ? null : key;
  const allowed = canDrop(
    library.folders,
    { id: dragged.id, kind: dragged.kind === 'folder' ? 'folder' : 'scene' },
    folderId,
  );
  const accept = (event: DragEvent): void => {
    event.stopPropagation();
    event.dataTransfer.dropEffect = allowed ? 'move' : 'none';
    if (allowed) event.preventDefault();
  };
  return {
    'aria-dropeffect': allowed ? 'move' : 'none',
    onDragEnter: accept,
    onDragOver: accept,
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onDrop(allowed ? moveIntent(library, dragged, folderId) : null);
    },
  };
}

// The move to send, or `null` when the piece is already there.
function moveIntent(
  library: MixedLibrary,
  dragged: LibraryDragged,
  folderId: string | null,
): LibraryIntent | null {
  if (dragged.kind === 'image') {
    const image = library.images?.find(({ id }) => id === dragged.id);
    if (!image || image.folderId === folderId) return null;
    return { intent: 'updateImage', imageId: image.id, changes: { folderId } };
  }
  if (dragged.kind === 'scene') {
    const scene = library.scenes.find(({ id }) => id === dragged.id);
    if (!scene || scene.folderId === folderId) return null;
    return { intent: 'updateScene', sceneId: scene.id, changes: { folderId } };
  }
  const folder = library.folders.find(({ id }) => id === dragged.id);
  if (!folder || folder.parentId === folderId) return null;
  return { intent: 'updateFolder', folderId: folder.id, changes: { parentId: folderId } };
}

/** The library as it will be once the move being sent lands: the grid or folder already in
 *  its new place; a refusal brings the list the server still has, so it goes back.
 *
 *  Example: `const shown = withPendingMove(library, pending)` */
export function withPendingMove(
  library: MixedLibrary,
  pending: LibraryIntent | null,
): MixedLibrary {
  if (pending?.intent === 'updateImage' && pending.changes.folderId !== undefined) {
    const images = library.images?.map((image) =>
      image.id === pending.imageId
        ? { ...image, folderId: pending.changes.folderId ?? null }
        : image,
    );
    return { ...library, images };
  }
  if (pending?.intent === 'updateScene' && pending.changes.folderId !== undefined) {
    const { sceneId, changes } = pending;
    const folderId = changes.folderId ?? null;
    const scenes = library.scenes.map((scene) =>
      scene.id === sceneId ? { ...scene, folderId } : scene,
    );
    return { ...library, scenes };
  }
  if (pending?.intent === 'updateFolder' && pending.changes.parentId !== undefined) {
    const { folderId, changes } = pending;
    const parentId = changes.parentId ?? null;
    const folders = library.folders.map((folder) =>
      folder.id === folderId ? { ...folder, parentId } : folder,
    );
    return { ...library, folders };
  }
  return library;
}
