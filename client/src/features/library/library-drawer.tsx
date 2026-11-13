import type { CampaignDetailDto, CampaignLibraryDto } from '@lorkarium/contracts';
import { Suspense, use, useCallback, useEffect, useId, useRef } from 'react';
import { useRevalidator } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { SignedOutRedirect } from '@/components/signed-out-redirect';
import { Button } from '@/components/ui/button';
import { OWNS_ESCAPE_ATTRIBUTE } from '@/features/sheets/sheet-template-workbench';
import { OWNS_ROOM_KEYS_ATTRIBUTE } from '@/lib/board-shortcuts';
import {
  LIBRARY_DRAWER_DEFAULT_WIDTH,
  LIBRARY_DRAWER_WIDE_WIDTH,
  isWideLibraryDrawer,
} from '@/lib/library-drawer-width';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { SheetEditorLayoutMemory } from '@/lib/sheet-editor-layout';
import type { AssetsApi } from '@/services/assets-api';
import type { ChatWindowHost } from '@/services/chat-window-host';
import type { Clipboard } from '@/services/clipboard';
import type { DocumentsApi } from '@/services/documents-api';
import type { FileDownload } from '@/services/file-download';
import type { ImagePresentationApi } from '@/services/image-presentation-api';
import type { LibraryApi, LibraryFailure, LibraryResult } from '@/services/library-api';
import type { LibraryMapsApi } from '@/services/library-maps-api';
import type { SheetTemplatesApi } from '@/services/sheet-templates-api';
import type { DocumentWorkspaceStore } from '@/stores/document-workspace-store';
import type { RoomLayoutStore } from '@/stores/room-layout-store';
import type { SessionStore } from '@/stores/session-store';
import { LibraryBrowser, type LibrarySizing } from './library-browser';
import { LibraryHeader } from './library-header';
import { libraryFailureMessage } from './library-messages';
import { LibraryWidthHandle } from './library-width-handle';
import { useLibraryDrawerWidth } from './use-library-drawer-width';
import { useOutsidePress } from './use-outside-press';
import { useRevalidateOnLibraryChange, type LibraryTableView } from './use-library-table';

export type LibraryDrawerProps = Readonly<{
  campaign: CampaignDetailDto;
  /** The list as the loader asked for it, not awaited: the drawer opens while it comes. */
  library: Promise<LibraryResult<CampaignLibraryDto>>;
  tableView: LibraryTableView;
  sessionStore: StoreApi<SessionStore>;
  /** Keeps the width the user dragged the drawer to. */
  roomLayout: StoreApi<RoomLayoutStore>;
  now: Date;
  assets: AssetsApi;
  api: LibraryApi;
  mapsApi: LibraryMapsApi;
  presentations: ImagePresentationApi;
  documentsApi: DocumentsApi;
  sheetTemplatesApi?: SheetTemplatesApi;
  sheetEditorLayout?: SheetEditorLayoutMemory;
  clock: InteractionClock;
  clipboard: Clipboard;
  fileDownload?: FileDownload;
  documentWorkspace?: StoreApi<DocumentWorkspaceStore>;
  chatWindowHost?: ChatWindowHost;
  onClose: () => void;
}>;

type GuardedDrawerProps = LibraryDrawerProps &
  Readonly<{
    titleId: string;
    width: number;
    sizing: LibrarySizing;
    onRegisterLeave: (guard: (() => Promise<boolean>) | null) => void;
  }>;

/** The library as a drawer beside the board, not a modal: the board keeps its clicks, wheel and
 *  keys. Loading, the failure with "Tentar de novo", or the browser; its edge drags the width.
 *  Esc (but in a field) and a press outside it go back to the room (so do ⇧B and the tabs strip's "Biblioteca").
 *
 *  Example: `<LibraryDrawer campaign={campaign} library={promise} tableView={view} roomLayout={layout} … onClose={back} />` */
