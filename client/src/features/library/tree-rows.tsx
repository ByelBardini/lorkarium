import {
  MAP_NAME_MAX_LENGTH,
  SCENE_FOLDER_NAME_MAX_LENGTH,
  SCENE_NAME_MAX_LENGTH,
  SHEET_NAME_MAX_LENGTH,
  type LibrarySceneDto,
  type SceneFolderDto,
} from '@lorkarium/contracts';
import {
  ChevronRightIcon,
  LayoutGridIcon,
  ImageIcon,
  FileTextIcon,
  FileCode2Icon,
  MapIcon,
  ScrollTextIcon,
  StarIcon,
  UsersIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import {
  documentIdOf,
  imageIdOf,
  mapIdOf,
  sheetIdOf,
  type LibraryEntry,
  type MapEntry,
} from '@/lib/library-entries';
import type { FolderNode } from '@/lib/folder-tree';
import { cn } from '@/lib/utils';
import { folderDescription, sceneDescription } from './library-messages';
import { sceneIdOf, sceneKey } from './library-view';
import { HiddenItemSeal, TreeFolderIcon } from './tree-icons';
import { RenameField } from './tree-name-fields';
import { treeItemId } from './tree-navigation';

type LibraryNode = FolderNode<SceneFolderDto, LibraryEntry>;

/** What a tree item adds for dragging (A17): its own props, given its key. */
export type TreeItemExtras = (key: string) => Readonly<Record<string, unknown>>;

/** The name field open in the tree (the master's): renaming an item. */
export type TreeEditing = Readonly<{
  renamingKey: string | null;
  onRename: (key: string, name: string) => void;
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
  /** A click (or Space; Enter on a folder) on an item: picks it, and opens or closes it when it
   *  can expand. */
  onActivate: (key: string) => void;
  /** A double click on an item (not a folder): opens it in the room. */
  onOpen?: (key: string) => void;
  onToggle: (key: string) => void;
  onFocus: (key: string) => void;
  itemExtras?: TreeItemExtras;
  editing: TreeEditing | null;
}>;

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
  return (
    <TreeRow
      context={context}
      itemKey={key}
      label={node.folder.name}
      level={node.depth}
      description={folderLine(node)}
      count={node.sceneCount}
      expanded={expandable ? open : undefined}
      icon={
        node.folder.visibility === 'private' ? (
          <HiddenItemSeal>
            <TreeFolderIcon open={open} />
          </HiddenItemSeal>
        ) : (
          <TreeFolderIcon open={open} />
        )
      }
    >
      {open && (
        <ul role="group" className="flex flex-col gap-0.5">
          {node.children.map((child) => (
            <FolderItem key={child.folder.id} context={context} node={child} />
          ))}
          <SceneItems context={context} scenes={node.scenes} level={node.depth + 1} />
        </ul>
      )}
    </TreeRow>
  );
}

function folderLine(node: LibraryNode): string {
  const line = folderDescription(node.sceneCount, node.holdsGroupGrid);
  return node.folder.visibility === 'private' ? `${line} · privada` : line;
}

type SceneItemsProps = Readonly<{
  context: TreeContext;
  scenes: readonly LibraryEntry[];
  level: number;
}>;

/** The items (grids, images, maps…) of one level: a folder's, or those without folder at the root.
 *
 *  Example: `<SceneItems context={context} scenes={tree.looseScenes} level={1} />` */
export function SceneItems({ context, scenes, level }: SceneItemsProps): React.JSX.Element {
  return (
    <>
      {scenes.map((scene) => {
        const look = entryLookOf(scene, context);
        return (
          <TreeRow
            key={scene.id}
            context={context}
            itemKey={sceneKey(scene.id)}
            label={scene.name}
            level={level}
            description={look.description}
            live={look.isGroupGrid}
            mainMap={look.isMainMap}
            leaf
            icon={
              look.showsHiddenSeal && scene.visibility === 'private' ? (
                <HiddenItemSeal>{look.icon}</HiddenItemSeal>
              ) : (
                look.icon
              )
            }
          />
        );
      })}
    </>
  );
}

