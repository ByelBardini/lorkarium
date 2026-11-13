import { useId, useState } from 'react';
import {
  DOCUMENT_PREVIEW_SUMMARY_MAX_LENGTH,
  type DocumentDto,
  type DocumentPreviewDto,
  type DocumentWriteResponseDto,
} from '@lorkarium/contracts';
import { ChevronDownIcon, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { MixedLibrary } from '@/lib/library-entries';
import { assetUrlOf } from '@/services/assets-api';
import type { DocumentsApi, DocumentsResult } from '@/services/documents-api';
import { DocumentImagePicker } from './document-image-picker';
import { documentFailureMessage } from './document-messages';

export type DocumentPreviewFieldsProps = Readonly<{
  document: DocumentDto;
  api: DocumentsApi;
  campaignId: string;
  library: MixedLibrary;
  /** The tab shown: a new cover is prepared in it, as any image of the document. */
  tabId: string | null;
  /** The document may be edited right now (rights and connection). */
  canEdit: boolean;
  onSave: (preview: DocumentPreviewDto) => Promise<DocumentsResult<DocumentWriteResponseDto>>;
}>;
type PreviewSaver = Readonly<{
  saving: boolean;
  problem: string | null;
  save: (preview: DocumentPreviewDto) => Promise<void>;
}>;

/** The "Prévia" block of the editor: the summary and cover the library shows instead of a
 *  thumbnail of the body, saved apart from it. Folded until asked; only editors get it.
 *
 *  Example: `<DocumentPreviewFields document={doc} canEdit onSave={store.savePreview} {...rest} />` */
export function DocumentPreviewFields(props: DocumentPreviewFieldsProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  if (!props.document.canEdit) return null;
  return (
    <section
      aria-label="Prévia na biblioteca"
      className="shrink-0 border-b border-divider px-5 py-1.5 text-xs sm:px-8"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(!open)}
        className="flex cursor-pointer items-center gap-1.5 rounded-sm text-muted-foreground outline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChevronDownIcon aria-hidden="true" className={cn('size-3.5', !open && '-rotate-90')} />
        Prévia
        <span className="text-muted-foreground/80">· {previewStateOf(props.document.preview)}</span>
      </button>
      {open && <PreviewEditor id={bodyId} {...props} />}
    </section>
  );
}

function previewStateOf(preview: DocumentPreviewDto): string {
  if (preview.summary && preview.imageAssetId) return 'resumo e capa';
  if (preview.summary) return 'resumo';
  if (preview.imageAssetId) return 'capa';
  return 'miniatura do conteúdo';
}

function PreviewEditor(props: DocumentPreviewFieldsProps & { id: string }): React.JSX.Element {
  const { preview } = props.document;
  const saver = usePreviewSaver(props.onSave);
  const [summary, setSummary] = useSummaryDraft(preview.summary);
  const [picking, setPicking] = useState(false);
  const disabled = !props.canEdit || saver.saving;
  const typed = (): string | null => summary.trim() || null;
  const saveSummary = (): void => {
    if (typed() !== preview.summary) void saver.save({ ...preview, summary: typed() });
  };
  return (
    <div id={props.id} className="flex flex-wrap items-start gap-4 pt-2 pb-1.5">
      <PreviewCover
        assetId={preview.imageAssetId}
        disabled={disabled || !props.tabId}
        onPick={() => setPicking(true)}
        onRemove={() => void saver.save({ summary: typed(), imageAssetId: null })}
      />
      <SummaryField
        value={summary}
        disabled={disabled}
        onChange={setSummary}
        onCommit={saveSummary}
      />
      {saver.problem && (
        <p role="alert" className="basis-full text-destructive-text">
          {saver.problem}
        </p>
      )}
      {picking && props.tabId && (
        <DocumentImagePicker
          api={props.api}
          campaignId={props.campaignId}
          documentId={props.document.id}
          tabId={props.tabId}
          images={props.library.images ?? []}
          title="Capa da prévia"
          description="A capa aparece na biblioteca no lugar da miniatura do documento."
          onChoose={(asset) => {
            setPicking(false);
            if (asset) void saver.save({ summary: typed(), imageAssetId: asset.id });
          }}
        />
      )}
    </div>
  );
}

// The typed summary, replaced by a newer confirmed one (another editor, or this save's answer).
function useSummaryDraft(confirmed: string | null): readonly [string, (summary: string) => void] {
  const [draft, setDraft] = useState(confirmed ?? '');
  const [seen, setSeen] = useState(confirmed);
  if (seen !== confirmed) {
    setSeen(confirmed);
    setDraft(confirmed ?? '');
  }
  return [draft, setDraft];
}

function usePreviewSaver(onSave: DocumentPreviewFieldsProps['onSave']): PreviewSaver {
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const save = async (preview: DocumentPreviewDto): Promise<void> => {
    setSaving(true);
    setProblem(null);
    const result = await onSave(preview);
    setSaving(false);
    if (!result.ok) setProblem(documentFailureMessage(result.failure));
  };
  return { saving, problem, save };
}

type PreviewCoverProps = Readonly<{
  assetId: string | null;
  disabled: boolean;
  onPick: () => void;
  onRemove: () => void;
}>;
function PreviewCover(props: PreviewCoverProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-divider bg-card">
        {props.assetId ? (
          <img
            src={assetUrlOf(props.assetId)}
            alt="Capa da prévia"
            className="size-full object-cover"
          />
        ) : (
          <ImageIcon aria-hidden="true" className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col items-start gap-1">
        <Button variant="outline" size="sm" disabled={props.disabled} onClick={props.onPick}>
          {props.assetId ? 'Trocar capa' : 'Escolher capa'}
        </Button>
        {props.assetId && (
          <Button variant="ghost" size="sm" disabled={props.disabled} onClick={props.onRemove}>
            Remover capa
          </Button>
        )}
      </div>
    </div>
  );
}

type SummaryFieldProps = Readonly<{
  value: string;
  disabled: boolean;
  onChange: (summary: string) => void;
  onCommit: () => void;
}>;
function SummaryField(props: SummaryFieldProps): React.JSX.Element {
  const fieldId = useId();
  return (
    <div className="flex min-w-48 flex-1 flex-col gap-1 text-muted-foreground">
      <label htmlFor={fieldId}>Resumo da prévia</label>
      <Textarea
        id={fieldId}
        value={props.value}
        maxLength={DOCUMENT_PREVIEW_SUMMARY_MAX_LENGTH}
        disabled={props.disabled}
        placeholder="Uma ou duas frases para quem vê o documento na biblioteca"
        onChange={(event) => props.onChange(event.target.value)}
        onBlur={props.onCommit}
        className="min-h-16 py-2 text-sm"
      />
      <span className="self-end tabular-nums">
        {props.value.length}/{DOCUMENT_PREVIEW_SUMMARY_MAX_LENGTH}
      </span>
    </div>
  );
}