export function LibraryDrawer(props: LibraryDrawerProps): React.JSX.Element {
  useRevalidateOnLibraryChange(props.tableView.table?.tabs ?? null);
  const titleId = useId();
  const drawer = useRef<HTMLElement>(null);
  const sizing = useLibraryDrawerWidth(props.roomLayout);
  // Opening it takes the focus there, as the modal did: Esc and the tree's keys work at once.
  useEffect(() => drawer.current?.focus({ preventScroll: true }), []);
  const leaveGuard = useRef<(() => Promise<boolean>) | null>(null);
  const onRegisterLeave = useCallback((guard: (() => Promise<boolean>) | null) => {
    leaveGuard.current = guard;
  }, []);
  const close = (): void => {
    void (async () => {
      if (!leaveGuard.current || (await leaveGuard.current())) props.onClose();
    })();
  };
  // A press outside closes it (the board still gets the press: no overlay).
  useOutsidePress(drawer, close);
  const wide = isWideLibraryDrawer(sizing.width);
  const toggleWide = (): void =>
    sizing.onWidth(wide ? LIBRARY_DRAWER_DEFAULT_WIDTH : LIBRARY_DRAWER_WIDE_WIDTH, true);
  const guarded = {
    ...props,
    titleId,
    onClose: close,
    onRegisterLeave,
    ...sizing,
    sizing: { wide, toggleWide },
  };
  return (
    <aside
      ref={drawer}
      aria-labelledby={titleId}
      tabIndex={-1}
      {...{ [OWNS_ROOM_KEYS_ATTRIBUTE]: '' }}
      onKeyDown={(event) => closesOnEscape(event) && close()}
      style={{ '--library-width': `${sizing.width}px` } as React.CSSProperties}
      className="pointer-events-auto relative flex h-full w-full max-w-full flex-col overflow-hidden border-r border-border bg-panel shadow-xl outline-none md:w-(--library-width) md:max-w-[70%]"
    >
      <Suspense fallback={<LibraryLoading {...guarded} />}>
        <LoadedLibrary {...guarded} />
      </Suspense>
      <LibraryWidthHandle drawer={drawer} {...sizing} />
    </aside>
  );
}

// Esc in a field (a name, CodeMirror, the template's full-screen preview) is the field's own
// (a search or a radio, like the type filter in the search popover, is no text to give up: it
// closes);
// and a key from a menu or dialog portaled out of the drawer is not the drawer's.
const CLOSING_INPUT_TYPES: ReadonlySet<string> = new Set(['search', 'radio', 'checkbox']);

function closesOnEscape(event: React.KeyboardEvent<HTMLElement>): boolean {
  if (event.key !== 'Escape' || event.defaultPrevented) return false;
  const target = event.target;
  if (!(target instanceof Element) || !event.currentTarget.contains(target)) return false;
  if (target instanceof HTMLInputElement && !CLOSING_INPUT_TYPES.has(target.type)) return false;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return false;
  if (target.closest('[contenteditable="true"]')) return false;
  return target.closest(`[${OWNS_ESCAPE_ATTRIBUTE}]`) === null;
}

function LibraryLoading({ titleId }: GuardedDrawerProps): React.JSX.Element {
  return (
    <>
      <LibraryHeader titleId={titleId} />
      <p role="status" className="p-6 text-sm text-muted-foreground">
        Carregando a biblioteca…
      </p>
    </>
  );
}

function LoadedLibrary(props: GuardedDrawerProps): React.JSX.Element {
  const result = use(props.library);
  if (result.ok) return <LibraryBrowser {...props} library={result.value} />;
  if (result.failure.kind === 'unauthenticated')
    return <SignedOutRedirect sessionStore={props.sessionStore} />;
  return <LibraryLoadFailure {...props} failure={result.failure} />;
}

function LibraryLoadFailure(props: GuardedDrawerProps & Readonly<{ failure: LibraryFailure }>) {
  const { revalidate, state } = useRevalidator();
  return (
    <>
      <LibraryHeader titleId={props.titleId} />
      <div className="flex flex-col items-start gap-4 p-6">
        <p role="alert" className="text-sm text-destructive-text">
          {`Não deu para abrir a biblioteca. ${libraryFailureMessage(props.failure)}`}
        </p>
        <Button variant="outline" disabled={state === 'loading'} onClick={() => void revalidate()}>
          Tentar de novo
        </Button>
      </div>
    </>
  );
}
