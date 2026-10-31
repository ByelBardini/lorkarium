import type { CampaignDetailDto, CampaignLibraryDto } from '@lorkarium/contracts';
import { Suspense, use, useCallback, useRef } from 'react';
import type { DocumentsApi } from '@/services/documents-api';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { Clipboard } from '@/services/clipboard';
import type { ChatWindowHost } from '@/services/chat-window-host';
import type { DocumentWorkspaceStore } from '@/stores/document-workspace-store';
import { useRevalidator } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { SignedOutRedirect } from '@/components/signed-out-redirect';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { keepMovedFocus } from '@/lib/keep-moved-focus';
import type { AssetsApi } from '@/services/assets-api';
import type { LibraryApi } from '@/services/library-api';
import type { ImagePresentationApi } from '@/services/image-presentation-api';
import type { LibraryFailure, LibraryResult } from '@/services/library-api';
import type { SessionStore } from '@/stores/session-store';
import { LibraryBrowser } from './library-browser';
import { LibraryHeader } from './library-header';
import { libraryFailureMessage } from './library-messages';
import { useRevalidateOnLibraryChange, type LibraryTableView } from './use-library-table';

export type LibraryDialogProps = Readonly<{
  campaign: CampaignDetailDto;
  /** The list as the loader asked for it, not awaited: the modal opens while it comes. */
  library: Promise<LibraryResult<CampaignLibraryDto>>;
  tableView: LibraryTableView;
  sessionStore: StoreApi<SessionStore>;
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

/** The library as a modal over the room (which stays alive under it): loading, the failure with
 *  "Tentar de novo", or the browser. Esc and "Fechar biblioteca" go back to the room.
 *
 *  Example: `<LibraryDialog campaign={campaign} library={promise} tableView={view} sessionStore={sessionStore} now={now} onClose={back} />` */
export function LibraryDialog(props: LibraryDialogProps): React.JSX.Element {
  useRevalidateOnLibraryChange(props.tableView.table?.tabs ?? null);
  const leaveGuard = useRef<(() => Promise<boolean>) | null>(null);
  const onRegisterLeave = useCallback((guard: (() => Promise<boolean>) | null) => {
    leaveGuard.current = guard;
  }, []);
  const close = (): void => {
    void (async () => {
      if (!leaveGuard.current || (await leaveGuard.current())) props.onClose();
    })();
  };
  const guardedProps = { ...props, onClose: close, onRegisterLeave };
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={keepOpenWhileEditing}
        onCloseAutoFocus={keepMovedFocus}
        className="flex h-[90svh] w-[calc(100%_-_2rem)] max-w-[1360px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1360px]"
      >
        <Suspense fallback={<LibraryLoading {...guardedProps} />}>
          <LoadedLibrary {...guardedProps} />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}

// Esc in a name field undoes the draft there; it closes the library only from elsewhere.
function keepOpenWhileEditing(event: KeyboardEvent): void {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.type !== 'search') event.preventDefault();
}

function LibraryLoading({ campaign, onClose }: LibraryDialogProps): React.JSX.Element {
  return (
    <>
      <LibraryHeader subtitle={campaign.name} onClose={onClose} />
      <p role="status" className="p-6 text-sm text-muted-foreground">
        Carregando a biblioteca…
      </p>
    </>
  );
}

function LoadedLibrary(props: LibraryDialogProps): React.JSX.Element {
  const result = use(props.library);
  if (result.ok) return <LibraryBrowser {...props} library={result.value} />;
  if (result.failure.kind === 'unauthenticated')
    return <SignedOutRedirect sessionStore={props.sessionStore} />;
  return <LibraryLoadFailure {...props} failure={result.failure} />;
}

function LibraryLoadFailure(props: LibraryDialogProps & Readonly<{ failure: LibraryFailure }>) {
  const { revalidate, state } = useRevalidator();
  return (
    <>
      <LibraryHeader subtitle={props.campaign.name} onClose={props.onClose} />
      <div className="flex flex-col items-start gap-4 p-6">
        <p role="alert" className="text-sm text-destructive-text">
          {`Não deu para abrir a biblioteca. ${libraryFailureMessage(props.failure.kind)}`}
        </p>
        <Button variant="outline" disabled={state === 'loading'} onClick={() => void revalidate()}>
          Tentar de novo
        </Button>
      </div>
    </>
  );
}
