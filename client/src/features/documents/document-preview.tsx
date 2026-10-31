import type { DocumentSummaryDto, DocumentDto } from '@lorkarium/contracts';
import type { DocumentsApi } from '@/services/documents-api';
import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowUpRightIcon, FileTextIcon, LockKeyholeIcon, PanelsTopLeftIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { documentFailureMessage } from './document-messages';
const DocumentReader = lazy(() => import('@/rich-text-editor/document-editor'));

export type DocumentPreviewProps = Readonly<{
  campaignId: string;
  summary: DocumentSummaryDto;
  api: DocumentsApi;
  live: boolean;
  onOpen: () => void;
  onOpenWindow: () => void;
}>;
/** A read-only glimpse before opening a document workspace. Example: `<DocumentPreview {...props} />`. */
export function DocumentPreview(props: DocumentPreviewProps): React.JSX.Element {
  const [document, setDocument] = useState<DocumentDto | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, retry] = useState(0);
  const { api, campaignId, summary, live } = props;
  useEffect(() => {
    let current = true;
    void api.detail(campaignId, summary.id).then((result) => {
      if (!current) return;
      setDocument(result.ok ? result.value : null);
      setProblem(result.ok ? null : documentFailureMessage(result.failure));
    });
    return () => {
      current = false;
    };
  }, [api, campaignId, summary.id, summary.version, summary.canEdit, live, attempt]);
  return (
    <section
      aria-label="Prévia do documento"
      className="flex min-h-0 flex-col border-l border-border bg-panel"
    >
      <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4">
        <div className="min-w-0">
          <p className="mb-2 text-[10px] tracking-[.16em] text-muted-foreground uppercase">
            Documento
          </p>
          <h3 className="truncate font-display text-2xl">{summary.name}</h3>
        </div>
        <FileTextIcon aria-hidden className="mt-1 size-5 shrink-0 text-primary/70" />
      </div>
      <div className="flex items-center gap-2 px-6 text-xs text-muted-foreground">
        {summary.visibility === 'private' && <LockKeyholeIcon aria-hidden className="size-3" />}
        {summary.visibility === 'private' ? 'Privado' : 'Visível na mesa'}
        <span aria-hidden>·</span>
        {summary.canEdit ? 'Você pode editar' : 'Somente leitura'}
      </div>
      <div className="mx-5 my-6 min-h-52 overflow-hidden rounded-sm border border-border bg-background shadow-sm">
        {document ? (
          <Suspense
            fallback={
              <p role="status" className="p-5 text-sm text-muted-foreground">
                Carregando prévia…
              </p>
            }
          >
            <div className="pointer-events-none max-h-72 overflow-hidden text-sm">
              <DocumentReader content={document.content} editable={false} />
            </div>
          </Suspense>
        ) : (
          <div className="flex min-h-52 flex-col items-center justify-center gap-3 p-5 text-center text-sm text-muted-foreground">
            <FileTextIcon aria-hidden className="size-8 opacity-35" />
            <p role="status">{problem ?? 'Carregando prévia…'}</p>
            {problem && (
              <Button variant="outline" size="sm" onClick={() => retry((value) => value + 1)}>
                Tentar de novo
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="mt-auto flex flex-col gap-2 border-t border-border p-5">
        <Button onClick={props.onOpen}>
          <ArrowUpRightIcon aria-hidden />
          Expandir documento
        </Button>
        <Button
          variant="outline"
          aria-label="Abrir documento em outra janela"
          onClick={props.onOpenWindow}
        >
          <PanelsTopLeftIcon aria-hidden />
          Abrir em outra janela
        </Button>
      </div>
    </section>
  );
}
