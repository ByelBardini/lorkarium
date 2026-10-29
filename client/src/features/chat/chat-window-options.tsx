import { useId } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import type { ChatWindow } from './use-chat-window';

/** Options of the actual detached window, confirmed by the native window.
 * Example: `<ChatWindowOptions chatWindow={chatWindow} />` */
export function ChatWindowOptions({
  chatWindow,
}: Readonly<{ chatWindow: ChatWindow }>): React.JSX.Element {
  const optionId = useId();
  const unavailableId = `${optionId}-unavailable`;
  return (
    <div className="mb-2 shrink-0 border-b border-border pb-2">
      <label htmlFor={optionId} className="flex items-center gap-2 text-xs text-label">
        <Checkbox
          id={optionId}
          checked={chatWindow.alwaysOnTop}
          disabled={!chatWindow.canAlwaysOnTop || chatWindow.changingAlwaysOnTop}
          aria-describedby={chatWindow.canAlwaysOnTop ? undefined : unavailableId}
          onCheckedChange={(checked) => void chatWindow.setAlwaysOnTop(checked === true)}
        />
        Sempre por cima
      </label>
      {!chatWindow.canAlwaysOnTop && (
        <p id={unavailableId} className="mt-1 text-[11px] text-muted-foreground">
          Disponível no aplicativo para Windows.
        </p>
      )}
      {chatWindow.alwaysOnTopProblem && (
        <p role="alert" className="mt-1 text-xs text-destructive-text">
          {chatWindow.alwaysOnTopProblem}
        </p>
      )}
    </div>
  );
}
