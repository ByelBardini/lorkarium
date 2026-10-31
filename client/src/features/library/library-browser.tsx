import type { CampaignDetailDto } from '@lorkarium/contracts';
import { useNavigate, useRevalidator } from 'react-router';
import {
  documentIdOf,
  documentKey,
  imageIdOf,
  imageKey,
  libraryEntries,
  type MixedLibrary,
} from '@/lib/library-entries';
import { DocumentPreview } from '@/features/documents/document-preview';
import type { DocumentWorkspaceStore } from '@/stores/document-workspace-store';
import type { StoreApi } from 'zustand/vanilla';
import type { ChatWindowHost } from '@/services/chat-window-host';
import type { DocumentsApi } from '@/services/documents-api';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { Clipboard } from '@/services/clipboard';
import type { AssetsApi } from '@/services/assets-api';
import type { LibraryApi } from '@/services/library-api';
import type { ImagePresentationApi } from '@/services/image-presentation-api';
import { ImageDetails } from './image-details';
import { LibraryImageForm } from './library-image-form';
import {
  FilePlusIcon,
  FolderPlusIcon,
  Grid2X2PlusIcon,
  ImagePlusIcon,
  SquarePlusIcon,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { filteredTreeOf, isFiltering, type LibraryFilter } from '@/lib/folder-tree';
import { FolderTreeNav, type LibraryTree } from './folder-tree-nav';
import { LibraryHeader } from './library-header';
import { gridCountLabel } from './library-messages';
import type { TreeMaster } from './library-tree-menu';
import {
  NO_FOLDER,
  folderForNew,
  sceneIdOf,
  sceneKey,
  useLibraryView,
  type LibraryView,
} from './library-view';
import { SceneDetails } from './scene-details';
import { useLibraryDrag, withPendingMove, type LibraryDrag } from './use-library-drag';
import type { LibraryTableView } from './use-library-table';
import { useLibraryOutcome, useLibrarySubmit, type LibrarySubmit } from './use-library-submit';

export type LibraryBrowserProps = Readonly<{
  campaign: CampaignDetailDto;
  library: MixedLibrary;
  tableView: LibraryTableView;
  now: Date;
  assets: AssetsApi;
  api: LibraryApi;
  presentations: ImagePresentationApi;
  documentsApi: DocumentsApi;
  clock: InteractionClock;
  clipboard: Clipboard;
  documentWorkspace?: StoreApi<DocumentWorkspaceStore>;
  chatWindowHost?: ChatWindowHost;
  onRegisterLeave?: (guard: (() => Promise<boolean>) | null) => void;
  onClose: () => void;
}>;

const NOTHING_FILTERED = 'Nada por aqui com esse filtro.';
const NOTHING_OPEN_YET = 'O mestre ainda não abriu nenhum lugar.';

type BrowserModel = Readonly<{
  /** The library with the move being sent already in place. */
  library: MixedLibrary;
  drag: LibraryDrag;
  isMaster: boolean;
  live: boolean;
  view: LibraryView;
  filter: LibraryFilter;
  /** The item picked, if it still exists. */
  pickedKey: string | null;
  tree: LibraryTree;
  submit: LibrarySubmit;
  refusal: string | null;
  focusNameId: string | null;
  openTab: (sceneId: string) => void;
  createGrid: (folderId: string | null) => void;
  createDocument: (folderId: string | null) => void;
  editDocument: (documentId: string) => void;
}>;

/** The loaded library: header with search, filter and "Novo grid", the tree of folders and
 *  grids (filtered by the search), the panel of the grid picked and the status line with the
 *  server's refusals.
 *
 *  Example: `<LibraryBrowser campaign={campaign} library={library} tableView={tableView} now={now} onClose={close} />` */
export function LibraryBrowser(props: LibraryBrowserProps): React.JSX.Element {
  const model = useBrowserModel(props);
  const [creating, setCreating] = useState<string | null | undefined>(undefined);
  const [folderRequest, requestFolder] = useState(0);
  const { revalidate } = useRevalidator();
  const navigate = useNavigate();
  const { library, view, isMaster, live } = model;
  const documentId = documentIdOf(model.pickedKey);
  const document = library.documents?.find((item) => item.id === documentId);
  const openDocument = (detached = false): void => {
    if (!document) return;
    const previous =
      props.documentWorkspace?.getState().activeByCampaign[props.campaign.id] ?? null;
    const key = props.documentWorkspace
      ?.getState()
      .open({ campaign: props.campaign, document, focusName: model.focusNameId === document.id });
    if (detached && key && props.chatWindowHost) {
      props.documentWorkspace?.getState().openWindow(key, props.chatWindowHost);
      const opened = props.documentWorkspace?.getState().entries.find((entry) => entry.key === key);
      if (opened?.windowHandle) {
        props.documentWorkspace?.getState().activate(props.campaign.id, previous);
        return;
      }
    }
    void navigate(`/campaigns/${encodeURIComponent(props.campaign.id)}/table`);
  };
  const pickedSceneId = sceneIdOf(model.pickedKey);
  const image = library.images?.find(({ id }) => id === imageIdOf(model.pickedKey));
  return (
    <>
      <LibraryHeader
        subtitle={`${props.campaign.name} · ${gridCountLabel(library.scenes.length)} · ${library.images?.length ?? 0} imagens · ${library.documents?.length ?? 0} documentos`}
        onClose={props.onClose}
        controls={{
          query: view.query,
          onQuery: view.search,
          type: view.type,
          onType: view.filterType,
          visibility: isMaster ? view.visibility : null,
          onVisibility: view.filter,
        }}
        actions={
          isMaster && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button size="icon" disabled={!live} aria-label="Criar item">
                  <SquarePlusIcon aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-44"
                onCloseAutoFocus={(event) => event.preventDefault()}
              >
                <DropdownMenuItem onSelect={() => model.createGrid(null)}>
                  <Grid2X2PlusIcon />
                  Novo grid
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => model.createDocument(null)}>
                  <FilePlusIcon />
                  Novo documento
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    resetFilter(view);
                    setCreating(null);
                  }}
                >
                  <ImagePlusIcon />
                  Nova imagem
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    resetFilter(view);
                    view.pick(null);
                    requestFolder((value) => value + 1);
                  }}
                >
                  <FolderPlusIcon />
                  Nova pasta
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_340px]">
        <BrowserTree
          {...props}
          model={model}
          folderRequest={folderRequest}
          onNewImage={(folderId) => {
            view.pick(folderId);
            resetFilter(view);
            setCreating(folderId);
          }}
        />
        {document ? (
          <DocumentPreview
            key={documentId}
            campaignId={props.campaign.id}
            summary={document}
            api={props.documentsApi}
            live={live}
            onOpen={() => openDocument()}
            onOpenWindow={() => openDocument(true)}
          />
        ) : image ? (
          <ImageDetails
            key={image.id}
            image={image}
            library={library}
            campaignId={props.campaign.id}
            isMaster={isMaster}
            live={live}
            submit={model.submit}
            presentations={props.presentations}
            store={props.tableView.table?.imagePresentation ?? null}
          />
        ) : (
          <SceneDetails
            scene={library.scenes.find(({ id }) => id === pickedSceneId) ?? null}
            isMaster={isMaster}
            live={live}
            groupSceneId={library.activeSceneId}
            playersOnline={props.tableView.playersOnline}
            now={props.now}
            focusName={model.focusNameId !== null && model.focusNameId === pickedSceneId}
            submit={model.submit}
            onOpen={model.openTab}
          />
        )}
      </div>
      {creating !== undefined && (
        <LibraryImageForm
          campaignId={props.campaign.id}
          folderId={creating}
          assets={props.assets}
          api={props.api}
          live={live}
          onClose={() => setCreating(undefined)}
          onSaved={(saved) => {
            setCreating(undefined);
            view.pick(imageKey(saved.id));
            void revalidate();
          }}
        />
      )}
      <p
        role="status"
        className="min-h-9 shrink-0 border-t border-border px-6 py-2 text-sm text-destructive-text"
      >
        {model.refusal}
      </p>
    </>
  );
}

