import { useMemo, useRef, type ReactNode } from 'react';
import {
  ChevronDownIcon,
  FileCode2Icon,
  FileTextIcon,
  MapIcon,
  ScrollTextIcon,
  XIcon,
} from 'lucide-react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { roomTabOrder } from '@/lib/room-tab-order';
import { splitTabsToFit, tabsThatFit } from '@/lib/tab-overflow';
import { useElementWidth } from '@/lib/use-element-width';
import { cn } from '@/lib/utils';
import { useBoard } from '@/stores/board-store';
import {
  useDocumentWorkspaceSlice,
  workspaceItemName,
  workspaceItemTitle,
  type DocumentWorkspaceStore,
  type WorkspaceItem,
} from '@/stores/document-workspace-store';
import {
  GROUP_TAB,
  useSceneTabs,
  type SceneTab,
  type SceneTabsStore,
} from '@/stores/scene-tabs-store';
import { tabbedWorkspaceItems, useRoomTabOrderSync } from './room-tab-items';
import { ROOM_TAB_ATTRIBUTE, useRoomTabDrag, type RoomTabDropSide } from './use-room-tab-drag';
import { useRoomTabMoves } from './use-room-tab-moves';

export type SceneTabsProps = Readonly<{
  tabs: StoreApi<SceneTabsStore>;
  documents?: StoreApi<DocumentWorkspaceStore>;
  campaignId?: string;
  /** The workspace key of the viewer's main sheet: like the main map, it gets no tab (its
   *  button beside the table's name plays it). */
  mainSheetKey?: string | null;
}>;
// `never[]` fits every list of the workspace, each read with its own type.
const NO_ITEMS: readonly never[] = [];

const LOADING_NAME = 'Carregando…';

/** One tab of the strip: a grid's or a workspace item's. */
type StripTab =
  | Readonly<{ key: string; kind: 'scene'; tab: SceneTab }>
  | Readonly<{ key: string; kind: 'item'; item: WorkspaceItem }>;

/** The strip of open tabs at the top of the room, in the order they were opened, grids and
 *  workspace items mixed: the group grid's first (marked "Grupo", never closed nor moved), then
 *  the others, each with its close. A tab is dragged to another place, or moved by Ctrl+Shift+←/→;
 *  the bare arrows move the focus and Enter shows the focused tab. The notice of the tabs (an
 *  activation, a tab closed by the server) and where a moved tab went are said in `role="status"`.
 *
 *  Example: `<SceneTabs tabs={table.tabs} />` */
