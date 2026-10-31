type LibraryDragged = Readonly<{
  kind: 'folder' | 'scene' | 'image' | 'document' | 'sheet-template' | 'sheet';
  id: string;
}>;
import { useState, type DragEvent } from 'react';
import { canDrop } from '@/lib/folder-tree';
import {
  documentIdOf,
  imageIdOf,
  sheetIdOf,
  sheetTemplateIdOf,
  type MixedLibrary,
} from '@/lib/library-entries';
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
      if (isLeafKey(key)) return sourceOf(library, key, sources);
      return { ...sourceOf(library, key, sources), ...target(key) };
    },
  };
}

// Items are only dragged; folders (and "Sem pasta") also take drops.
function isLeafKey(key: string): boolean {
  return [sceneIdOf, imageIdOf, documentIdOf, sheetTemplateIdOf, sheetIdOf].some(
    (idOf) => idOf(key) !== null,
  );
}

function sourceOf(
  library: MixedLibrary,
  key: string,
  sources: (item: LibraryDragged, name: string) => DragProps,
): DragProps {
  const document = library.documents?.find(({ id }) => id === documentIdOf(key));
  if (document)
    return document.canManage ? sources({ kind: 'document', id: document.id }, document.name) : {};
  const image = library.images?.find(({ id }) => id === imageIdOf(key));
  if (image) return sources({ kind: 'image', id: image.id }, image.name);
  const template = library.sheetTemplates?.find(({ id }) => id === sheetTemplateIdOf(key));
  if (template) return sources({ kind: 'sheet-template', id: template.id }, template.name);
  const sheet = library.sheets?.find(({ id }) => id === sheetIdOf(key));
  if (sheet) return sources({ kind: 'sheet', id: sheet.id }, sheet.name);
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
  if (dragged.kind === 'sheet-template') return templateMove(library, dragged.id, folderId);
  if (dragged.kind === 'sheet') return sheetMove(library, dragged.id, folderId);
  if (dragged.kind === 'document') {
    const document = library.documents?.find(({ id }) => id === dragged.id);
    if (!document || !document.canManage || document.folderId === folderId) return null;
    return {
      intent: 'updateDocument',
      documentId: document.id,
      changes: { actionId: crypto.randomUUID(), expectedVersion: document.version, folderId },
    };
  }
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

function templateMove(
  library: MixedLibrary,
  templateId: string,
  folderId: string | null,
): LibraryIntent | null {
  const template = library.sheetTemplates?.find(({ id }) => id === templateId);
  if (!template || template.folderId === folderId) return null;
  const changes = { expectedVersion: template.version, folderId };
  return { intent: 'updateSheetTemplate', templateId, changes };
}

function sheetMove(
  library: MixedLibrary,
  sheetId: string,
  folderId: string | null,
): LibraryIntent | null {
  const sheet = library.sheets?.find(({ id }) => id === sheetId);
  if (!sheet || sheet.folderId === folderId) return null;
  return { intent: 'updateSheet', sheetId, changes: { actionId: crypto.randomUUID(), folderId } };
}

/** The library as it will be once the move being sent lands: the grid or folder already in
 *  its new place; a refusal brings the list the server still has, so it goes back.
 *
 *  Example: `const shown = withPendingMove(library, pending)` */
export function withPendingMove(
  library: MixedLibrary,
  pending: LibraryIntent | null,
): MixedLibrary {
  if (pending?.intent === 'updateSheet' && pending.changes.folderId !== undefined) {
    const folderId = pending.changes.folderId;
    const sheets = library.sheets?.map((sheet) =>
      sheet.id === pending.sheetId ? { ...sheet, folderId } : sheet,
    );
    return { ...library, sheets };
  }
  if (pending?.intent === 'updateSheetTemplate' && pending.changes.folderId !== undefined) {
    const folderId = pending.changes.folderId;
    const sheetTemplates = library.sheetTemplates?.map((template) =>
      template.id === pending.templateId ? { ...template, folderId } : template,
    );
    return { ...library, sheetTemplates };
  }
  if (pending?.intent === 'updateDocument' && pending.changes.folderId !== undefined) {
    return {
      ...library,
      documents: library.documents?.map((document) =>
        document.id === pending.documentId
          ? { ...document, folderId: pending.changes.folderId ?? null }
          : document,
      ),
    };
  }
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
