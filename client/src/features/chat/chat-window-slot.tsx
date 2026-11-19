import { ExternalLinkIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';

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

type OpenWindowButtonProps = Readonly<{
  slot: Extract<ChatWindowSlot, { kind: 'docked' }>;
  /** The tooltip; the accessible name stays "Abrir em outra janela". */
  title?: string;
  className?: string;
}>;

/** "Abrir em outra janela" as an icon of a panel's header line. When the click does not open it
 *  (the plan lacks it, the browser blocked it), the reason shows in a balloon beside the button.
 *
 *  Example: `<OpenWindowButton slot={{ kind: 'docked', open, notice: null }} />` */
export function OpenWindowButton(props: OpenWindowButtonProps): React.JSX.Element {
  const { slot } = props;
  const [clicked, setClicked] = useState(false);
  const click = (): void => {
    setClicked(true);
    slot.open();
  };
  return (
    <Popover open={clicked && slot.notice !== null} onOpenChange={setClicked}>
      <PopoverAnchor asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Abrir em outra janela"
          title={props.title ?? 'Abrir em outra janela'}
          onClick={click}
          className={props.className ?? 'text-muted-foreground'}
        >
          <ExternalLinkIcon aria-hidden="true" />
        </Button>
      </PopoverAnchor>
      <PopoverContent role="status" align="end" className="w-auto max-w-72 text-xs">
        {slot.notice}
      </PopoverContent>
    </Popover>
  );
}
