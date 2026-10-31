import type { CampaignLibraryDto } from '@lorkarium/contracts';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useFetcher, useNavigate } from 'react-router';
import { useStore } from 'zustand';
import type { AppDependencies } from '@/app/router';
import { Button } from '@/components/ui/button';
import { ChatWindowPortal } from '@/features/chat/chat-window-portal';
import { DetachedWindowFrame } from '@/features/chat/detached-window-frame';
import { useChatWindow } from '@/features/chat/use-chat-window';
import { PanelTopCloseIcon } from 'lucide-react';
import { useLibraryTable } from '@/features/library/use-library-table';
import type { LibraryIntent, LibraryOutcome } from '@/features/library/library-intents';
import { useOpenTable } from '@/features/sessions/use-open-table';
import { useSession } from '@/stores/session-store';
import type { DocumentWorkspaceEntry } from '@/stores/document-workspace-store';
import { DocumentPanel } from './document-panel';

/** Keeps document editors and detached windows alive across route changes. Example: <DocumentWorkspaceHost deps={deps} />. */
export function DocumentWorkspaceHost({
  deps,
}: Readonly<{ deps: AppDependencies }>): React.JSX.Element {
  const entries = useStore(deps.documentWorkspace, (state) => state.entries);
  const session = useSession(deps.sessionStore);
  const ownerId = session.status === 'authenticated' ? session.user.id : null;
  const previousOwner = useRef(ownerId);
  useEffect(() => {
    if (previousOwner.current !== ownerId) deps.documentWorkspace.getState().clear();
    previousOwner.current = ownerId;
  }, [ownerId, deps.documentWorkspace]);
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
  return (
    <>
      {entries.map((entry) => (
        <WorkspaceDocument key={entry.key} deps={deps} entry={entry} />
      ))}
    </>
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
  const popup = useChatWindow(entry.key, deps.chatWindowHost, 'document', entry.windowHandle);
  const navigate = useNavigate();
  const returnToTab = (): void => {
    deps.documentWorkspace.getState().activate(entry.campaign.id, entry.key);
    popup.bringBack();
    void navigate(`/campaigns/${encodeURIComponent(entry.campaign.id)}/table`);
  };
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
  const close = useCallback(() => {
    void deps.documentWorkspace.getState().close(entry.key);
  }, [deps.documentWorkspace, entry.key]);
  const openWindow = useCallback(
    () => deps.documentWorkspace.getState().openWindow(entry.key, deps.chatWindowHost),
    [deps.documentWorkspace, deps.chatWindowHost, entry.key],
  );
  const panel = (
    <DocumentPanel
      campaign={{ ...entry.campaign, myRole: role }}
      documentId={entry.document.id}
      editorStore={entry.editor}
      api={deps.documentsApi}
      clock={deps.interactionClock}
      clipboard={deps.clipboard}
      library={library}
      live={live}
      revision={revision}
      focusName={entry.focusName && (!!entry.target || !!popup.portalTarget)}
      submit={submit}
      onRegisterLeave={registerLeave}
      onChanged={reloadLibrary}
      // The window's own X already hands the document back to its tab.
      onClose={popup.portalTarget ? undefined : close}
      onOpenWindow={popup.status === 'detached' ? undefined : openWindow}
      compact={!!popup.portalTarget}
    />
  );
  if (popup.portalTarget) {
    const problem = entry.closeProblem ?? popup.closeError ?? popup.alwaysOnTopProblem;
    return (
      <>
        {entry.target &&
          createPortal(<DetachedDocumentNotice onReturn={returnToTab} />, entry.target)}
        <ChatWindowPortal target={popup.portalTarget}>
          <DetachedWindowFrame
            title={entry.document.name}
            window={popup}
            flush
            actions={<ReturnToTabButton onReturn={returnToTab} />}
          >
            {problem && (
              <p role="alert" className="px-4 py-2 text-sm text-destructive-text">
                {problem}
              </p>
            )}
            {panel}
          </DetachedWindowFrame>
        </ChatWindowPortal>
      </>
    );
  }
  const blocked = entry.windowBlocked || popup.status === 'blocked';
  const content = (
    <>
      {blocked && (
        <p role="alert" className="px-5 py-3 text-sm text-destructive-text">
          Não foi possível abrir a janela. Permita janelas pop-up e tente novamente.
        </p>
      )}
      {fetcher.data && !fetcher.data.ok && (
        <p role="alert" className="px-5 text-sm text-destructive-text">
          {fetcher.data.message}
        </p>
      )}
      {panel}
    </>
  );
  return entry.target ? <>{createPortal(content, entry.target)}</> : <div hidden>{content}</div>;
}
function ReturnToTabButton({ onReturn }: Readonly<{ onReturn: () => void }>): React.JSX.Element {
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label="Voltar para a aba"
      title="Voltar para a aba"
      className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
      onClick={onReturn}
    >
      <PanelTopCloseIcon aria-hidden="true" className="size-3.5" />
      Voltar à aba
    </Button>
  );
}
function DetachedDocumentNotice({
  onReturn,
}: Readonly<{ onReturn: () => void }>): React.JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center gap-3 text-sm text-muted-foreground">
      Documento aberto em outra janela.
      <Button variant="outline" onClick={onReturn}>
        Trazer de volta
      </Button>
    </div>
  );
}
