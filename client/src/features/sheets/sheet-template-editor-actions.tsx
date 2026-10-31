import type { LucideIcon } from 'lucide-react';
import { AppWindowIcon, PanelTopIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
