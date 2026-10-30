import { SCENE_FOLDER_DEPTH_MAX } from '@lorkarium/contracts';
import { searchText } from '@/lib/search-text';

/** The least a folder needs to sit in the tree (`parentId: null` = the root). */
export type TreeFolder = Readonly<{ id: string; name: string; parentId: string | null }>;

/** The least a grid needs to sit in the tree (`folderId: null` = "Sem pasta"). */
export type TreeScene = Readonly<{
  id: string;
  name: string;
  folderId: string | null;
  visibility: 'public' | 'private';
}>;

export type LibraryContents<F extends TreeFolder, S extends TreeScene> = Readonly<{
  folders: readonly F[];
  scenes: readonly S[];
}>;

/** One folder of the sidebar: a root folder has `depth` 1; `sceneCount` adds the descendants;
 *  `holdsGroupGrid` lights the "No ar" dot on the group grid's folder and its ancestors. */
export type FolderNode<F extends TreeFolder, S extends TreeScene> = Readonly<{
  folder: F;
  depth: number;
  children: readonly FolderNode<F, S>[];
  scenes: readonly S[];
  sceneCount: number;
  holdsGroupGrid: boolean;
}>;

export type FolderTree<F extends TreeFolder, S extends TreeScene> = Readonly<{
  roots: readonly FolderNode<F, S>[];
  looseScenes: readonly S[];
}>;

/** `'all'` keeps both; the others keep only that visibility. */
export type VisibilityFilter = 'all' | TreeScene['visibility'];

/** The search box and the visibility filter of the library. */
export type LibraryFilter = Readonly<{
  query: string;
  visibility: VisibilityFilter;
  active?: boolean;
}>;

export type LibraryDragged = Readonly<{ kind: 'folder' | 'scene'; id: string }>;

function groupedBy<T>(
  items: readonly T[],
  keyOf: (item: T) => string | null,
): Map<string | null, T[]> {
  const groups = new Map<string | null, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

type TreeIndex<F extends TreeFolder, S extends TreeScene> = Readonly<{
  childrenOf: Map<string | null, F[]>;
  scenesOf: Map<string | null, S[]>;
  groupSceneId: string | null;
}>;

function folderNodeOf<F extends TreeFolder, S extends TreeScene>(
  index: TreeIndex<F, S>,
  folder: F,
  depth: number,
): FolderNode<F, S> {
  const children = (index.childrenOf.get(folder.id) ?? []).map((child) =>
    folderNodeOf(index, child, depth + 1),
  );
  const scenes = index.scenesOf.get(folder.id) ?? [];
  const holdsGroupGrid =
    scenes.some(({ id }) => id === index.groupSceneId) ||
    children.some((child) => child.holdsGroupGrid);
  const sceneCount = scenes.length + children.reduce((sum, child) => sum + child.sceneCount, 0);
  return { folder, depth, children, scenes, sceneCount, holdsGroupGrid };
}

/** The sidebar tree, folders and grids in the order they come (the server's creation order).
 *
 *  Example: `folderTreeOf(library, activeSceneId).roots[0]?.sceneCount` */
export function folderTreeOf<F extends TreeFolder, S extends TreeScene>(
  library: LibraryContents<F, S>,
  groupSceneId: string | null,
): FolderTree<F, S> {
  const index: TreeIndex<F, S> = {
    childrenOf: groupedBy(library.folders, ({ parentId }) => parentId),
    scenesOf: groupedBy(library.scenes, ({ folderId }) => folderId),
    groupSceneId,
  };
  const roots = (index.childrenOf.get(null) ?? []).map((folder) => folderNodeOf(index, folder, 1));
  return { roots, looseScenes: index.scenesOf.get(null) ?? [] };
}

// The folder and its ancestors up to the root; a visited id ends a corrupt loop.
function chainOf<F extends TreeFolder>(folders: readonly F[], folderId: string | null): F[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const chain: F[] = [];
  for (let folder = byId.get(folderId ?? ''); folder && !chain.includes(folder);) {
    chain.push(folder);
    folder = byId.get(folder.parentId ?? '');
  }
  return chain;
}

// The level of each folder of the subtree, the root of it being level 1.
function subtreeLevels(folders: readonly TreeFolder[], folderId: string): Map<string, number> {
  const childrenOf = groupedBy(folders, ({ parentId }) => parentId);
  const levels = new Map<string, number>([[folderId, 1]]);
  for (const [id, level] of levels) {
    for (const child of childrenOf.get(id) ?? []) {
      if (!levels.has(child.id)) levels.set(child.id, level + 1);
    }
  }
  return levels;
}

/** Whether the search or the filter is narrowing the library.
 *
 *  Example: `isFiltering({ query: ' ', visibility: 'all' }) // false` */
export function isFiltering(filter: LibraryFilter): boolean {
  return filter.active === true || filter.query.trim() !== '' || filter.visibility !== 'all';
}

/** The tree the library shows: with a query (no accent, no case) or a visibility filter, only
 *  the grids that match and the folders above them; otherwise the whole tree, empty folders too.
 *
 *  Example: `filteredTreeOf(library, activeSceneId, { query: 'ossuario', visibility: 'all' })` */
export function filteredTreeOf<F extends TreeFolder, S extends TreeScene>(
  library: LibraryContents<F, S>,
  groupSceneId: string | null,
  filter: LibraryFilter,
): FolderTree<F, S> {
  if (!isFiltering(filter)) return folderTreeOf(library, groupSceneId);
  const needle = searchText(filter.query.trim());
  const scenes = library.scenes.filter(
    (scene) =>
      (filter.visibility === 'all' || scene.visibility === filter.visibility) &&
      searchText(scene.name).includes(needle),
  );
  const above = new Set(scenes.flatMap(({ folderId }) => chainOf(library.folders, folderId)));
  const folders = library.folders.filter((folder) => above.has(folder));
  return folderTreeOf({ folders, scenes }, groupSceneId);
}

/** Whether `dragged` may land in `targetFolderId` (`null` = the root / "Sem pasta"): the same
 *  rule as the server's `SceneLibraryBo.requireMove`, for the "can't drop" cursor. A grid fits
 *  anywhere; a folder never enters its own subtree nor pushes it past `maxFolderDepth` levels.
 *
 *  Example: `canDrop(folders, { kind: 'folder', id: ato1Id }, masmorraId) // false: own child` */
export function canDrop(
  folders: readonly TreeFolder[],
  dragged: LibraryDragged,
  targetFolderId: string | null,
  maxFolderDepth: number = SCENE_FOLDER_DEPTH_MAX,
): boolean {
  if (dragged.kind === 'scene') return true;
  const subtree = subtreeLevels(folders, dragged.id);
  if (targetFolderId !== null && subtree.has(targetFolderId)) return false;
  const height = Math.max(...subtree.values());
  return chainOf(folders, targetFolderId).length + height <= maxFolderDepth;
}
