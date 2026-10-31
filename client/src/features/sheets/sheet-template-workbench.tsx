import { AppWindowIcon, Maximize2Icon, Minimize2Icon } from 'lucide-react';
import { useMemo, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { SheetEditorLayoutMemory } from '@/lib/sheet-editor-layout';
import type { ChatWindowHost } from '@/services/chat-window-host';
import type { Clipboard } from '@/services/clipboard';
import type { SheetChannel } from '@/sheet-sandbox/sheet-frame';
import type { TemplateDraft } from '@/stores/sheet-template-draft-store';
import { EditorSplitHandle } from './editor-split-handle';
import { SheetApiReference } from './sheet-api-reference';
import { EDITOR_TAB_CLASS, SheetCodeTabs } from './sheet-code-tabs';
import { EditorConsoleDock } from './sheet-editor-console';
import { PreviewInWindowNotice, SheetPreviewWindowPortal } from './sheet-preview-window';
import { SheetTemplatePreview } from './sheet-template-preview';
import { useSheetConsole } from './use-sheet-console';
import { useSheetEditorLayout } from './use-sheet-editor-layout';
import { useSheetPreviewWindow } from './use-sheet-preview-window';

/** The attribute that tells the library's dialog an Esc here belongs to the editor. */
export const OWNS_ESCAPE_ATTRIBUTE = 'data-owns-escape';

export type SheetTemplateWorkbenchProps = Readonly<{
  templateId: string;
  draft: TemplateDraft;
  onEdit: (changes: Partial<TemplateDraft>) => void;
  createChannel?: () => SheetChannel;
  layoutMemory?: SheetEditorLayoutMemory;
  /** Opens the preview's own window; without it, "Abrir prévia em janela" is not offered. */
  windows?: ChatWindowHost;
  now?: () => Date;
  /** "Copiar documentação" of the API tab; without it, not offered. */
  clipboard?: Clipboard;
}>;

/** The template editor's body: the code, the divider, and beside it the preview (docked, full
 *  screen over the code, or in its own window) or the API reference, with the console under them.
 *
 *  Example: `<SheetTemplateWorkbench templateId={id} draft={model.draft} onEdit={model.edit} />` */
export function SheetTemplateWorkbench(props: SheetTemplateWorkbenchProps): React.JSX.Element {
  const editorLayout = useSheetEditorLayout(props.layoutMemory);
  const [full, setFull] = useState(false);
  const exitOnEscape = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!full || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    setFull(false);
  };
  const share = { '--code-share': `${editorLayout.layout.codeShare}%` } as CSSProperties;
  return (
    <div
      {...{ [OWNS_ESCAPE_ATTRIBUTE]: full ? '' : undefined }}
      onKeyDown={exitOnEscape}
      style={share}
      className="flex min-h-0 flex-1 flex-col lg:flex-row"
    >
      {/* Hidden, never unmounted: the three editors keep their text and undo history. */}
      <div hidden={full} className="flex min-h-0 flex-col lg:w-(--code-share) lg:shrink-0">
        <SheetCodeTabs draft={props.draft} onEdit={props.onEdit} />
      </div>
      {!full && (
        <EditorSplitHandle
          share={editorLayout.layout.codeShare}
          onChange={editorLayout.setCodeShare}
          onDragEnd={editorLayout.remember}
          className="hidden lg:block"
        />
      )}
      <WorkbenchSide {...props} full={full} onFull={setFull} layout={editorLayout} />
    </div>
  );
}

type WorkbenchSideProps = SheetTemplateWorkbenchProps &
  Readonly<{
    full: boolean;
    onFull: (full: boolean) => void;
    layout: ReturnType<typeof useSheetEditorLayout>;
  }>;

function WorkbenchSide(props: WorkbenchSideProps): React.JSX.Element {
  const { html, css, js, name } = props.draft;
  const source = useMemo(() => ({ html, css, js }), [html, css, js]);
  const sheetConsole = useSheetConsole();
  const previewWindow = useSheetPreviewWindow(props.templateId, props.windows);
  const inWindow = previewWindow.status === 'detached';
  const openWindow = (): void => {
    props.onFull(false);
    previewWindow.open();
  };
  const preview = (actions: ReactNode) => (
    <SheetTemplatePreview
      {...{ source, actions, now: props.now, createChannel: props.createChannel }}
      onConsole={sheetConsole.append}
      onRun={sheetConsole.clear}
    />
  );
  const actions = <PreviewActions {...props} onOpenWindow={props.windows && openWindow} />;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col border-t border-border lg:border-t-0">
      <SideTabs
        clipboard={props.clipboard}
        preview={
          inWindow ? <PreviewInWindowNotice onReturn={previewWindow.bringBack} /> : preview(actions)
        }
      />
      <EditorConsoleDock
        {...{ log: sheetConsole.log, onClear: sheetConsole.clear }}
        open={props.layout.layout.consoleOpen}
        onToggle={props.layout.toggleConsole}
        height={props.layout.layout.consoleHeight}
        onResize={props.layout.setConsoleHeight}
        onResizeEnd={props.layout.remember}
      />
      <SheetPreviewWindowPortal previewWindow={previewWindow} title={`Prévia · ${name}`}>
        {inWindow && preview(null)}
      </SheetPreviewWindowPortal>
    </div>
  );
}

// The preview stays mounted while the API reference shows: the frame keeps its state.
function SideTabs({
  preview,
  clipboard,
}: Readonly<{ preview: ReactNode; clipboard?: Clipboard }>): React.JSX.Element {
  return (
    <Tabs defaultValue="preview" className="min-h-0 flex-1">
      <TabsList aria-label="Ao lado do código" className="gap-0 bg-panel px-2">
        <TabsTrigger value="preview" className={EDITOR_TAB_CLASS}>
          Prévia
        </TabsTrigger>
        <TabsTrigger value="api" className={EDITOR_TAB_CLASS}>
          API
        </TabsTrigger>
      </TabsList>
      <TabsContent
        value="preview"
        forceMount
        className="flex flex-col p-3 data-[state=inactive]:hidden"
      >
        {preview}
      </TabsContent>
      <TabsContent value="api" className="flex flex-col overflow-y-auto p-3">
        <SheetApiReference clipboard={clipboard} />
      </TabsContent>
    </Tabs>
  );
}

type PreviewActionsProps = Readonly<{
  full: boolean;
  onFull: (full: boolean) => void;
  onOpenWindow?: () => void;
}>;

function PreviewActions({ full, onFull, onOpenWindow }: PreviewActionsProps): React.JSX.Element {
  const FullIcon = full ? Minimize2Icon : Maximize2Icon;
  const fullLabel = full ? 'Sair da tela cheia' : 'Prévia em tela cheia';
  return (
    <>
      <Button
        aria-label={fullLabel}
        title={full ? `${fullLabel} (Esc)` : fullLabel}
        variant="ghost"
        size="icon-sm"
        onClick={() => onFull(!full)}
      >
        <FullIcon aria-hidden="true" />
      </Button>
      {onOpenWindow && (
        <Button
          aria-label="Abrir prévia em janela"
          title="Abrir prévia em janela"
          variant="ghost"
          size="icon-sm"
          onClick={onOpenWindow}
        >
          <AppWindowIcon aria-hidden="true" />
        </Button>
      )}
    </>
  );
}
