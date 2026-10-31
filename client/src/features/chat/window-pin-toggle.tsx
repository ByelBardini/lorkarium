import { PinIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ChatWindow } from './use-chat-window';

const UNAVAILABLE = 'Sempre por cima: disponível no aplicativo para Windows.';

/** "Sempre por cima" as a pressed/unpressed pin for a detached window's title bar.
 *
 *  Example: `<WindowPinToggle chatWindow={popup} />` */
export function WindowPinToggle({
  chatWindow,
}: Readonly<{ chatWindow: ChatWindow }>): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Sempre por cima"
      aria-pressed={chatWindow.alwaysOnTop}
      title={chatWindow.canAlwaysOnTop ? 'Sempre por cima' : UNAVAILABLE}
      disabled={!chatWindow.canAlwaysOnTop || chatWindow.changingAlwaysOnTop}
      className="text-muted-foreground aria-pressed:bg-primary/10 aria-pressed:text-primary"
      onClick={() => void chatWindow.setAlwaysOnTop(!chatWindow.alwaysOnTop)}
    >
      <PinIcon aria-hidden="true" className="size-3.5" />
    </Button>
  );
}