function useBrowserModel(props: LibraryBrowserProps): BrowserModel {
  const navigate = useNavigate();
  const { tableView } = props;
  const view = useLibraryView();
  const [focusNameId, setFocusNameId] = useState<string | null>(null);
  const submit = useLibrarySubmit();
  const { pending, refusal } = useLibraryOutcome((intent, createdId) => {
    if (intent === 'createFolder') return view.pick(createdId);
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
        { folders: library.folders, scenes: libraryEntries(library, view.type) },
        library.activeSceneId,
        {
          active: view.type !== 'all',
          query: filter.query,
          visibility: filter.visibility,
        },
      ),
    [library, filter.query, filter.visibility, view.type],
  );
  const openTab = (sceneId: string): void => {
    tableView.table?.tabs.getState().open(sceneId);
    props.onClose();
  };
  const createGrid = (folderId: string | null): void => {
    resetFilter(view);
    void submit({ intent: 'createScene', folderId });
  };
  const createDocument = (folderId: string | null): void => {
    resetFilter(view);
    void submit({ intent: 'createDocument', changes: { actionId: crypto.randomUUID(), folderId } });
  };
  const editDocument = (documentId: string): void => {
    const document = props.library.documents?.find((item) => item.id === documentId);
    if (!document) return;
    props.documentWorkspace
      ?.getState()
      .open({ campaign: props.campaign, document, focusName: true });
    void navigate(`/campaigns/${encodeURIComponent(props.campaign.id)}/table`);
  };
  const drag = useLibraryDrag({ library, enabled: isMaster && tableView.live, submit });
  const pickedKey = knownKey(library, view.pickedKey);
  const live = tableView.live;
  return {
    library,
    drag,
    isMaster,
    live,
    view,
    filter,
    pickedKey,
    tree,
    submit,
    refusal,
    focusNameId,
    openTab,
    createGrid,
    createDocument,
    editDocument,
  };
}

