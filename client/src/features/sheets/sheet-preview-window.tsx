import { AppWindowIcon, PanelTopCloseIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ChatWindowPortal } from '@/features/chat/chat-window-portal';
import { DetachedWindowFrame } from '@/features/chat/detached-window-frame';
import type { ChatWindow } from '@/features/chat/use-chat-window';

export type SheetPreviewWindowPortalProps = Readonly<{
  previewWindow: ChatWindow;
  /** "Prévia · Ficha Tormenta". */
  title: string;
  children: ReactNode;
}>;

/** Draws the preview into its own window (same React tree: it follows the draft as it is typed),
 *  with "Voltar ao editor" in the window's bar; nothing until the window's page has loaded.
 *
 *  Example: `<SheetPreviewWindowPortal previewWindow={previewWindow} title="Prévia · Ficha">{preview}</SheetPreviewWindowPortal>` */
export function SheetPreviewWindowPortal(
  props: SheetPreviewWindowPortalProps,
): React.JSX.Element | null {
  const { previewWindow } = props;
  if (!previewWindow.portalTarget) return null;
  return (
    <ChatWindowPortal target={previewWindow.portalTarget}>
      <DetachedWindowFrame
        title={props.title}
        window={previewWindow}
        actions={<BackToEditorButton onReturn={previewWindow.bringBack} />}
      >
        <div className="flex min-h-0 flex-1 flex-col pb-3">{props.children}</div>
      </DetachedWindowFrame>
    </ChatWindowPortal>
  );
}

function BackToEditorButton({ onReturn }: Readonly<{ onReturn: () => void }>): React.JSX.Element {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
      onClick={onReturn}
    >
      <PanelTopCloseIcon aria-hidden="true" className="size-3.5" />
      Voltar ao editor
    </Button>
  );
}

/** What the editor shows where the preview was while the window has it.
 *
 *  Example: `<PreviewInWindowNotice onReturn={previewWindow.bringBack} />` */
export function PreviewInWindowNotice({
  onReturn,
}: Readonly<{ onReturn: () => void }>): React.JSX.Element {
  return (
    <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-border text-sm text-muted-foreground">
      <AppWindowIcon aria-hidden="true" className="size-6 opacity-50" />
      <p>Prévia aberta em outra janela.</p>
      <Button variant="outline" size="sm" onClick={onReturn}>
        Trazer a prévia de volta
      </Button>
    </div>
  );
}
