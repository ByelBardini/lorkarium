import type { CampaignLibraryDto } from '@lorkarium/contracts';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useFetcher } from 'react-router';
import { useStore } from 'zustand';
import type { AppDependencies } from '@/app/router';
import { useLibraryTable } from '@/features/library/use-library-table';
import type { LibraryIntent, LibraryOutcome } from '@/features/library/library-intents';
import { useOpenTable } from '@/features/sessions/use-open-table';
import { useSession } from '@/stores/session-store';
import type { DocumentWorkspaceEntry } from '@/stores/document-workspace-store';
import { Button } from '@/components/ui/button';
import { WorkspaceSheet } from '@/features/sheets/workspace-sheet';
import { WorkspaceSheetTemplate } from '@/features/sheets/workspace-sheet-template';
import { DocumentPanel } from './document-panel';
import { WorkspaceItemSurface } from './workspace-item-surface';

/** Keeps the open documents, sheets and template editors (their editors, stores and detached windows) alive
 *  across route changes, and says why the workspace closed a sheet or a template on its own.
 *
 *  Example: <DocumentWorkspaceHost deps={deps} />. */
export function DocumentWorkspaceHost({
  deps,
}: Readonly<{ deps: AppDependencies }>): React.JSX.Element {
  const entries = useStore(deps.documentWorkspace, (state) => state.entries);
  const sheets = useStore(deps.documentWorkspace, (state) => state.sheets);
  const templates = useStore(deps.documentWorkspace, (state) => state.templates);
  useClearOnAccountChange(deps);
  useForgetClosedTables(deps);
  return (
    <>
      {entries.map((entry) => (
        <WorkspaceDocument key={entry.key} deps={deps} entry={entry} />
      ))}
      {sheets.map((entry) => (
        <WorkspaceSheet key={entry.key} deps={deps} entry={entry} />
      ))}
      {templates.map((entry) => (
        <WorkspaceSheetTemplate key={entry.key} deps={deps} entry={entry} />
      ))}
      <WorkspaceNoticeLine workspace={deps.documentWorkspace} />
    </>
  );
}

function WorkspaceNoticeLine({
  workspace,
}: Readonly<{ workspace: AppDependencies['documentWorkspace'] }>): React.JSX.Element | null {
  const notice = useStore(workspace, (state) => state.notice);
  if (!notice) return null;
  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-md border border-divider bg-panel px-4 py-2 text-sm shadow-lg"
    >
      <p className="min-w-0 flex-1">{notice.message}</p>
      <Button size="sm" variant="ghost" onClick={() => workspace.getState().dismissNotice()}>
        Entendi
      </Button>
    </div>
  );
}

function useClearOnAccountChange(deps: AppDependencies): void {
  const session = useSession(deps.sessionStore);
  const ownerId = session.status === 'authenticated' ? session.user.id : null;
  const previousOwner = useRef(ownerId);
  useEffect(() => {
    if (previousOwner.current !== ownerId) deps.documentWorkspace.getState().clear();
    previousOwner.current = ownerId;
  }, [ownerId, deps.documentWorkspace]);
}

function useForgetClosedTables(deps: AppDependencies): void {
  useEffect(
    () =>
      deps.openTables.subscribe((state, previous) => {
        for (const table of previous.tables) {
          if (!state.tables.some((current) => current.campaignId === table.campaignId))
            deps.documentWorkspace.getState().removeCampaign(table.campaignId);
        }
        if (state.deletedNotice)
          deps.documentWorkspace.getState().removeCampaign(state.deletedNotice.campaignId);
      }),
    [deps.openTables, deps.documentWorkspace],
  );
}

const EMPTY_LIBRARY: CampaignLibraryDto = {
  activeSceneId: null,
  folders: [],
  scenes: [],
  images: [],
  documents: [],
};

