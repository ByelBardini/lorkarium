import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CampaignDetailDto } from '@lorkarium/contracts';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';
import { CheckIcon, FileTextIcon, LockKeyholeIcon, PanelTopIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Clipboard } from '@/services/clipboard';
import type { DocumentsApi } from '@/services/documents-api';
import type { InteractionClock } from '@/lib/interaction-clock';
import { focusWhenUncovered } from '@/lib/focus-when-uncovered';
import type { MixedLibrary } from '@/lib/library-entries';
import { isBlankDocumentContent } from '@/lib/document-blank';
import {
  createDocumentEditorStore,
  documentTabEditorKey,
  type DocumentEditorState,
  type DocumentSaveStatus,
  type DocumentTabEditorState,
} from '@/stores/document-editor-store';
import { useLibrarySubmit, type LibrarySubmit } from '@/features/library/use-library-submit';
import { DocumentSharing } from './document-sharing';
import { DOCUMENT_SAVE_LABEL } from './document-messages';
import { DocumentPanelDialog, type DocumentPanelConfirmation } from './document-panel-dialog';
import { DocumentTabBody } from './document-tab-body';
import { DocumentTabStrip } from './document-tab-strip';
import { DraftProblemActions } from './draft-problem-actions';

export type DocumentPanelProps = Readonly<{
  campaign: CampaignDetailDto;
  documentId: string;
  api: DocumentsApi;
  library: MixedLibrary;
  live: boolean;
  revision: number;
  clock: InteractionClock;
  clipboard: Clipboard;
  focusName?: boolean;
  onChanged: () => void;
  onClose?: () => void;
  onOpenWindow?: () => void;
  editorStore?: StoreApi<DocumentEditorState>;
  submit?: LibrarySubmit;
  onRegisterLeave?: (guard: (() => Promise<boolean>) | null) => void;
  /** A detached window: one short header line, the window's title bar already names the table. */
  compact?: boolean;
  /** The tab shown, kept by the workspace; without it the panel remembers its own. */
  activeTabId?: string | null;
  onActivateTab?: (tabId: string) => void;
}>;

/** An authorized document with an in-memory versioned draft. Example: `<DocumentPanel {...props} />`. */
export function DocumentPanel(props: DocumentPanelProps): React.JSX.Element {
  if (props.submit) return <DocumentPanelContent {...props} submit={props.submit} />;
  return <RoutedDocumentPanel {...props} />;
}

function RoutedDocumentPanel(props: DocumentPanelProps): React.JSX.Element {
  const submit = useLibrarySubmit();
  return <DocumentPanelContent {...props} submit={submit} />;
}

