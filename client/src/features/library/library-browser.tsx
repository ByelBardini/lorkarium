import type { CampaignDetailDto, LibraryDto } from '@lorkarium/contracts';
import { PlusIcon } from 'lucide-react';
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
  library: LibraryDto;
  tableView: LibraryTableView;
  now: Date;
  onClose: () => void;
}>;

const NOTHING_FILTERED = 'Nada por aqui com esse filtro.';
const NOTHING_OPEN_YET = 'O mestre ainda não abriu nenhum lugar.';

type BrowserModel = Readonly<{
  /** The library with the move being sent already in place. */
  library: LibraryDto;
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
}>;

/** The loaded library: header with search, filter and "Novo grid", the tree of folders and
 *  grids (filtered by the search), the panel of the grid picked and the status line with the
 *  server's refusals.
 *
 *  Example: `<LibraryBrowser campaign={campaign} library={library} tableView={tableView} now={now} onClose={close} />` */
export function LibraryBrowser(props: LibraryBrowserProps): React.JSX.Element {
  const model = useBrowserModel(props);
  const { library, view, isMaster, live } = model;
  const pickedSceneId = sceneIdOf(model.pickedKey);
  return (
    <>
      <LibraryHeader
        subtitle={`${props.campaign.name} · ${gridCountLabel(library.scenes.length)}`}
        onClose={props.onClose}
        controls={{
          query: view.query,
          onQuery: view.search,
          visibility: isMaster ? view.visibility : null,
          onVisibility: view.filter,
        }}
        actions={
          isMaster && (
            <NewGridButton
              live={live}
              onCreate={() => model.createGrid(folderForNew(library, model.pickedKey))}
            />
          )
        }
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_340px]">
        <BrowserTree {...props} model={model} />
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
      </div>
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
  const { tableView } = props;
  const view = useLibraryView();
  const [focusNameId, setFocusNameId] = useState<string | null>(null);
  const submit = useLibrarySubmit();
  const { pending, refusal } = useLibraryOutcome((intent, createdId) => {
    if (intent === 'createFolder') return view.pick(createdId);
    view.pick(sceneKey(createdId));
    setFocusNameId(createdId);
  });
  const library = withPendingMove(props.library, pending);
  const isMaster = props.campaign.myRole === 'master';
  const filter = { query: view.query, visibility: isMaster ? view.visibility : 'all' } as const;
  const tree = useMemo(
    () =>
      filteredTreeOf(library, library.activeSceneId, {
        query: filter.query,
        visibility: filter.visibility,
      }),
    [library, filter.query, filter.visibility],
  );
  const openTab = (sceneId: string): void => {
    tableView.table?.tabs.getState().open(sceneId);
    props.onClose();
  };
  const createGrid = (folderId: string | null): void => {
    resetFilter(view);
    void submit({ intent: 'createScene', folderId });
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
  };
}

function BrowserTree({
  model,
  ...props
}: LibraryBrowserProps & Readonly<{ model: BrowserModel }>): React.JSX.Element {
  const { library, tree, isMaster } = model;
  const filtering = isFiltering(model.filter);
  const empty = tree.looseScenes.length === 0 && tree.roots.length === 0;
  return (
    <FolderTreeNav
      tree={tree}
      filtering={filtering}
      pickedKey={model.pickedKey}
      onPick={model.view.pick}
      groupSceneId={library.activeSceneId}
      playersOnline={props.tableView.playersOnline}
      now={props.now}
      notice={!isMaster && nothingOpenYet(library) ? NOTHING_OPEN_YET : null}
      emptyMessage={filtering && empty ? NOTHING_FILTERED : null}
      itemExtras={model.drag.treeItemProps}
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
    createGrid: model.createGrid,
    resetFilter: () => resetFilter(model.view),
  };
}

function NewGridButton({ live, onCreate }: Readonly<{ live: boolean; onCreate: () => void }>) {
  return (
    <Button disabled={!live} onClick={onCreate}>
      <PlusIcon aria-hidden="true" />
      Novo grid
    </Button>
  );
}

// Something about to be created must show in the tree.
function resetFilter(view: LibraryView): void {
  view.search('');
  view.filter('all');
}

// An item deleted under the library (another master, another tab) leaves nothing picked.
function knownKey(library: LibraryDto, key: string | null): string | null {
  if (key === null || key === NO_FOLDER) return key;
  const sceneId = sceneIdOf(key);
  if (sceneId) return library.scenes.some(({ id }) => id === sceneId) ? key : null;
  return library.folders.some(({ id }) => id === key) ? key : null;
}

function nothingOpenYet(library: LibraryDto): boolean {
  return library.scenes.every(({ id }) => id === library.activeSceneId);
}