export function SceneTabs({
  tabs,
  documents,
  campaignId,
  mainSheetKey = null,
}: SceneTabsProps): React.JSX.Element {
  const visibleKey = useSceneTabs(tabs, (state) => state.visibleKey);
  const activeDocument = useDocumentWorkspaceSlice(
    documents,
    (state) => state.activeByCampaign[campaignId ?? ''] ?? null,
    null,
  );
  useRoomTabOrderSync({ tabs, workspace: documents, campaignId, mainSheetKey });
  const ordered = useStripTabs(tabs, documents, campaignId, mainSheetKey);
  const strip = useRef<HTMLDivElement>(null);
  const width = useElementWidth(strip);
  const keys = ordered.map((tab) => tab.key);
  const fit = tabsThatFit({
    width: Math.max(0, width - STRIP_GAP),
    count: keys.length,
    minWidth: TAB_MIN_WIDTH,
    moreWidth: MORE_BUTTON_WIDTH + STRIP_GAP,
    gap: TAB_GAP,
  });
  // The main map can be what is active without being in the strip.
  const pinned = activeDocument && keys.includes(activeDocument) ? activeDocument : visibleKey;
  const split = splitTabsToFit(keys, fit, [GROUP_TAB, pinned]);
  const moves = useRoomTabMoves({
    tabs,
    openKeys: keys.filter((key) => key !== GROUP_TAB),
    nameOf: (key) => nameOfStripTab(ordered.find((tab) => tab.key === key)),
  });
  const drag = useRoomTabDrag({ order: keys, onMove: moves.move });
  const showScene = (key: string): void => {
    if (campaignId) documents?.getState().activate(campaignId, null);
    tabs.getState().show(key);
  };
  const showDocument = (entry: WorkspaceItem): void =>
    documents?.getState().activate(entry.campaign.id, entry.key);
  const isShown = (key: string): boolean => split.shown.includes(key);
  const frameOf = (tab: StripTab): TabFrameInput => ({
    roomKey: tab.key,
    dropSide: drag.dropSideOf(tab.key),
    dragProps: drag.sourceProps(tab.key, nameOfStripTab(tab), tab.key === GROUP_TAB),
  });
  return (
    // The whole strip takes the drop, the empty room after the last tab too (the end).
    <div ref={strip} {...drag.zoneProps} className="flex min-w-0 flex-1 items-center gap-3">
      <div
        role="tablist"
        aria-label="Grids abertos"
        data-app-region="no-drag"
        data-squeezed={split.shown.length > fit || undefined}
        onKeyDown={moves.onKeyDown}
        className="group/tabs flex min-w-0 items-center gap-1 overflow-hidden"
      >
        {ordered
          .filter((tab) => isShown(tab.key))
          .map((tab) =>
            tab.kind === 'scene' ? (
              <SceneTabItem
                key={tab.key}
                tab={tab.tab}
                frame={frameOf(tab)}
                selected={!activeDocument && tab.key === visibleKey}
                onShow={() => showScene(tab.key)}
                onClose={() => tabs.getState().close(tab.key)}
              />
            ) : (
              <DocumentTabItem
                key={tab.key}
                entry={tab.item}
                frame={frameOf(tab)}
                selected={activeDocument === tab.key}
                onShow={() => showDocument(tab.item)}
                onClose={() => void documents?.getState().close(tab.key)}
              />
            ),
          )}
      </div>
      {split.hidden.length > 0 && (
        <HiddenTabsMenu
          hidden={ordered.filter((tab) => !isShown(tab.key))}
          onShowScene={showScene}
          onShowDocument={showDocument}
        />
      )}
      <TabsNotice tabs={tabs} />
      <p role="status" aria-label="Ordem das abas" className="sr-only">
        {moves.announcement}
      </p>
    </div>
  );
}

// The grid tabs and the workspace items of this table, in the one order the room keeps.
function useStripTabs(
  tabs: StoreApi<SceneTabsStore>,
  documents: StoreApi<DocumentWorkspaceStore> | undefined,
  campaignId: string | undefined,
  mainSheetKey: string | null,
): readonly StripTab[] {
  const open = useSceneTabs(tabs, (state) => state.tabs);
  const tabOrder = useSceneTabs(tabs, (state) => state.tabOrder);
  const items = useWorkspaceItemsOf(documents, campaignId, mainSheetKey);
  return useMemo(() => {
    const byKey = new Map<string, StripTab>();
    for (const tab of open) byKey.set(tab.key, { key: tab.key, kind: 'scene', tab });
    for (const item of items) byKey.set(item.key, { key: item.key, kind: 'item', item });
    const openKeys = [...byKey.keys()].filter((key) => key !== GROUP_TAB);
    const order = roomTabOrder({ groupKey: GROUP_TAB, order: tabOrder, openKeys });
    return order.flatMap(({ key }) => byKey.get(key) ?? []);
  }, [open, tabOrder, items]);
}

// Read when said, not followed: a grid still loading is "Carregando…".
function nameOfStripTab(tab: StripTab | undefined): string {
  if (!tab) return LOADING_NAME;
  if (tab.kind === 'item') return workspaceItemTitle(tab.item);
  return tab.tab.board.getState().board?.scene.name ?? LOADING_NAME;
}

// The width a tab shrinks to before it moves into the "+N" menu: still a readable title.
const TAB_MIN_WIDTH = 112;
const MORE_BUTTON_WIDTH = 52;
// gap-1 between the tabs and gap-3 around the "+N" and the notice: the strip spends them too,
// and leaving them out drew the last tab's close button under the "+N".
const TAB_GAP = 4;
const STRIP_GAP = 12;

type HiddenTabsMenuProps = Readonly<{
  hidden: readonly StripTab[];
  onShowScene: (key: string) => void;
  onShowDocument: (entry: WorkspaceItem) => void;
}>;

