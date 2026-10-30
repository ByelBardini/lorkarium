import type { FolderNode, FolderTree, TreeFolder, TreeScene } from '@/lib/folder-tree';
import { imageIdOf } from '@/lib/library-entries';
import { NO_FOLDER, sceneIdOf, sceneKey } from './library-view';

/** One item the tree shows now, in the order the arrows walk them. */
export type VisibleTreeItem = Readonly<{
  key: string;
  parentKey: string | null;
  hasChildren: boolean;
}>;

/** The DOM id of a tree item, for moving the focus to it.
 *
 *  Example: `document.getElementById(treeItemId(baseId, ato1Id))?.focus()` */
export function treeItemId(baseId: string, key: string): string {
  return `${baseId}-item-${key}`;
}

function sceneItems(scenes: readonly TreeScene[], parentKey: string): VisibleTreeItem[] {
  return scenes.map(({ id }) => ({ key: sceneKey(id), parentKey, hasChildren: false }));
}

function visibleFolders<F extends TreeFolder, S extends TreeScene>(
  nodes: readonly FolderNode<F, S>[],
  parentKey: string | null,
  expanded: ReadonlySet<string>,
): VisibleTreeItem[] {
  return nodes.flatMap((node) => {
    const key = node.folder.id;
    const item = { key, parentKey, hasChildren: node.children.length + node.scenes.length > 0 };
    if (!expanded.has(key)) return [item];
    return [item, ...visibleFolders(node.children, key, expanded), ...sceneItems(node.scenes, key)];
  });
}

/** The folders above the tree item `key`, from the root down: what must be expanded for it to
 *  show. A grid without folder is under `NO_FOLDER`; empty for a root folder, "Sem pasta" or a
 *  key the tree does not have.
 *
 *  Example: `ancestorKeysOf(tree, sceneKey(ossuarioId)) // [ato1Id, catacumbasId]` */
export function ancestorKeysOf<F extends TreeFolder, S extends TreeScene>(
  tree: FolderTree<F, S>,
  key: string,
): string[] {
  const sceneId = imageIdOf(key) ? key : sceneIdOf(key);
  if (!sceneId) return pathTo(tree.roots, (node) => node.folder.id === key)?.slice(0, -1) ?? [];
  if (tree.looseScenes.some(({ id }) => id === sceneId)) return [NO_FOLDER];
  return pathTo(tree.roots, (node) => node.scenes.some(({ id }) => id === sceneId)) ?? [];
}

function pathTo<F extends TreeFolder, S extends TreeScene>(
  nodes: readonly FolderNode<F, S>[],
  isEnd: (node: FolderNode<F, S>) => boolean,
): string[] | null {
  for (const node of nodes) {
    if (isEnd(node)) return [node.folder.id];
    const below = pathTo(node.children, isEnd);
    if (below) return [node.folder.id, ...below];
  }
  return null;
}

/** Every item of the tree that can expand: each folder and "Sem pasta" (a search opens them all).
 *
 *  Example: `expandableKeysOf(tree) // [ato1Id, catacumbasId, NO_FOLDER]` */
export function expandableKeysOf<F extends TreeFolder, S extends TreeScene>(
  tree: FolderTree<F, S>,
): string[] {
  const walk = (nodes: readonly FolderNode<F, S>[]): string[] =>
    nodes.flatMap((node) => [node.folder.id, ...walk(node.children)]);
  return [...walk(tree.roots), NO_FOLDER];
}

/** The items of the tree from top to bottom: the folders (inside the expanded ones, their
 *  folders and then their grids) and "Sem pasta" with its grids.
 *
 *  Example: `visibleTreeItems(tree, new Set([ato1Id])).map(({ key }) => key)` */
export function visibleTreeItems<F extends TreeFolder, S extends TreeScene>(
  tree: FolderTree<F, S>,
  expanded: ReadonlySet<string>,
): VisibleTreeItem[] {
  const loose = { key: NO_FOLDER, parentKey: null, hasChildren: tree.looseScenes.length > 0 };
  const looseInside = expanded.has(NO_FOLDER) ? sceneItems(tree.looseScenes, NO_FOLDER) : [];
  return [...visibleFolders(tree.roots, null, expanded), loose, ...looseInside];
}

/** What an arrow key does on a tree item (the WAI-ARIA tree pattern). */
export type TreeMove =
  | Readonly<{ kind: 'focus'; key: string }>
  | Readonly<{ kind: 'expand' | 'collapse'; key: string }>
  | null;

function stepped(items: readonly VisibleTreeItem[], index: number, step: number): TreeMove {
  const next = items[index + step];
  return next ? { kind: 'focus', key: next.key } : null;
}

function sideways(
  items: readonly VisibleTreeItem[],
  item: VisibleTreeItem,
  key: string,
  expanded: ReadonlySet<string>,
): TreeMove {
  const open = item.hasChildren && expanded.has(item.key);
  if (key === 'ArrowRight') {
    if (!item.hasChildren) return null;
    if (!open) return { kind: 'expand', key: item.key };
    return stepped(items, items.indexOf(item), 1);
  }
  if (open) return { kind: 'collapse', key: item.key };
  return item.parentKey ? { kind: 'focus', key: item.parentKey } : null;
}

/** The move for `key` on the focused item; `null` = the key does nothing here.
 *
 *  Example: `treeMove(items, ato1Id, 'ArrowRight', expanded) // { kind: 'expand', key: ato1Id }` */
export function treeMove(
  items: readonly VisibleTreeItem[],
  focusedKey: string,
  key: string,
  expanded: ReadonlySet<string>,
): TreeMove {
  const index = items.findIndex((item) => item.key === focusedKey);
  const item = items[index];
  if (!item) return null;
  if (key === 'ArrowDown') return stepped(items, index, 1);
  if (key === 'ArrowUp') return stepped(items, index, -1);
  if (key === 'Home') return stepped(items, -1, 1);
  if (key === 'End') return stepped(items, items.length, -1);
  if (key === 'ArrowRight' || key === 'ArrowLeft') return sideways(items, item, key, expanded);
  return null;
}