function BrowserTree({
  model,
  onNewImage,
  folderRequest,
  ...props
}: LibraryBrowserProps &
  Readonly<{
    model: BrowserModel;
    folderRequest: number;
    onNewImage: (folderId: string | null) => void;
  }>): React.JSX.Element {
  const { library, tree, isMaster } = model;
  const filtering = isFiltering(model.filter) || model.view.type !== 'all';
  const empty = tree.looseScenes.length === 0 && tree.roots.length === 0;
  return (
    <FolderTreeNav
      tree={tree}
      newFolderRequest={folderRequest}
      filtering={filtering}
      pickedKey={model.pickedKey}
      onPick={model.view.pick}
      groupSceneId={library.activeSceneId}
      playersOnline={props.tableView.playersOnline}
      now={props.now}
      notice={!isMaster && nothingOpenYet(library) ? NOTHING_OPEN_YET : null}
      emptyMessage={filtering && empty ? NOTHING_FILTERED : null}
      itemExtras={model.drag.treeItemProps}
      master={isMaster ? { ...masterOf(model), createImage: onNewImage } : null}
    />
  );
}

function masterOf(model: BrowserModel): TreeMaster {
  return {
    library: model.library,
    live: model.live,
    submit: model.submit,
    newParentId: folderForNew(model.library, model.pickedKey),
    createGrid: model.createGrid,
    createDocument: model.createDocument,
    editDocument: model.editDocument,
    resetFilter: () => resetFilter(model.view),
  };
}

// Something about to be created must show in the tree.
function resetFilter(view: LibraryView): void {
  view.search('');
  view.filter('all');
  view.filterType('all');
}

// An item deleted under the library (another master, another tab) leaves nothing picked.
function knownKey(library: MixedLibrary, key: string | null): string | null {
  if (key === null || key === NO_FOLDER) return key;
  const documentId = documentIdOf(key);
  if (documentId) return library.documents?.some(({ id }) => id === documentId) ? key : null;
  const imageId = imageIdOf(key);
  if (imageId) return library.images?.some(({ id }) => id === imageId) ? key : null;
  const sceneId = sceneIdOf(key);
  if (sceneId) return library.scenes.some(({ id }) => id === sceneId) ? key : null;
  return library.folders.some(({ id }) => id === key) ? key : null;
}

function nothingOpenYet(library: MixedLibrary): boolean {
  return (
    (library.images?.length ?? 0) === 0 &&
    (library.documents?.length ?? 0) === 0 &&
    library.scenes.every(({ id }) => id === library.activeSceneId)
  );
}
