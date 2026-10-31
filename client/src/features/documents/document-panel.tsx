import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { AssetDto, CampaignDetailDto } from '@lorkarium/contracts';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';
import { CheckIcon, FileTextIcon, LockKeyholeIcon, PanelTopIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { assetUrlOf } from '@/services/assets-api';
import type { Clipboard } from '@/services/clipboard';
import type { DocumentsApi } from '@/services/documents-api';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { MixedLibrary } from '@/lib/library-entries';
import {
  createDocumentEditorStore,
  type DocumentEditorState,
} from '@/stores/document-editor-store';
import { useLibrarySubmit, type LibrarySubmit } from '@/features/library/use-library-submit';
import { DocumentSharing } from './document-sharing';
import { DocumentImagePicker } from './document-image-picker';
import { DOCUMENT_SAVE_LABEL, documentFailureMessage } from './document-messages';

const RichDocumentEditor = lazy(() => import('@/rich-text-editor/document-editor'));
type ImageReference = Readonly<{ assetId: string; alt?: string }>;
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
  const [confirmation, setConfirmation] = useState<'reload' | 'delete' | null>(null);
  const [imageAnswer, setImageAnswer] = useState<((image: AssetDto | null) => void) | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
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
    if (focusName && confirmedId) nameInput.current?.focus();
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
  const insertImage = (): Promise<ImageReference | null> =>
    new Promise((resolve) =>
      setImageAnswer(
        () => (asset: AssetDto | null) => resolve(asset ? { assetId: asset.id } : null),
      ),
    );
  const upload = async (file: File): Promise<ImageReference> => {
    const result = await props.api.uploadImage(props.campaign.id, props.documentId, file);
    if (!result.ok) {
      const message = documentFailureMessage(result.failure);
      setProblem(message);
      throw new Error(message);
    }
    return { assetId: result.value.id, alt: file.name };
  };
  const importImage = async (url: string): Promise<ImageReference> => {
    const result = await props.api.importImage(props.campaign.id, props.documentId, url);
    if (!result.ok) {
      const message = documentFailureMessage(result.failure);
      setProblem(message);
      throw new Error(message);
    }
    return { assetId: result.value.id };
  };
  const document = state.confirmed;
  if (!document || !state.draft)
    return (
      <section aria-label="Documento escolhido" className="p-6">
        <p role="status">{DOCUMENT_SAVE_LABEL[state.status]}</p>
      </section>
    );
  const editable =
    document.canEdit && !['conflict', 'forbidden', 'not_found', 'loading'].includes(state.status);
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
          {state.status === 'saved' && <CheckIcon aria-hidden="true" className="size-3.5" />}
          {DOCUMENT_SAVE_LABEL[state.status]}
        </p>
        <DocumentSharing
          key={`${document.id}:${document.version}`}
          document={document}
          campaign={props.campaign}
          submit={submit}
          disabled={!props.live || state.dirty || state.status === 'saving'}
          onDelete={() => setConfirmation('delete')}
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
      {['conflict', 'forbidden', 'failure', 'offline'].includes(state.status) && (
        <div className="flex flex-wrap gap-2 p-4">
          <Button
            variant="outline"
            onClick={() => void props.clipboard.copy(JSON.stringify(state.draft))}
          >
            Copiar meu rascunho
          </Button>
          <Button
            variant="outline"
            onClick={() => (state.dirty ? setConfirmation('reload') : void state.discard())}
          >
            Carregar versão atual
          </Button>
          {state.status === 'failure' && (
            <Button onClick={() => void state.flush()}>Tentar salvar novamente</Button>
          )}
        </div>
      )}
      <Suspense
        fallback={
          <p role="status" className="p-4">
            Carregando editor…
          </p>
        }
      >
        <RichDocumentEditor
          content={editable ? state.draft.content : document.content}
          editable={editable}
          onChange={(content) => state.edit({ content })}
          assetUrl={assetUrlOf}
          onInsertImage={insertImage}
          onImageFiles={(files) => Promise.all(files.map(upload))}
          onImportImage={importImage}
        />
      </Suspense>
      {problem && (
        <p role="alert" className="p-4 text-destructive-text">
          {problem}
        </p>
      )}
      {imageAnswer && editable && (
        <DocumentImagePicker
          api={props.api}
          campaignId={props.campaign.id}
          documentId={document.id}
          images={props.library.images ?? []}
          onChoose={(asset) => {
            imageAnswer(asset);
            setImageAnswer(null);
          }}
        />
      )}
      {(leaveAnswer || confirmation) && (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              leaveAnswer?.(false);
              setLeaveAnswer(null);
              setConfirmation(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogTitle>
              {leaveAnswer
                ? 'Alterações ainda não salvas'
                : confirmation === 'reload'
                  ? 'Descartar meu rascunho?'
                  : 'Excluir documento?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {state.dirty
                ? 'Continue editando para conservar o rascunho ou descarte as alterações locais.'
                : 'O documento será excluído da mesa.'}
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {state.dirty ? 'Continuar editando' : 'Cancelar'}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (leaveAnswer) {
                    leaveAnswer(true);
                    setLeaveAnswer(null);
                    return;
                  }
                  setConfirmation(null);
                  if (confirmation === 'reload') {
                    void state.discard();
                    return;
                  }
                  void submit({
                    intent: 'removeDocument',
                    documentId: document.id,
                    changes: { actionId: crypto.randomUUID(), expectedVersion: document.version },
                  });
                }}
              >
                {state.dirty ? 'Descartar alterações' : 'Excluir'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </section>
  );
}