function WorkspaceDocument({
  deps,
  entry,
}: Readonly<{ deps: AppDependencies; entry: DocumentWorkspaceEntry }>): React.JSX.Element {
  useOpenTable(entry.campaign, deps.openTables);
  const { table, live } = useLibraryTable(deps.openTables, entry.campaign.id);
  const { revision, role } = useDocumentReader(deps, entry, table);
  const fetcher = useFetcher<LibraryOutcome>({ key: `document-workspace-${entry.key}` });
  const [library, setLibrary] = useState(EMPTY_LIBRARY);
  const reloadLibrary = useCallback(() => {
    void deps.libraryApi.list(entry.campaign.id).then((result) => {
      if (result.ok) setLibrary(result.value);
    });
  }, [deps.libraryApi, entry.campaign.id]);
  useEffect(reloadLibrary, [reloadLibrary, revision]);
  const submit = useCallback(
    async (intent: LibraryIntent): Promise<void> => {
      await fetcher.submit(intent, {
        method: 'post',
        encType: 'application/json',
        action: `/campaigns/${encodeURIComponent(entry.campaign.id)}/table/library`,
      });
      await entry.editor.getState().revalidate();
      reloadLibrary();
    },
    [fetcher, entry.campaign.id, entry.editor, reloadLibrary],
  );
  const registerLeave = useCallback(
    (guard: (() => Promise<boolean>) | null) =>
      deps.documentWorkspace.getState().setLeaveGuard(entry.key, guard),
    [deps.documentWorkspace, entry.key],
  );
  const activeTabId = useStore(
    deps.documentWorkspace,
    (state) => state.activeTabByDocument[entry.key] ?? null,
  );
  const activateTab = useCallback(
    (tabId: string) => deps.documentWorkspace.getState().activateTab(entry.key, tabId),
    [deps.documentWorkspace, entry.key],
  );
  const refused = fetcher.data && !fetcher.data.ok && (
    <p role="alert" className="px-5 text-sm text-destructive-text">
      {fetcher.data.message}
    </p>
  );
  return (
    <WorkspaceItemSurface
      deps={deps}
      item={entry}
      detachedLabel="Documento aberto em outra janela."
      tabAlert={refused}
    >
      {(surface) => (
        <DocumentPanel
          campaign={{ ...entry.campaign, myRole: role }}
          documentId={entry.document.id}
          editorStore={entry.editor}
          activeTabId={activeTabId}
          onActivateTab={activateTab}
          api={deps.documentsApi}
          clock={deps.interactionClock}
          clipboard={deps.clipboard}
          library={library}
          live={live}
          revision={revision}
          focusName={entry.focusName && surface.visible}
          submit={submit}
          onRegisterLeave={registerLeave}
          onChanged={reloadLibrary}
          onClose={surface.close}
          onOpenWindow={surface.openWindow}
          compact={surface.detached}
        />
      )}
    </WorkspaceItemSurface>
  );
}

type ReaderTable = ReturnType<typeof useLibraryTable>['table'];

// The library revision and the reader's live role: the panel checks access again with them.
function useDocumentReader(
  deps: AppDependencies,
  entry: DocumentWorkspaceEntry,
  table: ReaderTable,
): Readonly<{ revision: number; role: DocumentWorkspaceEntry['campaign']['myRole'] }> {
  const subscribe = useCallback(
    (changed: () => void) => {
      const unsubscribeTabs = table?.tabs.subscribe(changed);
      const unsubscribePresence = table?.presence.subscribe(changed);
      return () => {
        unsubscribeTabs?.();
        unsubscribePresence?.();
      };
    },
    [table],
  );
  const session = useSession(deps.sessionStore);
  const userId = session.status === 'authenticated' ? session.user.id : '';
  const revision = useSyncExternalStore(
    subscribe,
    () => table?.tabs.getState().libraryRevision ?? 0,
  );
  const role = useSyncExternalStore(
    subscribe,
    () =>
      table?.presence.getState().members.find((member) => member.userId === userId)?.role ??
      entry.campaign.myRole,
  );
  return { revision, role };
}
