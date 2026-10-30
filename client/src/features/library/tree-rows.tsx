import {
  SCENE_FOLDER_NAME_MAX_LENGTH,
  SCENE_NAME_MAX_LENGTH,
  type SceneFolderDto,
} from '@lorkarium/contracts';
import {
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  LayoutGridIcon,
  ImageIcon,
  LockIcon,
  UsersIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { imageIdOf, type LibraryEntry } from '@/lib/library-entries';
import type { FolderNode } from '@/lib/folder-tree';
import { cn } from '@/lib/utils';
import { folderDescription, sceneDescription } from './library-messages';
import { NO_FOLDER, sceneIdOf, sceneKey } from './library-view';
import { NewNameEntry, RenameField } from './tree-name-fields';
import { treeItemId } from './tree-navigation';

type LibraryNode = FolderNode<SceneFolderDto, LibraryEntry>;

/** What a tree item adds for dragging (A17): its own props, given its key. */
export type TreeItemExtras = (key: string) => Readonly<Record<string, unknown>>;

/** The name fields open in the tree (the master's): renaming an item, or a new folder. */
export type TreeEditing = Readonly<{
  renamingKey: string | null;
  /** The folder the new folder's field sits in: `null` = the root, `undefined` = no field. */
  newFolderParent: string | null | undefined;
  onRename: (key: string, name: string) => void;
  onCreateFolder: (parentId: string | null, name: string) => void;
  /** A field closed; `refocusKey` = the item to give the focus back to. */
  onDone: (refocusKey: string | null) => void;
}>;

export type TreeContext = Readonly<{
  baseId: string;
  pickedKey: string | null;
  focusKey: string | null;
  expanded: ReadonlySet<string>;
  groupSceneId: string | null;
  playersOnline: number;
  now: Date;
  /** A click (or Enter) on an item: picks it, and opens or closes it when it can expand. */
  onActivate: (key: string) => void;
  onToggle: (key: string) => void;
  onFocus: (key: string) => void;
  itemExtras?: TreeItemExtras;
  editing: TreeEditing | null;
}>;

/** The field of a new folder, as the first line of where it goes.
 *
 *  Example: `<NewFolderEntry context={context} parentId={ato1Id} />` */
export function NewFolderEntry({
  context,
  parentId,
}: Readonly<{ context: TreeContext; parentId: string | null }>) {
  const editing = context.editing;
  if (!editing || editing.newFolderParent !== parentId) return null;
  return (
    <li role="none" className="px-2 py-1" onClick={(event) => event.stopPropagation()}>
      <NewNameEntry
        label="Nome da nova pasta"
        onSave={(name) => editing.onCreateFolder(parentId, name)}
        onCancel={() => editing.onDone(null)}
      />
    </li>
  );
}

/** A folder: its folders, then its grids, while it is expanded.
 *
 *  Example: `<FolderItem context={context} node={node} />` */
export function FolderItem({
  context,
  node,
}: Readonly<{ context: TreeContext; node: LibraryNode }>) {
  const key = node.folder.id;
  const expandable = node.children.length + node.scenes.length > 0;
  const open = expandable && context.expanded.has(key);
  const adding = context.editing?.newFolderParent === key;
  return (
    <TreeRow
      context={context}
      itemKey={key}
      label={node.folder.name}
      level={node.depth}
      description={folderDescription(node.sceneCount, node.holdsGroupGrid)}
      count={node.sceneCount}
      expanded={expandable ? open : undefined}
      icon={open ? <FolderOpenIcon aria-hidden="true" /> : <FolderIcon aria-hidden="true" />}
    >
      {(open || adding) && (
        <ul role="group" className="flex flex-col gap-0.5">
          <NewFolderEntry context={context} parentId={key} />
          {open &&
            node.children.map((child) => (
              <FolderItem key={child.folder.id} context={context} node={child} />
            ))}
          {open && <SceneItems context={context} scenes={node.scenes} level={node.depth + 1} />}
        </ul>
      )}
    </TreeRow>
  );
}

/** "Sem pasta", with the grids that have no folder while it is expanded.
 *
 *  Example: `<LooseItem context={context} scenes={tree.looseScenes} />` */
export function LooseItem({
  context,
  scenes,
}: Readonly<{ context: TreeContext; scenes: readonly LibraryEntry[] }>) {
  const expandable = scenes.length > 0;
  const open = expandable && context.expanded.has(NO_FOLDER);
  const groupHere = scenes.some(({ id }) => id === context.groupSceneId);
  return (
    <TreeRow
      context={context}
      itemKey={NO_FOLDER}
      label="Sem pasta"
      level={1}
      description={folderDescription(scenes.length, groupHere)}
      count={scenes.length}
      expanded={expandable ? open : undefined}
      icon={<FolderIcon aria-hidden="true" className="opacity-60" />}
    >
      {open && (
        <ul role="group" className="flex flex-col gap-0.5">
          <SceneItems context={context} scenes={scenes} level={2} />
        </ul>
      )}
    </TreeRow>
  );
}

type SceneItemsProps = Readonly<{
  context: TreeContext;
  scenes: readonly LibraryEntry[];
  level: number;
}>;

function SceneItems({ context, scenes, level }: SceneItemsProps): React.JSX.Element {
  return (
    <>
      {scenes.map((scene) => {
        const image = 'asset' in scene;
        const isGroupGrid = !image && scene.id === context.groupSceneId;
        return (
          <TreeRow
            key={scene.id}
            context={context}
            itemKey={sceneKey(scene.id)}
            label={scene.name}
            level={level}
            description={
              image
                ? `Imagem · ${scene.visibility === 'public' ? 'Público' : 'Privado'}`
                : `Grid · ${sceneDescription(scene, context.now, isGroupGrid, context.playersOnline)}`
            }
            live={isGroupGrid}
            isPrivate={scene.visibility === 'private'}
            icon={image ? <ImageIcon aria-hidden="true" /> : <LayoutGridIcon aria-hidden="true" />}
          />
        );
      })}
    </>
  );
}

type TreeRowProps = Readonly<{
  context: TreeContext;
  itemKey: string;
  label: string;
  level: number;
  description: string;
  icon: ReactNode;
  /** The grid count of a folder; a grid has none. */
  count?: number;
  /** The group grid: marked with the people icon. */
  live?: boolean;
  isPrivate?: boolean;
  /** `undefined` for an item that cannot expand (a grid, an empty folder). */
  expanded?: boolean;
  children?: ReactNode;
}>;

function TreeRow(props: TreeRowProps): React.JSX.Element {
  const { context, itemKey } = props;
  const id = treeItemId(context.baseId, itemKey);
  const renaming = context.editing?.renamingKey === itemKey;
  return (
    <li
      role="treeitem"
      id={id}
      data-tree-key={itemKey}
      aria-label={props.label}
      aria-level={props.level}
      aria-describedby={`${id}-description`}
      aria-selected={context.pickedKey === itemKey}
      aria-expanded={props.expanded}
      tabIndex={context.focusKey === itemKey ? 0 : -1}
      onFocus={(event) => event.target === event.currentTarget && context.onFocus(itemKey)}
      onClick={(event) => {
        event.stopPropagation();
        context.onActivate(itemKey);
        context.onFocus(itemKey);
      }}
      className="rounded-md outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
      {...(renaming ? {} : context.itemExtras?.(itemKey))}
    >
      <TreeRowLine {...props} id={id} renaming={renaming} />
      {props.children}
    </li>
  );
}

type TreeRowLineProps = TreeRowProps & Readonly<{ id: string; renaming: boolean }>;

function TreeRowLine(props: TreeRowLineProps): React.JSX.Element {
  const selected = props.context.pickedKey === props.itemKey;
  return (
    <div
      style={{ paddingLeft: `${(props.level - 1) * 14 + 8}px` }}
      className={cn(
        'flex h-9 items-center gap-2 rounded-md pr-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-4 [&_svg]:shrink-0',
        selected && 'bg-muted text-foreground [&_svg]:text-primary',
      )}
    >
      <Chevron {...props} />
      {props.icon}
      {props.renaming ? <ItemRename {...props} /> : <ItemName {...props} />}
      <span id={`${props.id}-description`} className="sr-only">
        {props.description}
      </span>
    </div>
  );
}

function Chevron({ expanded, context, itemKey }: TreeRowLineProps): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="flex w-4 justify-center"
      onClick={(event) => {
        if (expanded === undefined) return;
        event.stopPropagation();
        context.onToggle(itemKey);
      }}
    >
      {expanded !== undefined && (
        <ChevronRightIcon
          className={cn(
            'transition-transform motion-reduce:transition-none',
            expanded && 'rotate-90',
          )}
        />
      )}
    </span>
  );
}

function ItemName(props: TreeRowLineProps): React.JSX.Element {
  return (
    <>
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      {props.isPrivate && <LockIcon aria-hidden="true" className="opacity-50" />}
      {props.live && <UsersIcon aria-hidden="true" className="text-primary" />}
      {props.count !== undefined && (
        <span aria-hidden="true" className="text-xs text-muted-foreground tabular-nums">
          {props.count}
        </span>
      )}
    </>
  );
}

function ItemRename({ context, itemKey, label }: TreeRowLineProps): React.JSX.Element | null {
  const editing = context.editing;
  if (!editing) return null;
  const isScene = sceneIdOf(itemKey) !== null;
  return (
    <span className="min-w-0 flex-1">
      <RenameField
        label={imageIdOf(itemKey) ? 'Nome da imagem' : isScene ? 'Nome do grid' : 'Nome da pasta'}
        confirmed={label}
        maxLength={
          isScene || imageIdOf(itemKey) ? SCENE_NAME_MAX_LENGTH : SCENE_FOLDER_NAME_MAX_LENGTH
        }
        onSave={(name) => editing.onRename(itemKey, name)}
        onDone={(byKey) => editing.onDone(byKey ? itemKey : null)}
      />
    </span>
  );
}
