import type { LibrarySceneDto, SceneFolderDto } from '@lorkarium/contracts';
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { FolderTree } from '@/lib/folder-tree';
import { LibraryTreeMenu, type TreeMaster } from './library-tree-menu';
import { NO_FOLDER } from './library-view';
import {
  ancestorKeysOf,
  expandableKeysOf,
  treeItemId,
  treeMove,
  visibleTreeItems,
  type VisibleTreeItem,
} from './tree-navigation';
import { NewFolderButton } from './tree-name-fields';
import {
  FolderItem,
  LooseItem,
  NewFolderEntry,
  type TreeContext,
  type TreeItemExtras,
} from './tree-rows';
import { useTreeEditing, type TreeEditingControls } from './use-tree-editing';

export type LibraryTree = FolderTree<SceneFolderDto, LibrarySceneDto>;

export type FolderTreeNavProps = Readonly<{
  /** The tree as shown: already filtered while `filtering`. */
  tree: LibraryTree;
  /** A search or filter is on: every folder left in the tree opens. */
  filtering: boolean;
  pickedKey: string | null;
  onPick: (key: string) => void;
  groupSceneId: string | null;
  playersOnline: number;
  now: Date;
  /** Said over the tree (the player's "nothing open yet"), or `null`. */
  notice: string | null;
  /** Said under the tree when the filter left nothing, or `null`. */
  emptyMessage: string | null;
  itemExtras?: TreeItemExtras;
  /** The master's menu, fields and "Nova pasta"; `null` for a player. */
  master: TreeMaster | null;
}>;

/** The library as a `role="tree"`: the nested folders with their grids and "Sem pasta". Arrows
 *  walk it (→ opens, ← closes or goes up), Enter or a click picks an item (and opens or closes
 *  a folder); the master's right click opens the menu of the item, or of the root.
 *
 *  Example: `<FolderTreeNav tree={tree} filtering={false} pickedKey={key} onPick={view.pick} … master={null} />` */
export function FolderTreeNav(props: FolderTreeNavProps): React.JSX.Element {
  const state = useTreeState(props);
  return (
    <div className="flex min-h-0 flex-col bg-panel">
      <TreeHeader master={props.master} onNewFolder={state.controls.startNewFolder} />
      {props.notice && <p className="px-5 pb-2 text-sm text-muted-foreground">{props.notice}</p>}
      <TreeArea master={props.master} controls={state.controls} focusItem={state.focusItem}>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <TreeList {...props} context={state.context} onKeyDown={state.onKeyDown} />
          {props.emptyMessage && (
            <p className="px-2 pt-3 text-sm text-muted-foreground">{props.emptyMessage}</p>
          )}
        </div>
      </TreeArea>
    </div>
  );
}

type TreeListProps = FolderTreeNavProps &
  Readonly<{ context: TreeContext; onKeyDown: (event: KeyboardEvent<HTMLUListElement>) => void }>;

function TreeList({ tree, filtering, context, onKeyDown }: TreeListProps): React.JSX.Element {
  return (
    <ul
      role="tree"
      aria-label="Grids e pastas"
      onKeyDown={onKeyDown}
      className="flex flex-col gap-0.5"
    >
      <NewFolderEntry context={context} parentId={null} />
      {tree.roots.map((node) => (
        <FolderItem key={node.folder.id} context={context} node={node} />
      ))}
      <li role="none" aria-hidden="true" className="mx-2 my-2 h-px bg-divider" />
      {(!filtering || tree.looseScenes.length > 0) && (
        <LooseItem context={context} scenes={tree.looseScenes} />
      )}
    </ul>
  );
}

type TreeState = Readonly<{
  context: TreeContext;
  controls: TreeEditingControls;
  focusItem: (key: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLUListElement>) => void;
}>;

function useTreeState(props: FolderTreeNavProps): TreeState {
  const baseId = useId();
  const [expanded, setExpanded] = useExpandedFolders(props);
  const items = visibleTreeItems(props.tree, expanded);
  const [focused, setFocused] = useState<string | null>(null);
  const focusItem = (key: string): void =>
    document.getElementById(treeItemId(baseId, key))?.focus();
  const editingControls = useTreeEditing(props.master?.submit ?? null, focusItem);
  const toggle = (key: string): void => setExpanded((open) => withKey(open, key, !open.has(key)));
  const activate = (key: string): void => {
    props.onPick(key);
    if (items.find((item) => item.key === key)?.hasChildren) toggle(key);
  };
  const controls: TreeEditingControls = {
    ...editingControls,
    startNewFolder: (parentId) => {
      if (parentId) setExpanded((open) => withKey(open, parentId, true));
      editingControls.startNewFolder(parentId);
    },
  };
  const context: TreeContext = {
    ...props,
    baseId,
    focusKey: focusableKey(items, focused, props.pickedKey),
    expanded,
    onActivate: activate,
    onToggle: toggle,
    onFocus: setFocused,
    editing: editingControls.editing,
  };
  const moves = { items, expanded, setExpanded, activate, focusItem };
  return { context, controls, focusItem, onKeyDown: (event) => onTreeKey(event, moves) };
}

