import type { LucideIcon } from 'lucide-react';
import { AppWindowIcon, PanelTopIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { findInlineHandlers } from '@/lib/sheet-inline-handlers';
import type { TemplateFile } from '@/lib/sheet-template-files';
import { inlineHandlerNotice, type FileInlineHandlers } from './sheet-template-messages';

/** Where else the editor can go; each button shows only when its move is offered here. */
export type TemplateEditorMoves = Readonly<{
  /** "Abrir modelo em aba": outside the room tab only. */
  openTab?: () => void;
  /** "Abrir modelo em janela": absent while the window has the editor. */
  openWindow?: () => void;
  /** "Fechar modelo": in the room tab only. */
  close?: () => void;
}>;

/** The tab, window and close buttons of the template editor's header.
 *
 *  Example: `<TemplateEditorMoveButtons moves={{ openTab, openWindow }} />` */
export function TemplateEditorMoveButtons({
  moves,
}: Readonly<{ moves: TemplateEditorMoves | undefined }>): React.JSX.Element {
  return (
    <>
      <MoveButton label="Abrir modelo em aba" icon={PanelTopIcon} onClick={moves?.openTab} />
      <MoveButton label="Abrir modelo em janela" icon={AppWindowIcon} onClick={moves?.openWindow} />
      <MoveButton label="Fechar modelo" icon={XIcon} onClick={moves?.close} />
    </>
  );
}

type MoveButtonProps = Readonly<{ label: string; icon: LucideIcon; onClick?: () => void }>;

function MoveButton({ label, icon: Icon, onClick }: MoveButtonProps): React.JSX.Element | null {
  if (!onClick) return null;
  return (
    <Button aria-label={label} title={label} variant="ghost" size="icon-sm" onClick={onClick}>
      <Icon aria-hidden="true" />
    </Button>
  );
}

/** The warning of saved HTML files with attributes the frame refuses (`onclick`,
 *  `javascript:`): how many, in which files and on which lines. It never blocks saving; `null`
 *  files (nothing saved here yet) or HTML with none draws nothing.
 *
 *  Example: `<InlineHandlerNotice savedFiles={model.phase === 'saved' ? model.base.files : null} />` */
export function InlineHandlerNotice({
  savedFiles,
}: Readonly<{ savedFiles: readonly TemplateFile[] | null }>): React.JSX.Element | null {
  const text = useMemo(() => inlineHandlerNotice(handlersOfFiles(savedFiles ?? [])), [savedFiles]);
  if (text === '') return null;
  return (
    <p
      role="note"
      aria-label="Atributos que não vão rodar"
      className="flex flex-wrap items-center gap-x-2 border-b border-border px-4 py-2 text-sm text-primary"
    >
      <TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
      <span>{text}</span>
      <span className="text-muted-foreground">Ligue o evento por addEventListener no JS.</span>
    </p>
  );
}

function handlersOfFiles(files: readonly TemplateFile[]): FileInlineHandlers[] {
  return files
    .filter(({ path }) => path.endsWith('.html'))
    .map(({ path, content }) => ({ path, handlers: findInlineHandlers(content) }));
}
