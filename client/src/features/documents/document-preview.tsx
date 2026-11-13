import type { DocumentPreviewDto, DocumentSummaryDto, DocumentTabDto } from '@lorkarium/contracts';
import { assetUrlOf } from '@/services/assets-api';
import type { DocumentsApi, DocumentsFailure } from '@/services/documents-api';
import { lazy, Suspense, useEffect, useState } from 'react';
import { FileTextIcon, LockKeyholeIcon, PanelsTopLeftIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToolbarMenuSelect } from '@/rich-text-editor/toolbar-menu-select';
import { documentFailureMessage } from './document-messages';
const DocumentReader = lazy(() => import('@/rich-text-editor/document-editor'));

export type DocumentPreviewProps = Readonly<{
  campaignId: string;
  summary: DocumentSummaryDto;
  api: DocumentsApi;
  live: boolean;
  onOpenWindow: () => void;
}>;
/** A read-only glimpse of a document, with "Abrir em outra janela" by its title; the room tab
 *  opens by a double click or Enter on the item. The preview its editors set (summary and/or
 *  cover) takes the place of the body; without one, the body of a tab is shown.
 *  Example: `<DocumentPreview {...props} />`. */
export function DocumentPreview(props: DocumentPreviewProps): React.JSX.Element {
  const { summary } = props;
  const { preview } = summary;
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
      <div className="px-6 pt-4">
        <Button
          variant="outline"
          size="sm"
          aria-label="Abrir documento em outra janela"
          onClick={props.onOpenWindow}
        >
          <PanelsTopLeftIcon aria-hidden />
          Abrir em outra janela
        </Button>
      </div>
      {preview.summary || preview.imageAssetId ? (
        <DocumentCard preview={preview} />
      ) : (
        <DocumentBodyGlimpse {...props} />
      )}
    </section>
  );
}

function DocumentCard({ preview }: Readonly<{ preview: DocumentPreviewDto }>): React.JSX.Element {
  return (
    <div className="mx-5 my-6 overflow-hidden rounded-sm border border-border bg-background shadow-sm">
      {preview.imageAssetId && (
        <img
          src={assetUrlOf(preview.imageAssetId)}
          alt="Capa do documento"
          className="max-h-72 w-full object-cover"
        />
      )}
      {preview.summary && (
        <p className="p-5 text-sm whitespace-pre-line text-foreground">{preview.summary}</p>
      )}
    </div>
  );
}

function DocumentBodyGlimpse(props: DocumentPreviewProps): React.JSX.Element {
  const [chosenTabId, chooseTab] = useState<string | null>(null);
  const preview = usePreviewTab(props, chosenTabId);
  const { tab, tabs, problem } = preview;
  return (
    <div className="mx-5 my-6 min-h-52 overflow-hidden rounded-sm border border-border bg-background shadow-sm">
      {tabs.length > 1 && tab && (
        <div className="border-b border-border px-3 py-1.5">
          <ToolbarMenuSelect
            label="Aba da prévia"
            value={tab.id}
            options={tabs.map(({ id, name }) => ({ value: id, label: name }))}
            onChoose={chooseTab}
          />
        </div>
      )}
      {tab ? (
        <Suspense
          fallback={
            <p role="status" className="p-5 text-sm text-muted-foreground">
              Carregando prévia…
            </p>
          }
        >
          <div className="pointer-events-none max-h-72 overflow-hidden text-sm">
            <DocumentReader key={tab.id} content={tab.content} editable={false} />
          </div>
        </Suspense>
      ) : (
        <div className="flex min-h-52 flex-col items-center justify-center gap-3 p-5 text-center text-sm text-muted-foreground">
          <FileTextIcon aria-hidden className="size-8 opacity-35" />
          <p role="status">{problem ?? 'Carregando prévia…'}</p>
          {problem && (
            <Button variant="outline" size="sm" onClick={preview.retry}>
              Tentar de novo
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

type PreviewTab = Readonly<{
  tab: DocumentTabDto | null;
  tabs: readonly Readonly<{ id: string; name: string }>[];
  problem: string | null;
  retry: () => void;
}>;
// The detail lists the tabs the reader sees; the body shown is the chosen one, else the first.
function usePreviewTab(props: DocumentPreviewProps, chosenTabId: string | null): PreviewTab {
  const [tab, setTab] = useState<DocumentTabDto | null>(null);
  const [tabs, setTabs] = useState<PreviewTab['tabs']>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, retry] = useState(0);
  const { api, campaignId, summary, live } = props;
  useEffect(() => {
    let current = true;
    const fail = (failure: DocumentsFailure): void => {
      if (!current) return;
      setTab(null);
      setProblem(documentFailureMessage(failure));
    };
    void api.detail(campaignId, summary.id).then(async (detail) => {
      if (!current) return;
      if (!detail.ok) return fail(detail.failure);
      setTabs(detail.value.tabs);
      const shown = detail.value.tabs.find(({ id }) => id === chosenTabId) ?? detail.value.tabs[0];
      if (!shown) return fail({ kind: 'not_found' });
      const body = await api.tab(campaignId, summary.id, shown.id);
      if (!body.ok) return fail(body.failure);
      if (!current) return;
      setTab(body.value);
      setProblem(null);
    });
    return () => {
      current = false;
    };
  }, [api, campaignId, summary.id, summary.version, summary.canEdit, live, attempt, chosenTabId]);
  return { tab, tabs, problem, retry: () => retry((value) => value + 1) };
}
