import { cn } from '@/lib/utils';
import {
  documentIdOf,
  documentKey,
  imageIdOf,
  libraryEntries,
  libraryTypeCounts,
  mapIdOf,
  sheetIdOf,
  sheetKey,
  sheetTemplateIdOf,
  sheetTemplateKey,
  type MixedLibrary,
} from '@/lib/library-entries';
import { sheetHolderLabel } from '@/features/sheets/sheet-messages';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { FileDownload } from '@/services/file-download';
import type { AssetsApi } from '@/services/assets-api';
import type { LibraryApi } from '@/services/library-api';
import type { LibraryMapsApi } from '@/services/library-maps-api';
import { useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { filteredTreeOf, isFiltering, type LibraryFilter } from '@/lib/folder-tree';
import { FolderTreeNav, type LibraryTree } from './folder-tree-nav';
import { LibraryPlanGatesContext, useLibraryPlanGatesOf } from './library-plan-gates';
import { NewItemDialog } from './new-item-dialog';
import { useNewItem, type NewItem } from './use-new-item';
import {
  LibraryItemPanel,
  type LibraryPanelModel,
  type LibraryPanelPorts,
} from './library-item-panel';
import { useLibraryOpener } from './use-library-opener';
import { useSheetHolderNames } from './use-sheet-holder-names';
import { LibraryHeader } from './library-header';
import { NewItemButton } from './new-item-button';
import type { TreeMaster } from './library-tree-menu';
import {
  folderForNew,
  sceneIdOf,
  sceneKey,
  libraryTypeOf,
  useLibraryView,
  type LibraryView,
} from './library-view';
import { useLibraryDrag, withPendingMove, type LibraryDrag } from './use-library-drag';
import { useGuardedPick } from './use-guarded-pick';
import { useLibraryOutcome, useLibrarySubmit } from './use-library-submit';
import { SheetTemplateImport } from './import-sheet-template-dialog';
import { useSheetTemplateCreate } from './use-sheet-template-create';
import { useSheetTemplateFiles } from './use-sheet-template-files';
import { useLibraryItemOpen, type LibraryItemOpen } from './use-library-item-open';

export type LibraryBrowserProps = LibraryPanelPorts &
  Readonly<{
    library: MixedLibrary;
    assets: AssetsApi;
    api: LibraryApi;
    mapsApi: LibraryMapsApi;
    clock: InteractionClock;
    /** "Exportar modelo" saves the `.lksheet` through it. */
    fileDownload?: FileDownload;
    onRegisterLeave?: (guard: (() => Promise<boolean>) | null) => void;
    onClose: () => void;
    /** The id of the drawer's "Biblioteca" heading. */
    titleId: string;
    /** How wide the drawer is: narrow shows only the tree, wide the tree and the item side by side. */
    sizing?: LibrarySizing;
  }>;

/** The drawer's width as the browser reads it, and "Ampliar"/"Reduzir". */
export type LibrarySizing = Readonly<{ wide: boolean; toggleWide: () => void }>;

const NOTHING_FILTERED = 'Nada por aqui com esse filtro.';
const NOTHING_OPEN_YET = 'O mestre ainda não abriu nenhum lugar.';

type BrowserModel = LibraryPanelModel &
  Readonly<{
    drag: LibraryDrag;
    view: LibraryView;
    filter: LibraryFilter;
    tree: LibraryTree;
    refusal: string | null;
    notice: string | null;
    editDocument: (documentId: string) => void;
    newItem: NewItem;
    openItem: LibraryItemOpen;
  }>;

/** The loaded library: header with "Novo" and the search with its filters, the tree of folders
 *  and items (filtered), the panel of the item picked (wide drawer only) and the status line
 *  with the server's refusals and notes. A double click or Enter on an item opens it.
 *
 *  Example: `<LibraryBrowser campaign={campaign} library={library} tableView={tableView} now={now} onClose={close} />` */
export function LibraryBrowser(props: LibraryBrowserProps): React.JSX.Element {
  const model = useBrowserModel(props);
  const { library, view, isMaster, live, newItem } = model;
  const templateId = isMaster ? sheetTemplateIdOf(model.pickedKey) : null;
  const editingTemplate = templateId !== null && props.sheetTemplatesApi !== undefined;
  const sizing = props.sizing;
  const planGates = useLibraryPlanGatesOf(library);
  return (
    <LibraryPlanGatesContext value={planGates}>
      <LibraryHeader
        titleId={props.titleId}
        widen={sizing && { wide: sizing.wide, toggle: sizing.toggleWide }}
        controls={{
          query: view.query,
          onQuery: view.search,
          type: view.type,
          onType: view.filterType,
          typeCounts: libraryTypeCounts(library),
          visibility: isMaster ? view.visibility : null,
          onVisibility: view.filter,
          sheetTemplates: isMaster,
        }}
        actions={isMaster && <NewItemButton live={live} onClick={() => newItem.open(null)} />}
      />
      <BrowserColumns {...props} model={model} templateId={editingTemplate ? templateId : null} />
      {newItem.folderId !== undefined && (
        <NewItemDialog
          campaignId={props.campaign.id}
          folderId={newItem.folderId}
          destination={folderNameOf(library, newItem.folderId)}
          templates={library.sheetTemplates ?? []}
          players={model.holders.players}
          assets={props.assets}
          api={props.api}
          mapsApi={props.mapsApi}
          live={live}
          create={newItem.create}
          onClose={newItem.close}
        />
      )}
      {model.openItem.viewing}
      {isMaster && <SheetTemplateImport importer={model.templateFiles.importer} live={live} />}
      <LibraryStatusLine
        problem={model.refusal ?? model.templateFiles.exportProblem}
        notice={model.notice}
      />
    </LibraryPlanGatesContext>
  );
}

function useBrowserModel(props: LibraryBrowserProps): BrowserModel {
  const { tableView } = props;
  const view = useAddressedView();
  const [focusNameId, setFocusNameId] = useState<string | null>(null);
  const submit = useLibrarySubmit();
  const holders = useSheetHolderNames(props.campaign.members, tableView.table);
  const opener = useLibraryOpener(props);
  const { pending, refusal, notice } = useLibraryOutcome((intent, createdId) => {
    if (intent === 'createFolder') return view.pick(createdId);
    if (intent === 'createSheet') return view.pick(sheetKey(createdId));
    if (intent === 'createSheetTemplate') return view.pick(sheetTemplateKey(createdId));
    if (intent === 'createDocument') {
      view.pick(documentKey(createdId));
      setFocusNameId(createdId);
      return;
    }
    view.pick(sceneKey(createdId));
    setFocusNameId(createdId);
  });
  const library = withPendingMove(props.library, pending);
  const isMaster = props.campaign.myRole === 'master';
  const filter = { query: view.query, visibility: isMaster ? view.visibility : 'all' } as const;
  const tree = useMemo(
    () =>
      filteredTreeOf(
        {
          folders: library.folders,
          scenes: libraryEntries(library, view.type, (sheet) =>
            sheetHolderLabel(sheet, holders.names),
          ),
        },
        library.activeSceneId,
        {
          active: view.type !== 'all',
          query: filter.query,
          visibility: filter.visibility,
        },
      ),
    [library, filter.query, filter.visibility, view.type, holders.names],
  );
  // The tab shows behind the drawer, which stays open.
  const openTab = (sceneId: string): void => {
    tableView.table?.tabs.getState().open(sceneId);
  };
  const editDocument = (documentId: string): void => {
    const document = props.library.documents?.find((item) => item.id === documentId);
    if (document) opener.openDocument(document, true, false);
  };
  const { createSheetTemplate, importSheetTemplate } = useSheetTemplateCreate(submit, () =>
    resetFilter(view),
  );
  const templateFiles = useSheetTemplateFiles({
    ...props,
    campaignId: props.campaign.id,
    importTemplate: importSheetTemplate,
    refusal,
  });
  const newItem = useNewItem({
    submit,
    beforeCreate: () => resetFilter(view),
    pick: view.pick,
    createSheetTemplate,
    chooseTemplateFile: templateFiles.importer.choose,
  });
  const drag = useLibraryDrag({ library, enabled: isMaster && tableView.live, submit });
  const pickedKey = knownKey(library, view.pickedKey);
  const guardedPick = useGuardedPick(pickedKey, view.pick, props.onRegisterLeave);
  const live = tableView.live;
  const openItem = useLibraryItemOpen({ ...props, library, openTab, opener, isMaster });
  return {
    openItem,
    library,
    drag,
    isMaster,
    live,
    view,
    filter,
    pickedKey,
    tree,
    submit,
    pending,
    refusal,
    notice,
    focusNameId,
    openTab,
    editDocument,
    templateFiles,
    newItem,
    holders,
    opener,
    guardedPick,
  };
}

// The type filter follows the address (`?type=`) on each arrival, not only on mount: the drawer
// stays mounted when an address with another type arrives with it already open.
function useAddressedView(): LibraryView {
  const [searchParams] = useSearchParams();
  const { key } = useLocation();
  const asked = libraryTypeOf(searchParams.get('type'));
  const view = useLibraryView(asked);
  const [arrival, setArrival] = useState(key);
  if (arrival !== key) {
    setArrival(key);
    view.filterType(asked);
  }
  return view;
}

type BrowserColumnsProps = LibraryBrowserProps &
  Readonly<{ model: BrowserModel; templateId: string | null }>;

// Wide: the tree beside the item picked (the template editor gets the room, the tree shrinks).
// Narrow: only the tree; a double click or Enter opens an item in the room.
function BrowserColumns({ model, templateId, ...props }: BrowserColumnsProps) {
  const compact = !(props.sizing?.wide ?? true);
  return (
    <div
      className={cn(
        'grid min-h-0 flex-1 grid-cols-1',
        !compact && templateId !== null && 'md:grid-cols-[260px_minmax(0,1fr)]',
        !compact && templateId === null && 'md:grid-cols-[minmax(0,1fr)_340px]',
      )}
    >
      <div className="flex min-h-0 flex-col">
        <BrowserTree {...props} model={model} />
      </div>
      {!compact && (
        <LibraryItemPanel {...props} model={model} templateId={templateId} libraryApi={props.api} />
      )}
    </div>
  );
}

function BrowserTree({
  model,
  ...props
}: LibraryBrowserProps & Readonly<{ model: BrowserModel }>): React.JSX.Element {
  const { library, tree, isMaster } = model;
  const filtering = isFiltering(model.filter) || model.view.type !== 'all';
  const empty = tree.looseScenes.length === 0 && tree.roots.length === 0;
  return (
    <FolderTreeNav
      tree={tree}
      filtering={filtering}
      pickedKey={model.pickedKey}
      onPick={model.guardedPick.pick}
      onOpen={model.openItem.open}
      groupSceneId={library.activeSceneId}
      playersOnline={props.tableView.playersOnline}
      now={props.now}
      notice={!isMaster && nothingOpenYet(library) ? NOTHING_OPEN_YET : null}
      emptyMessage={filtering && empty ? NOTHING_FILTERED : null}
      itemExtras={model.drag.treeItemProps}
      rootDropProps={model.drag.rootProps}
      master={isMaster ? masterOf(model) : null}
    />
  );
}

function masterOf(model: BrowserModel): TreeMaster {
  return {
    library: model.library,
    live: model.live,
    submit: model.submit,
    newParentId: folderForNew(model.library, model.pickedKey),
    createItem: model.newItem.open,
    editDocument: model.editDocument,
    importSheetTemplate: model.templateFiles.importer.choose,
    exportSheetTemplate: model.templateFiles.exportTemplate,
    openSheet: model.opener.openSheet,
    openMap: model.opener.openMap,
    players: model.holders.players,
    resetFilter: () => resetFilter(model.view),
  };
}

// Something about to be created must show in the tree.
function resetFilter(view: LibraryView): void {
  view.search('');
  view.filter('all');
  view.filterType('all');
}

function folderNameOf(library: MixedLibrary, folderId: string | null): string {
  return library.folders.find(({ id }) => id === folderId)?.name ?? 'Sem pasta';
}

// An item deleted under the library (another master, another tab) leaves nothing picked.
function knownKey(library: MixedLibrary, key: string | null): string | null {
  if (key === null) return key;
  for (const [idOf, items] of itemsByKeyKind(library)) {
    const itemId = idOf(key);
    if (itemId) return items?.some(({ id }) => id === itemId) ? key : null;
  }
  return library.folders.some(({ id }) => id === key) ? key : null;
}

type KeyedItems = readonly [
  (key: string | null) => string | null,
  readonly Readonly<{ id: string }>[] | undefined,
];

function itemsByKeyKind(library: MixedLibrary): readonly KeyedItems[] {
  return [
    [mapIdOf, library.maps],
    [sheetIdOf, library.sheets],
    [sheetTemplateIdOf, library.sheetTemplates],
    [documentIdOf, library.documents],
    [imageIdOf, library.images],
    [sceneIdOf, library.scenes],
  ];
}

function nothingOpenYet(library: MixedLibrary): boolean {
  return (
    (library.images?.length ?? 0) === 0 &&
    (library.maps?.length ?? 0) === 0 &&
    (library.documents?.length ?? 0) === 0 &&
    (library.sheets?.length ?? 0) === 0 &&
    library.scenes.every(({ id }) => id === library.activeSceneId)
  );
}

// A refusal (red) wins over a note about a change that went through.
function LibraryStatusLine({
  problem,
  notice,
}: Readonly<{ problem: string | null; notice: string | null }>): React.JSX.Element {
  return (
    <p
      role="status"
      className={cn(
        // Nothing to say, no line: the drawer keeps one background down to its foot.
        'shrink-0 px-6 py-2 text-sm empty:p-0',
        problem ? 'text-destructive-text' : 'text-foreground',
      )}
    >
      {problem ?? notice}
    </p>
  );
}
