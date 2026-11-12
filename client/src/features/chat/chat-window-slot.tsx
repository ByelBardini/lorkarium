import { ExternalLinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Where the chat of the room lives (phase 11, the separate window, fills it in):
 *  - `docked`: here, with "Abrir em outra janela" (`open`) and, when the browser blocked the
 *    window, its `notice` (the chat stays here);
 *  - `detached`: in another window; the tab only offers to bring it back.
 *  Absent (`null`), the chat lives here with no window button. */
export type ChatWindowSlot =
  | Readonly<{ kind: 'docked'; open: () => void; notice: string | null }>
  | Readonly<{ kind: 'detached'; bringBack: () => void }>;

/** What the tab shows while the chat is in another window.
 *
 *  Example: `<DetachedChat bringBack={() => chatWindow.close()} />` */
export function DetachedChat({ bringBack }: Readonly<{ bringBack: () => void }>) {
  return (
    <section
      aria-label="Chat"
      className="flex flex-1 flex-col items-start gap-3 py-6 text-sm text-muted-foreground"
    >
      <p>Chat aberto em outra janela</p>
      <Button variant="outline" size="sm" onClick={bringBack}>
        Trazer de volta
      </Button>
    </section>
  );
}

/** "Abrir em outra janela" as an icon of the chat's header line (its refusal is the panel's
 *  `WindowNotice`).
 *
 *  Example: `<OpenWindowButton slot={{ kind: 'docked', open, notice: null }} />` */
export function OpenWindowButton({
  slot,
}: Readonly<{ slot: Extract<ChatWindowSlot, { kind: 'docked' }> }>): React.JSX.Element {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Abrir em outra janela"
      title="Abrir em outra janela"
      onClick={slot.open}
      className="text-muted-foreground"
    >
      <ExternalLinkIcon aria-hidden="true" />
    </Button>
  );
}

/** Why "Abrir em outra janela" did not open (the browser blocked it, the plan lacks it), under
 *  the chat's header line; nothing without a notice.
 *
 *  Example: `<WindowNotice slot={{ kind: 'docked', open, notice: 'Disponível no Narrador' }} />` */
export function WindowNotice({ slot }: Readonly<{ slot: ChatWindowSlot | null | undefined }>) {
  if (slot?.kind !== 'docked' || slot.notice === null) return null;
  return (
    <p role="status" className="pt-1.5 text-xs text-muted-foreground">
      {slot.notice}
    </p>
  );
}