type EntryLook = Readonly<{
  description: string;
  icon: ReactNode;
  isGroupGrid: boolean;
  isMainMap?: boolean;
  /** Templates and sheets say who sees them in the description, without the seal. */
  showsHiddenSeal: boolean;
}>;

function entryLookOf(entry: LibraryEntry, context: TreeContext): EntryLook {
  const shown = entry.visibility === 'public' ? 'Público' : 'Privado';
  const look = (description: string, icon: ReactNode, showsHiddenSeal = true): EntryLook => ({
    description,
    icon,
    isGroupGrid: false,
    showsHiddenSeal,
  });
  if ('kind' in entry && entry.kind === 'map') return mapLookOf(entry, shown);
  if ('kind' in entry && entry.kind === 'sheet')
    return look(entry.holderLabel, <ScrollTextIcon aria-hidden="true" />, false);
  if ('kind' in entry && entry.kind === 'sheet-template')
    return look('Modelo de ficha · só mestres', <FileCode2Icon aria-hidden="true" />, false);
  if ('kind' in entry && entry.kind === 'document')
    return look(`Documento · ${shown}`, <FileTextIcon aria-hidden="true" />);
  if ('asset' in entry) return look(`Imagem · ${shown}`, <ImageIcon aria-hidden="true" />);
  return gridLookOf(entry, context);
}

function mapLookOf(map: MapEntry, shown: string): EntryLook {
  return {
    description: `Mapa · ${shown}${map.isMain ? ' · Principal' : ''}`,
    icon: <MapIcon aria-hidden="true" />,
    isGroupGrid: false,
    isMainMap: map.isMain,
    showsHiddenSeal: true,
  };
}

function gridLookOf(scene: LibrarySceneDto, context: TreeContext): EntryLook {
  const isGroupGrid = scene.id === context.groupSceneId;
  const meta = sceneDescription(scene, context.now, isGroupGrid, context.playersOnline);
  return {
    description: `Grid · ${meta}`,
    icon: <LayoutGridIcon aria-hidden="true" />,
    isGroupGrid,
    showsHiddenSeal: true,
  };
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
  /** The table's main map: marked with the star. */
  mainMap?: boolean;
  /** `undefined` for an item that cannot expand (a grid, an empty folder). */
  expanded?: boolean;
  /** An item, not a folder: a double click opens it. */
  leaf?: boolean;
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
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (props.leaf && !renaming) context.onOpen?.(itemKey);
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
        'flex h-9 items-center gap-2 rounded-md pr-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-5 [&_svg]:shrink-0',
        selected &&
          'bg-primary/10 text-foreground shadow-[inset_2px_0_var(--color-primary)] hover:bg-primary/15 [&_svg]:text-primary',
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
      className="flex w-5 justify-center"
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
      {props.mainMap && <StarIcon aria-hidden="true" className="text-primary" />}
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
  const field = renameFieldOf(itemKey);
  return (
    <span className="min-w-0 flex-1">
      <RenameField
        label={field.label}
        confirmed={label}
        maxLength={field.maxLength}
        onSave={(name) => editing.onRename(itemKey, name)}
        onDone={(byKey) => editing.onDone(byKey ? itemKey : null)}
      />
    </span>
  );
}

function renameFieldOf(itemKey: string): Readonly<{ label: string; maxLength: number }> {
  if (mapIdOf(itemKey)) return { label: 'Nome do mapa', maxLength: MAP_NAME_MAX_LENGTH };
  if (sheetIdOf(itemKey)) return { label: 'Nome da ficha', maxLength: SHEET_NAME_MAX_LENGTH };
  if (documentIdOf(itemKey))
    return { label: 'Nome do documento', maxLength: SCENE_FOLDER_NAME_MAX_LENGTH };
  if (imageIdOf(itemKey)) return { label: 'Nome da imagem', maxLength: SCENE_NAME_MAX_LENGTH };
  if (sceneIdOf(itemKey)) return { label: 'Nome do grid', maxLength: SCENE_NAME_MAX_LENGTH };
  return { label: 'Nome da pasta', maxLength: SCENE_FOLDER_NAME_MAX_LENGTH };
}