function HiddenTabsMenu({
  hidden,
  onShowScene,
  onShowDocument,
}: HiddenTabsMenuProps): React.JSX.Element {
  const count = hidden.length;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          data-app-region="no-drag"
          variant="ghost"
          size="sm"
          aria-label={`Mais ${count} ${count === 1 ? 'aba' : 'abas'}`}
          className="shrink-0 gap-1 px-2 text-muted-foreground"
        >
          +{count}
          <ChevronDownIcon aria-hidden="true" className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 max-w-72">
        {hidden.map((tab) =>
          tab.kind === 'scene' ? (
            <HiddenSceneItem key={tab.key} tab={tab.tab} onShow={() => onShowScene(tab.key)} />
          ) : (
            <DropdownMenuItem key={tab.key} onSelect={() => onShowDocument(tab.item)}>
              <WorkspaceItemIcon item={tab.item} />
              <span className="truncate">{workspaceItemName(tab.item)}</span>
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HiddenSceneItem({
  tab,
  onShow,
}: Readonly<{ tab: SceneTab; onShow: () => void }>): React.JSX.Element {
  const name = useBoard(tab.board, (state) => state.board?.scene.name) ?? LOADING_NAME;
  return (
    <DropdownMenuItem onSelect={onShow}>
      <span className="truncate">{name}</span>
    </DropdownMenuItem>
  );
}

type DocumentTabItemProps = Readonly<{
  entry: WorkspaceItem;
  frame: TabFrameInput;
  selected: boolean;
  onShow: () => void;
  onClose: () => void;
}>;

function DocumentTabItem(props: DocumentTabItemProps): React.JSX.Element {
  const { entry, frame, selected, onShow, onClose } = props;
  const title = workspaceItemTitle(entry);
  const kindName = KIND_NAME[entry.kind];
  return (
    <TabFrame frame={frame} selected={selected}>
      <button
        type="button"
        role="tab"
        aria-label={title}
        aria-selected={selected}
        aria-description={kindName}
        aria-keyshortcuts={MOVE_KEYS}
        title={title}
        tabIndex={selected ? 0 : -1}
        onClick={onShow}
        className={cn(
          'flex min-w-0 items-center gap-2 overflow-hidden px-2 text-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring',
          selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <WorkspaceItemIcon item={entry} />
        <span className="max-w-40 truncate">{workspaceItemName(entry)}</span>
      </button>
      <button
        type="button"
        aria-label={`Fechar ${CLOSE_PREFIX[entry.kind]}${title}`}
        onClick={onClose}
        className={closeButtonClass(selected)}
      >
        <XIcon aria-hidden className="size-3.5" />
      </button>
    </TabFrame>
  );
}

const KIND_NAME: Readonly<Record<WorkspaceItem['kind'], string>> = {
  document: 'Documento',
  sheet: 'Ficha',
  'sheet-template': 'Modelo de ficha',
  map: 'Mapa',
};
// The tab shows only the name beside the kind's icon; its accessible name keeps the kind
// ("Ficha · Lyra"), so a sheet's and a template's close label needs no prefix.
const CLOSE_PREFIX: Readonly<Record<WorkspaceItem['kind'], string>> = {
  document: 'documento ',
  sheet: '',
  'sheet-template': '',
  map: 'mapa ',
};
const KIND_ICON = {
  document: FileTextIcon,
  sheet: ScrollTextIcon,
  'sheet-template': FileCode2Icon,
  map: MapIcon,
} as const;

function WorkspaceItemIcon({ item }: Readonly<{ item: WorkspaceItem }>): React.JSX.Element {
  const Icon = KIND_ICON[item.kind];
  return <Icon aria-hidden="true" className="size-3.5 shrink-0" />;
}

// The items of this table with a tab, without its homes (`tabbedWorkspaceItems`); the strip's
// order is the room's (`tabOrder`), not this one.
function useWorkspaceItemsOf(
  workspace: StoreApi<DocumentWorkspaceStore> | undefined,
  campaignId: string | undefined,
  mainSheetKey: string | null,
): readonly WorkspaceItem[] {
  const entries = useDocumentWorkspaceSlice(workspace, (state) => state.entries, NO_ITEMS);
  const sheets = useDocumentWorkspaceSlice(workspace, (state) => state.sheets, NO_ITEMS);
  const templates = useDocumentWorkspaceSlice(workspace, (state) => state.templates, NO_ITEMS);
  const maps = useDocumentWorkspaceSlice(workspace, (state) => state.maps, NO_ITEMS);
  return useMemo(
    () => tabbedWorkspaceItems({ entries, sheets, templates, maps }, campaignId, mainSheetKey),
    [entries, sheets, templates, maps, campaignId, mainSheetKey],
  );
}

// min-w-28 is TAB_MIN_WIDTH: the tabs shrink together down to it, then overflow into "+N". When
// the pinned tabs alone pass the room (`data-squeezed`), they shrink past it, or the strip would
// clip the last one under the "+N".
function tabFrameClass(selected: boolean): string {
  return cn(
    'group/tab relative flex h-10 min-w-28 shrink items-center gap-1 border-b-2 group-data-squeezed/tabs:min-w-0',
    selected ? 'border-primary' : 'border-transparent',
  );
}

// The keys that move a tab (`tabMoveStepOf`), said on every tab but the group's.
const MOVE_KEYS = 'Control+Shift+ArrowLeft Control+Shift+ArrowRight';

type TabFrameInput = Readonly<{
  roomKey: string;
  dropSide: RoomTabDropSide | undefined;
  dragProps: Readonly<Record<string, unknown>>;
}>;

type TabFrameProps = Readonly<{ frame: TabFrameInput; selected: boolean; children: ReactNode }>;

// The frame is what is dragged and dropped on; the bar marks where the dragged tab would land.
// The end's bar stays inside the last frame: the tablist clips what passes its edge.
function TabFrame({ frame, selected, children }: TabFrameProps): React.JSX.Element {
  const { roomKey, dropSide, dragProps } = frame;
  return (
    <div
      {...{ [ROOM_TAB_ATTRIBUTE]: roomKey }}
      data-drop-side={dropSide}
      {...dragProps}
      className={tabFrameClass(selected)}
    >
      {children}
      {dropSide && (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-y-1.5 w-0.5 rounded-full bg-primary',
            dropSide === 'before' ? '-left-0.5' : 'right-0',
          )}
        />
      )}
    </div>
  );
}

type SceneTabItemProps = Readonly<{
  tab: SceneTab;
  frame: TabFrameInput;
  selected: boolean;
  onShow: () => void;
  onClose: () => void;
}>;

function SceneTabItem(props: SceneTabItemProps): React.JSX.Element {
  const { tab, frame, selected, onShow, onClose } = props;
  const name = useBoard(tab.board, (state) => state.board?.scene.name) ?? LOADING_NAME;
  const isGroup = tab.key === GROUP_TAB;
  return (
    <TabFrame frame={frame} selected={selected}>
      <button
        type="button"
        role="tab"
        aria-selected={selected}
        aria-keyshortcuts={isGroup ? undefined : MOVE_KEYS}
        tabIndex={selected ? 0 : -1}
        onClick={onShow}
        className={cn(
          'flex min-w-0 items-baseline gap-2 overflow-hidden px-2 text-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring',
          selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <span className="max-w-40 truncate">{name}</span>
        {isGroup && (
          <span className="text-[11px] tracking-[0.12em] text-label uppercase">Grupo</span>
        )}
      </button>
      {!isGroup && (
        <button
          type="button"
          aria-label={`Fechar ${name}`}
          onClick={onClose}
          className={closeButtonClass(selected)}
        >
          <XIcon aria-hidden="true" className="size-3.5" />
        </button>
      )}
    </TabFrame>
  );
}

// Out of sight but never out of the page: a screen reader and the Tab key still reach it.
function closeButtonClass(selected: boolean): string {
  return cn(
    'grid size-6 shrink-0 place-items-center rounded-sm text-muted-foreground outline-offset-2 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring',
    !selected && 'opacity-0 group-focus-within/tab:opacity-100 group-hover/tab:opacity-100',
  );
}

// Always mounted, so a screen reader hears each new notice as it lands.
function TabsNotice({ tabs }: Readonly<{ tabs: StoreApi<SceneTabsStore> }>): React.JSX.Element {
  const notice = useSceneTabs(tabs, (state) => state.notice);
  return (
    <p
      role="status"
      aria-label="Aviso dos grids"
      className="min-w-0 truncate text-xs text-muted-foreground"
    >
      {notice}
    </p>
  );
}
