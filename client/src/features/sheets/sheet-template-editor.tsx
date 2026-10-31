import { SHEET_TEMPLATE_NAME_MAX_LENGTH } from '@lorkarium/contracts';
import { FileCode2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SheetEditorLayoutMemory } from '@/lib/sheet-editor-layout';
import { cn } from '@/lib/utils';
import type { ChatWindowHost } from '@/services/chat-window-host';
import type { Clipboard } from '@/services/clipboard';
import type { SheetChannel } from '@/sheet-sandbox/sheet-frame';
import type { SheetTemplateDraftState } from '@/stores/sheet-template-draft-store';
import type { StoreApi } from 'zustand/vanilla';
import {
  TemplateEditorMoveButtons,
  type TemplateEditorMoves,
} from './sheet-template-editor-actions';
import { sheetSourceSizeLabel } from './sheet-template-messages';
import { SheetTemplateWorkbench } from './sheet-template-workbench';
import { useSheetTemplateDraft, type TemplateDraftModel } from './use-sheet-template-draft';
import { useSaveShortcut } from './use-save-shortcut';
import { useTemplateLeaveGuard, type RegisterLeave } from './use-template-leave-guard';

export type SheetTemplateEditorProps = Readonly<{
  /** The template's draft: the library's own, or the one its room tab keeps. */
  draft: StoreApi<SheetTemplateDraftState>;
  /** The table is connected: saving needs it. */
  live: boolean;
  createChannel?: () => SheetChannel;
  /** Leaving with unsaved code asks first (see `useTemplateLeaveGuard`). */
  onRegisterLeave?: RegisterLeave;
  /** "Abrir modelo em aba", "Abrir modelo em janela", "Fechar modelo". */
  moves?: TemplateEditorMoves;
  /** Where the divider and the console's open state are remembered (per person). */
  layoutMemory?: SheetEditorLayoutMemory;
  /** Opens the preview in its own window ("Abrir prévia em janela"). */
  windows?: ChatWindowHost;
  /** The clock of the console's lines. */
  now?: () => Date;
  /** "Copiar documentação" of the API tab. */
  clipboard?: Clipboard;
}>;

/** The master's editor of one sheet template: name, HTML/CSS/JS with highlight, the size against
 *  the budget, save against the version read, the live preview (resizable, full screen or in its
 *  own window) with its console, and the API reference.
 *
 *  Example: `<SheetTemplateEditor key={id} draft={createSheetTemplateDraftStore({ api, campaignId, templateId: id })} live />` */
export function SheetTemplateEditor(props: SheetTemplateEditorProps): React.JSX.Element {
  const model = useSheetTemplateDraft(props.draft);
  const leaveDialog = useTemplateLeaveGuard(model.dirty, props.onRegisterLeave);
  const editorRef = useSaveShortcut(() => {
    if (!saveBlocked(model, props.live)) void model.save();
  });
  if (model.load !== 'ready') return <EditorPlaceholder model={model} />;
  return (
    <section
      ref={editorRef}
      aria-label="Editor do modelo"
      className="flex min-h-0 flex-1 flex-col border-l border-border bg-panel"
    >
      <EditorHeader model={model} live={props.live} moves={props.moves} />
      <EditorProblem model={model} />
      <SheetTemplateWorkbench
        templateId={model.base?.id ?? ''}
        draft={model.draft}
        onEdit={model.edit}
        createChannel={props.createChannel}
        layoutMemory={props.layoutMemory}
        windows={props.windows}
        now={props.now}
        clipboard={props.clipboard}
      />
      {leaveDialog}
    </section>
  );
}

function EditorPlaceholder({ model }: Readonly<{ model: TemplateDraftModel }>) {
  return (
    <section
      aria-label="Editor do modelo"
      className="flex flex-1 flex-col items-center justify-center gap-3 border-l border-border bg-panel p-6 text-sm text-muted-foreground"
    >
      <FileCode2Icon aria-hidden="true" className="size-8 opacity-35" />
      <p role="status">{model.problem ?? 'Carregando o modelo…'}</p>
      {model.load === 'failed' && (
        <Button variant="outline" size="sm" onClick={() => void model.reload()}>
          Tentar de novo
        </Button>
      )}
    </section>
  );
}

type EditorHeaderProps = Readonly<{
  model: TemplateDraftModel;
  live: boolean;
  moves: TemplateEditorMoves | undefined;
}>;

function EditorHeader({ model, live, moves }: EditorHeaderProps) {
  const saving = model.phase === 'saving';
  const blocked = saveBlocked(model, live);
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-2">
      <Input
        aria-label="Nome do modelo"
        value={model.draft.name}
        maxLength={SHEET_TEMPLATE_NAME_MAX_LENGTH}
        onChange={(event) => model.edit({ name: event.target.value })}
        className="h-9 max-w-72 font-display text-lg"
      />
      <span className="flex-1" />
      <p
        aria-label="Tamanho do código"
        className={cn(
          'text-xs text-muted-foreground tabular-nums',
          model.overBudget && 'font-semibold text-destructive-text',
        )}
        data-over-budget={model.overBudget}
      >
        {sheetSourceSizeLabel(model.bytes)}
      </p>
      <p role="status" className="text-xs text-muted-foreground">
        {statusText(model)}
      </p>
      <Button
        size="sm"
        disabled={blocked}
        title="Salvar (Ctrl+S)"
        onClick={() => void model.save()}
      >
        {saving ? 'Salvando…' : 'Salvar'}
      </Button>
      <TemplateEditorMoveButtons moves={moves} />
    </header>
  );
}

// The button and Ctrl+S follow one rule: nothing changed, offline, saving or past the budget.
function saveBlocked(model: TemplateDraftModel, live: boolean): boolean {
  return !live || model.phase === 'saving' || model.overBudget || !model.dirty;
}

function statusText(model: TemplateDraftModel): string {
  if (model.overBudget) return 'Grande demais para salvar.';
  if (model.phase === 'saved' && !model.dirty) return 'Salvo.';
  return model.dirty ? 'Alterações não salvas.' : '';
}

function EditorProblem({ model }: Readonly<{ model: TemplateDraftModel }>) {
  if (model.phase === 'stashed')
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2 text-sm"
      >
        <span>Versão atual carregada. Seu texto ficou guardado.</span>
        <Button variant="outline" size="sm" onClick={model.restoreMine}>
          Voltar ao meu texto
        </Button>
      </div>
    );
  if (model.phase !== 'conflict' && model.phase !== 'failed') return null;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2 text-sm text-destructive-text"
    >
      <span>{model.problem}</span>
      {model.phase === 'conflict' && (
        <Button variant="outline" size="sm" onClick={() => void model.loadCurrent()}>
          Carregar versão atual
        </Button>
      )}
    </div>
  );
}
