import type { SceneFolderDto } from '@lorkarium/contracts';
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { LibraryEntry } from '@/lib/library-entries';
import type { FolderTree } from '@/lib/folder-tree';
import { LibraryTreeMenu, type TreeMaster } from './library-tree-menu';
import {
  ancestorKeysOf,
  expandableKeysOf,
  isLeafKey,
  treeItemId,
  treeMove,
  visibleTreeItems,
  type VisibleTreeItem,
} from './tree-navigation';
import { FolderItem, SceneItems, type TreeContext, type TreeItemExtras } from './tree-rows';
import { useTreeEditing, type TreeEditingControls } from './use-tree-editing';

export type LibraryTree = FolderTree<SceneFolderDto, LibraryEntry>;

export type FolderTreeNavProps = Readonly<{
  /** The tree as shown: already filtered while `filtering`. */
  tree: LibraryTree;
  /** A search or filter is on: every folder left in the tree opens. */
  filtering: boolean;
  pickedKey: string | null;
  onPick: (key: string) => void;
  /** A double click or Enter on an item (not a folder): opens it in the room. */
  onOpen?: (key: string) => void;
  groupSceneId: string | null;
  playersOnline: number;
  now: Date;
  /** Said over the tree (the player's "nothing open yet"), or `null`. */
  notice: string | null;
  /** Said under the tree when the filter left nothing, or `null`. */
  emptyMessage: string | null;
  itemExtras?: TreeItemExtras;
  /** The master's menu and fields; `null` for a player. */
  master: TreeMaster | null;
  /** Drops onto the root (the empty area, or an item without folder): out of any folder. */
  rootDropProps?: Readonly<Record<string, unknown>>;
}>;

/** The library as a `role="tree"`: the nested folders, then the items without folder. Arrows
 *  walk it (→ opens, ← closes or goes up); a click or Space picks an item (and opens or closes a
 *  folder); a double click or Enter on an item opens it (`onOpen`), Enter on a folder is a click;
 *  the master's right click opens the menu of the item, or of the root.
 *
 *  Example: `<FolderTreeNav tree={tree} filtering={false} pickedKey={key} onPick={view.pick} … master={null} />` */
export function FolderTreeNav(props: FolderTreeNavProps): React.JSX.Element {
  const state = useTreeState(props);
  return (
    <div className="flex min-h-0 flex-1 flex-col pt-2">
      {props.notice && <p className="px-5 py-2 text-sm text-muted-foreground">{props.notice}</p>}
      <TreeArea master={props.master} controls={state.controls} focusItem={state.focusItem}>
        <div {...props.rootDropProps} className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
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

function TreeList({ tree, context, onKeyDown }: TreeListProps): React.JSX.Element {
  return (
    <ul
      role="tree"
      aria-label="Itens e pastas"
      onKeyDown={onKeyDown}
      className="flex flex-col gap-0.5"
    >
      {tree.roots.map((node) => (
        <FolderItem key={node.folder.id} context={context} node={node} />
      ))}
      <SceneItems context={context} scenes={tree.looseScenes} level={1} />
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
  const open = (key: string): void => {
    activate(key);
    props.onOpen?.(key);
  };
  const moves = { items, expanded, setExpanded, activate, open, focusItem };
  return {
    context,
    controls: editingControls,
    focusItem,
    onKeyDown: (event) => onTreeKey(event, moves),
  };
}

type TreeMoves = Readonly<{
  items: readonly VisibleTreeItem[];
  expanded: ReadonlySet<string>;
  setExpanded: ExpandedFolders[1];
  activate: (key: string) => void;
  open: (key: string) => void;
  focusItem: (key: string) => void;
}>;

function onTreeKey(event: KeyboardEvent<HTMLUListElement>, moves: TreeMoves): void {
  const key = treeItemKeyOf(event.target);
  if (key === null) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    return event.key === 'Enter' && isLeafKey(key) ? moves.open(key) : moves.activate(key);
  }
  const move = treeMove(moves.items, key, event.key, moves.expanded);
  if (!move) return;
  event.preventDefault();
  if (move.kind === 'focus') moves.focusItem(move.key);
  else moves.setExpanded((open) => withKey(open, move.key, move.kind === 'expand'));
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

// What the user expanded, plus what must show: the parents of the item
// picked each time it changes (a grid created in a closed folder), or every folder a search left.
function useExpandedFolders(props: FolderTreeNavProps): ExpandedFolders {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
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
