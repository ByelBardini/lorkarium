import { useState } from 'react';
import {
  documentIdOf,
  imageIdOf,
  type MixedLibrary,
  type LibraryTypeFilter,
} from '@/lib/library-entries';
import type { LibraryContents, TreeFolder, TreeScene, VisibilityFilter } from '@/lib/folder-tree';

/** The tree item of the grids without folder; a folder's item is its id. */
export const NO_FOLDER = 'loose';

const SCENE_KEY_PREFIX = 'scene:';

/** The tree item of a grid (apart from the folder ids, which are the folders' items).
 *
 *  Example: `sceneKey(ossuarioId) // 'scene:0a1b…'` */
export function sceneKey(sceneId: string): string {
  return sceneId.startsWith('image:') || sceneId.startsWith('document:')
    ? sceneId
    : `${SCENE_KEY_PREFIX}${sceneId}`;
}

/** The grid of a tree item, or `null` for a folder, "Sem pasta" or nothing.
 *
 *  Example: `sceneIdOf(sceneKey(ossuarioId)) // ossuarioId` */
export function sceneIdOf(key: string | null): string | null {
  if (!key?.startsWith(SCENE_KEY_PREFIX)) return null;
  return key.slice(SCENE_KEY_PREFIX.length);
}

/** Where a "Novo grid" or "Nova pasta" of the header goes for the item picked: inside the
 *  folder picked, in the folder of the grid picked, or at the root.
 *
 *  Example: `folderForNew(library, sceneKey(ossuarioId)) // catacumbasId` */
export function folderForNew(
  library: LibraryContents<TreeFolder, TreeScene> &
    Partial<Pick<MixedLibrary, 'images' | 'documents'>>,
  key: string | null,
): string | null {
  const documentId = documentIdOf(key);
  if (documentId) return library.documents?.find(({ id }) => id === documentId)?.folderId ?? null;
  const imageId = imageIdOf(key);
  if (imageId) return library.images?.find(({ id }) => id === imageId)?.folderId ?? null;
  const sceneId = sceneIdOf(key);
  if (sceneId) return library.scenes.find(({ id }) => id === sceneId)?.folderId ?? null;
  return library.folders.some(({ id }) => id === key) ? key : null;
}

/** What the library shows right now; nothing of it goes to the server. */
export type LibraryView = Readonly<{
  /** The tree item picked: a folder id, `NO_FOLDER`, a `sceneKey` or nothing. */
  pickedKey: string | null;
  query: string;
  visibility: VisibilityFilter;
  type: LibraryTypeFilter;
  filterType: (type: LibraryTypeFilter) => void;
  pick: (key: string | null) => void;
  search: (query: string) => void;
  filter: (visibility: VisibilityFilter) => void;
}>;

/** The local state of the library: the item picked in the tree, the search and the filter.
 *
 *  Example: `const view = useLibraryView(); view.pick(sceneKey(ossuarioId))` */
export function useLibraryView(): LibraryView {
  const [pickedKey, pick] = useState<string | null>(null);
  const [query, search] = useState('');
  const [visibility, filter] = useState<VisibilityFilter>('all');
  const [type, filterType] = useState<LibraryTypeFilter>('all');
  return { pickedKey, query, visibility, pick, search, filter, type, filterType };
}
