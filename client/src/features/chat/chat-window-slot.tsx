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

/** "Abrir em outra janela", and the browser's refusal of it under the button.
 *
 *  Example: `<OpenWindowButton slot={{ kind: 'docked', open, notice: null }} />` */
export function OpenWindowButton({
  slot,
}: Readonly<{ slot: Extract<ChatWindowSlot, { kind: 'docked' }> }>): React.JSX.Element {
  return (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
      {slot.notice !== null && (
        <p role="status" className="text-xs text-muted-foreground">
          {slot.notice}
        </p>
      )}
      <Button
        variant="ghost"
        size="sm"
        aria-label="Abrir em outra janela"
        onClick={slot.open}
        className="text-muted-foreground"
      >
        <ExternalLinkIcon aria-hidden="true" />
        Abrir em outra janela
      </Button>
    </div>
  );
}