type TreeMoves = Readonly<{
  items: readonly VisibleTreeItem[];
  expanded: ReadonlySet<string>;
  setExpanded: ExpandedFolders[1];
  activate: (key: string) => void;
  focusItem: (key: string) => void;
}>;

function onTreeKey(event: KeyboardEvent<HTMLUListElement>, moves: TreeMoves): void {
  const key = treeItemKeyOf(event.target);
  if (key === null) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    return moves.activate(key);
  }
  const move = treeMove(moves.items, key, event.key, moves.expanded);
  if (!move) return;
  event.preventDefault();
  if (move.kind === 'focus') moves.focusItem(move.key);
  else moves.setExpanded((open) => withKey(open, move.key, move.kind === 'expand'));
}

type TreeHeaderProps = Readonly<{
  master: TreeMaster | null;
  onNewFolder: (parentId: string | null) => void;
}>;

function TreeHeader({ master, onNewFolder }: TreeHeaderProps): React.JSX.Element {
  const start = (): void => {
    master?.resetFilter();
    onNewFolder(master?.newParentId ?? null);
  };
  return (
    <div className="flex h-12 shrink-0 items-center justify-between px-5">
      <span
        aria-hidden="true"
        className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase"
      >
        Grids e pastas
      </span>
      {master && <NewFolderButton live={master.live} onStart={start} />}
    </div>
  );
}

type TreeAreaProps = Readonly<{
  master: TreeMaster | null;
  controls: TreeEditingControls;
  focusItem: (key: string) => void;
  children: ReactNode;
}>;

// The master's tree takes the context menu; a player's is just the tree.
function TreeArea({ master, controls, focusItem, children }: TreeAreaProps): React.JSX.Element {
  if (!master) return <>{children}</>;
  return (
    <LibraryTreeMenu
      master={master}
      disabled={controls.active}
      startRename={controls.startRename}
      startNewFolder={controls.startNewFolder}
      focusItem={focusItem}
    >
      {children}
    </LibraryTreeMenu>
  );
}

type ExpandedFolders = readonly [
  ReadonlySet<string>,
  React.Dispatch<React.SetStateAction<ReadonlySet<string>>>,
];

// What the user expanded ("Sem pasta" starts open), plus what must show: the parents of the item
// picked each time it changes (a grid created in a closed folder), or every folder a search left.
function useExpandedFolders(props: FolderTreeNavProps): ExpandedFolders {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set([NO_FOLDER]));
  const reveal = props.filtering
    ? expandableKeysOf(props.tree)
    : ancestorKeysOf(props.tree, props.pickedKey ?? '');
  const revealKey = `${props.filtering ? 'filter' : props.pickedKey}:${reveal.join('/')}`;
  const [revealed, setRevealed] = useState('');
  if (revealed !== revealKey) {
    setRevealed(revealKey);
    if (reveal.length > 0) setExpanded((open) => new Set([...open, ...reveal]));
  }
  return [expanded, setExpanded];
}

// The item that takes Tab: the one last focused if it still shows, else the one picked, else the first.
function focusableKey(
  items: readonly VisibleTreeItem[],
  focused: string | null,
  pickedKey: string | null,
): string | null {
  const shows = (key: string | null): boolean => items.some((item) => item.key === key);
  if (shows(focused)) return focused;
  if (shows(pickedKey)) return pickedKey;
  return items[0]?.key ?? null;
}

// The keys of a field inside the tree (a name being typed) are the field's.
function treeItemKeyOf(target: EventTarget): string | null {
  if (!(target instanceof HTMLElement) || target.getAttribute('role') !== 'treeitem') return null;
  return target.dataset.treeKey ?? null;
}

function withKey(open: ReadonlySet<string>, key: string, on: boolean): ReadonlySet<string> {
  const next = new Set(open);
  if (on) next.add(key);
  else next.delete(key);
  return next;
}
