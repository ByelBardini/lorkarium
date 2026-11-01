import { useMemo, useRef } from 'react';
import { ChevronDownIcon, FileCode2Icon, FileTextIcon, ScrollTextIcon, XIcon } from 'lucide-react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { moveFocusAlongTabs } from '@/lib/tab-focus';
import { splitTabsToFit, tabsThatFit } from '@/lib/tab-overflow';
import { useElementWidth } from '@/lib/use-element-width';
import { cn } from '@/lib/utils';
import { useBoard } from '@/stores/board-store';
import {
  useDocumentWorkspaceSlice,
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

export type SceneTabsProps = Readonly<{
  tabs: StoreApi<SceneTabsStore>;
  documents?: StoreApi<DocumentWorkspaceStore>;
  campaignId?: string;
}>;
const NO_ITEMS: readonly WorkspaceItem[] = [];

const LOADING_NAME = 'Carregando…';

/** The strip of open grids at the top of the room: the group grid's tab first (marked "Grupo",
 *  never closed), then the extra ones, each with "Fechar <grid>". Arrows move the focus along the
 *  tabs and Enter shows the focused one; the notice of the tabs (an activation, a tab closed by the
 *  server) is said in a `role="status"`.
 *
 *  Example: `<SceneTabs tabs={table.tabs} />` */
export function SceneTabs({ tabs, documents, campaignId }: SceneTabsProps): React.JSX.Element {
  const open = useSceneTabs(tabs, (state) => state.tabs);
  const visibleKey = useSceneTabs(tabs, (state) => state.visibleKey);
  const activeDocument = useDocumentWorkspaceSlice(
    documents,
    (state) => state.activeByCampaign[campaignId ?? ''] ?? null,
    null,
  );
  const documentEntries = useWorkspaceItemsOf(documents, campaignId);
  const strip = useRef<HTMLDivElement>(null);
  const width = useElementWidth(strip);
  const keys = [...open.map((tab) => tab.key), ...documentEntries.map((entry) => entry.key)];
  const fit = tabsThatFit({
    width: Math.max(0, width - STRIP_GAP),
    count: keys.length,
    minWidth: TAB_MIN_WIDTH,
    moreWidth: MORE_BUTTON_WIDTH + STRIP_GAP,
    gap: TAB_GAP,
  });
  const split = splitTabsToFit(keys, fit, [GROUP_TAB, activeDocument ?? visibleKey]);
  const showScene = (key: string): void => {
    if (campaignId) documents?.getState().activate(campaignId, null);
    tabs.getState().show(key);
  };
  const showDocument = (entry: WorkspaceItem): void =>
    documents?.getState().activate(entry.campaign.id, entry.key);
  const isShown = (key: string): boolean => split.shown.includes(key);
  return (
    <div ref={strip} className="flex min-w-0 flex-1 items-center gap-3">
      <div
        role="tablist"
        aria-label="Grids abertos"
        data-app-region="no-drag"
        data-squeezed={split.shown.length > fit || undefined}
        onKeyDown={moveFocusAlongTabs}
        className="group/tabs flex min-w-0 items-center gap-1 overflow-hidden"
      >
        {open
          .filter((tab) => isShown(tab.key))
          .map((tab) => (
            <SceneTabItem
              key={tab.key}
              tab={tab}
              selected={!activeDocument && tab.key === visibleKey}
              onShow={() => showScene(tab.key)}
              onClose={() => tabs.getState().close(tab.key)}
            />
          ))}
        {documentEntries
          .filter((entry) => isShown(entry.key))
          .map((entry) => (
            <DocumentTabItem
              key={entry.key}
              entry={entry}
              selected={activeDocument === entry.key}
              onShow={() => showDocument(entry)}
              onClose={() => void documents?.getState().close(entry.key)}
            />
          ))}
      </div>
      {split.hidden.length > 0 && (
        <HiddenTabsMenu
          count={split.hidden.length}
          scenes={open.filter((tab) => !isShown(tab.key))}
          documents={documentEntries.filter((entry) => !isShown(entry.key))}
          onShowScene={showScene}
          onShowDocument={showDocument}
        />
      )}
      <TabsNotice tabs={tabs} />
    </div>
  );
}

// The width a tab shrinks to before it moves into the "+N" menu: still a readable title.
const TAB_MIN_WIDTH = 112;
const MORE_BUTTON_WIDTH = 52;
// gap-1 between the tabs and gap-3 around the "+N" and the notice: the strip spends them too,
// and leaving them out drew the last tab's close button under the "+N".
const TAB_GAP = 4;
const STRIP_GAP = 12;

type HiddenTabsMenuProps = Readonly<{
  count: number;
  scenes: readonly SceneTab[];
  documents: readonly WorkspaceItem[];
  onShowScene: (key: string) => void;
  onShowDocument: (entry: WorkspaceItem) => void;
}>;

function HiddenTabsMenu(props: HiddenTabsMenuProps): React.JSX.Element {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          data-app-region="no-drag"
          variant="ghost"
          size="sm"
          aria-label={`Mais ${props.count} ${props.count === 1 ? 'aba' : 'abas'}`}
          className="shrink-0 gap-1 px-2 text-muted-foreground"
        >
          +{props.count}
          <ChevronDownIcon aria-hidden="true" className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 max-w-72">
        {props.scenes.map((tab) => (
          <HiddenSceneItem key={tab.key} tab={tab} onShow={() => props.onShowScene(tab.key)} />
        ))}
        {props.documents.map((entry) => (
          <DropdownMenuItem key={entry.key} onSelect={() => props.onShowDocument(entry)}>
            <WorkspaceItemIcon item={entry} />
            <span className="truncate">{workspaceItemTitle(entry)}</span>
          </DropdownMenuItem>
        ))}
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

function DocumentTabItem({
  entry,
  selected,
  onShow,
  onClose,
}: Readonly<{
  entry: WorkspaceItem;
  selected: boolean;
  onShow: () => void;
  onClose: () => void;
}>): React.JSX.Element {
  const title = workspaceItemTitle(entry);
  const kindName = KIND_NAME[entry.kind];
  return (
    <div className={tabFrameClass(selected)}>
      <button
        type="button"
        role="tab"
        aria-selected={selected}
        aria-description={kindName}
        tabIndex={selected ? 0 : -1}
        onClick={onShow}
        className={cn(
          'flex min-w-0 items-center gap-2 overflow-hidden px-2 text-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring',
          selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <WorkspaceItemIcon item={entry} />
        <span className="max-w-40 truncate">{title}</span>
      </button>
      <button
        type="button"
        aria-label={entry.kind === 'document' ? `Fechar documento ${title}` : `Fechar ${title}`}
        onClick={onClose}
        className="grid size-6 shrink-0 place-items-center rounded-sm text-muted-foreground outline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <XIcon aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}

const KIND_NAME: Readonly<Record<WorkspaceItem['kind'], string>> = {
  document: 'Documento',
  sheet: 'Ficha',
  'sheet-template': 'Modelo de ficha',
};
const KIND_ICON = {
  document: FileTextIcon,
  sheet: ScrollTextIcon,
  'sheet-template': FileCode2Icon,
} as const;

function WorkspaceItemIcon({ item }: Readonly<{ item: WorkspaceItem }>): React.JSX.Element {
  const Icon = KIND_ICON[item.kind];
  return <Icon aria-hidden="true" className="size-3.5 shrink-0" />;
}

// The documents, the sheets, then the templates of this table, each list in the order opened.
function useWorkspaceItemsOf(
  workspace: StoreApi<DocumentWorkspaceStore> | undefined,
  campaignId: string | undefined,
): readonly WorkspaceItem[] {
  const documents = useDocumentWorkspaceSlice(workspace, (state) => state.entries, NO_ITEMS);
  const sheets = useDocumentWorkspaceSlice(workspace, (state) => state.sheets, NO_ITEMS);
  const templates = useDocumentWorkspaceSlice(workspace, (state) => state.templates, NO_ITEMS);
  return useMemo(
    () => [...documents, ...sheets, ...templates].filter((item) => item.campaign.id === campaignId),
    [documents, sheets, templates, campaignId],
  );
}

// min-w-28 is TAB_MIN_WIDTH: the tabs shrink together down to it, then overflow into "+N". When
// the pinned tabs alone pass the room (`data-squeezed`), they shrink past it, or the strip would
// clip the last one under the "+N".
function tabFrameClass(selected: boolean): string {
  return cn(
    'flex h-12 min-w-28 shrink items-center gap-1 border-b-2 group-data-squeezed/tabs:min-w-0 [[data-title-bar]_&]:h-11',
    selected ? 'border-primary' : 'border-transparent',
  );
}

type SceneTabItemProps = Readonly<{
  tab: SceneTab;
  selected: boolean;
  onShow: () => void;
  onClose: () => void;
}>;

function SceneTabItem({ tab, selected, onShow, onClose }: SceneTabItemProps): React.JSX.Element {
  const name = useBoard(tab.board, (state) => state.board?.scene.name) ?? LOADING_NAME;
  const isGroup = tab.key === GROUP_TAB;
  return (
    <div className={tabFrameClass(selected)}>
      <button
        type="button"
        role="tab"
        aria-selected={selected}
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
          className="grid size-6 shrink-0 place-items-center rounded-sm text-muted-foreground outline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <XIcon aria-hidden="true" className="size-3.5" />
        </button>
      )}
    </div>
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