function DocumentPanelContent(
  props: DocumentPanelProps & { submit: LibrarySubmit },
): React.JSX.Element {
  const { onRegisterLeave, onChanged, focusName } = props;
  const [store] = useState(
    () =>
      props.editorStore ??
      createDocumentEditorStore({
        ...props,
        campaignId: props.campaign.id,
        newActionId: () => crypto.randomUUID(),
      }),
  );
  const state = useStore(store);
  const submit = props.submit;
  const disposal = useRef<(() => void) | null>(null);
  const [leaveAnswer, setLeaveAnswer] = useState<((discard: boolean) => void) | null>(null);
  const [confirmation, setConfirmation] = useState<DocumentPanelConfirmation | null>(null);
  const [localTabId, setLocalTabId] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (props.editorStore) return;
    disposal.current?.();
    void store.getState().load();
    return () => {
      disposal.current = props.clock.after(0, () => store.getState().dispose());
    };
  }, [store, props.clock, props.editorStore]);
  useEffect(() => {
    store.getState().setLive(props.live);
  }, [store, props.live]);
  useEffect(() => {
    void store.getState().revalidate();
  }, [store, props.revision, props.campaign.myRole]);
  const confirmedId = state.confirmed?.id;
  const confirmedVersion = state.confirmed?.version;
  useEffect(() => {
    const input = nameInput.current;
    if (!focusName || !confirmedId || !input) return;
    return focusWhenUncovered(input);
  }, [focusName, confirmedId]);
  useEffect(() => {
    const guard = async (): Promise<boolean> => {
      await store.getState().flush();
      if (!store.getState().dirty) return true;
      return new Promise((resolve) => setLeaveAnswer(() => resolve));
    };
    onRegisterLeave?.(guard);
    return () => onRegisterLeave?.(null);
  }, [store, onRegisterLeave]);
  useEffect(() => {
    if (!state.dirty) return;
    const before = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [state.dirty]);
  useEffect(() => {
    if (state.status === 'saved' && confirmedVersion) onChanged();
  }, [state.status, confirmedVersion, onChanged]);
  const tabs = state.confirmed?.tabs ?? [];
  const wantedTabId = props.activeTabId ?? localTabId;
  const activeTabId = tabs.some((tab) => tab.id === wantedTabId)
    ? wantedTabId
    : (tabs[0]?.id ?? null);
  const hasConfirmed = !!state.confirmed;
  useEffect(() => {
    if (activeTabId && hasConfirmed) store.getState().openTab(activeTabId);
  }, [store, activeTabId, hasConfirmed]);
  const tabKey = (tabId: string): string =>
    documentTabEditorKey(props.campaign.id, props.documentId, tabId);
  const tabEditor = activeTabId ? state.tabEditors[tabKey(activeTabId)] : undefined;
  const tabStatus = useTabStatus(tabEditor);
  const activateTab = (tabId: string): void => {
    if (props.onActivateTab) return props.onActivateTab(tabId);
    store.getState().openTab(tabId);
    setLocalTabId(tabId);
  };
  const isBlank = (tabId: string): boolean => {
    const tab = state.tabEditors[tabKey(tabId)]?.getState();
    return !!tab?.confirmed && !tab.dirty && isBlankDocumentContent(tab.confirmed.content);
  };
  const askReload = (discard: () => Promise<void>): void =>
    setConfirmation({ kind: 'reload', discard });
  const document = state.confirmed;
  if (!document || !state.draft)
    return (
      <section aria-label="Documento escolhido" className="p-6">
        <p role="status">{DOCUMENT_SAVE_LABEL[state.status]}</p>
      </section>
    );
  const editable =
    document.canEdit && !['conflict', 'forbidden', 'not_found', 'loading'].includes(state.status);
  // A conflict on the name keeps the tabs writable: each has its own version.
  const bodyEditable = document.canEdit && !['forbidden', 'not_found'].includes(state.status);
  const shownStatus = worseStatus(state.status, tabStatus);
  return (
    <section
      aria-label="Documento escolhido"
      className="document-workspace flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
    >
      <header
        className={cn(
          'flex shrink-0 flex-wrap items-center border-b border-divider',
          props.compact ? 'gap-3 px-4 py-1.5' : 'gap-4 px-5 py-4 sm:px-8',
        )}
      >
        {!props.compact && (
          <FileTextIcon
            aria-hidden="true"
            className="hidden size-5 shrink-0 text-primary sm:block"
          />
        )}
        <div className="min-w-40 flex-1">
          {!props.compact && (
            <p className="mb-0.5 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              {props.campaign.name}{' '}
              <span aria-hidden="true" className="mx-1.5 text-divider">
                /
              </span>{' '}
              Documento
            </p>
          )}
          <Input
            ref={nameInput}
            aria-label="Nome do documento"
            value={state.draft.name}
            maxLength={60}
            disabled={!editable}
            onChange={(event) => state.edit({ name: event.target.value })}
            className={cn(
              'h-8 w-full rounded-none border-0 bg-transparent px-0 font-medium tracking-tight text-foreground focus-visible:ring-0 disabled:opacity-100',
              props.compact ? 'text-base' : 'text-xl sm:text-2xl',
            )}
          />
        </div>
        <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {shownStatus === 'saved' && <CheckIcon aria-hidden="true" className="size-3.5" />}
          {DOCUMENT_SAVE_LABEL[shownStatus]}
        </p>
        <DocumentSharing
          key={`${document.id}:${document.version}`}
          document={document}
          campaign={props.campaign}
          submit={submit}
          disabled={!props.live || state.dirty || state.status === 'saving'}
          onDelete={() => setConfirmation({ kind: 'delete' })}
        />
        {!document.canManage && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <LockKeyholeIcon aria-hidden="true" className="size-3" />
            {document.canEdit ? 'Pode editar' : 'Somente leitura'}
          </span>
        )}
        {props.onOpenWindow && (
          <Button
            aria-label="Abrir documento em janela"
            title="Abrir em janela separada"
            variant="ghost"
            size="icon-sm"
            onClick={props.onOpenWindow}
          >
            <PanelTopIcon aria-hidden="true" />
          </Button>
        )}
        {props.onClose && (
          <Button
            aria-label="Fechar documento"
            title="Fechar documento"
            variant="ghost"
            size="icon-sm"
            onClick={props.onClose}
          >
            <XIcon aria-hidden="true" />
          </Button>
        )}
      </header>
      <DraftProblemActions
        status={state.status}
        dirty={state.dirty}
        draft={state.draft}
        clipboard={props.clipboard}
        onDiscard={() => state.discard()}
        onConfirmReload={askReload}
        onRetry={() => void state.flush()}
      />
      <DocumentTabStrip
        tabs={document.tabs}
        activeTabId={activeTabId}
        canEdit={bodyEditable && props.live}
        canManage={document.canManage}
        isBlank={isBlank}
        onActivate={activateTab}
        onCommand={(command) => state.runTabCommand(command)}
      />
      {tabEditor && activeTabId && (
        <DocumentTabBody
          key={tabKey(activeTabId)}
          editor={tabEditor}
          api={props.api}
          campaignId={props.campaign.id}
          documentId={document.id}
          tabId={activeTabId}
          library={props.library}
          clipboard={props.clipboard}
          canEdit={bodyEditable}
          onConfirmReload={askReload}
        />
      )}
      {(leaveAnswer || confirmation) && (
        <DocumentPanelDialog
          leaving={!!leaveAnswer}
          confirmation={confirmation}
          onCancel={() => {
            leaveAnswer?.(false);
            setLeaveAnswer(null);
            setConfirmation(null);
          }}
          onConfirm={() => {
            if (leaveAnswer) {
              leaveAnswer(true);
              setLeaveAnswer(null);
              return;
            }
            setConfirmation(null);
            if (confirmation?.kind === 'reload') return void confirmation.discard();
            void submit({
              intent: 'removeDocument',
              documentId: document.id,
              changes: { actionId: crypto.randomUUID(), expectedVersion: document.version },
            });
          }}
        />
      )}
    </section>
  );
}

// The header says the worst of the name's and the shown tab's state.
const STATUS_WEIGHT: readonly DocumentSaveStatus[] = [
  'saved',
  'loading',
  'pending',
  'saving',
  'offline',
  'failure',
  'conflict',
  'forbidden',
  'not_found',
];
function worseStatus(name: DocumentSaveStatus, tab: DocumentSaveStatus | null): DocumentSaveStatus {
  if (tab === null) return name;
  return STATUS_WEIGHT.indexOf(tab) > STATUS_WEIGHT.indexOf(name) ? tab : name;
}

function useTabStatus(
  editor: StoreApi<DocumentTabEditorState> | undefined,
): DocumentSaveStatus | null {
  return useSyncExternalStore(
    (changed) => editor?.subscribe(changed) ?? (() => undefined),
    () => editor?.getState().status ?? null,
  );
}
