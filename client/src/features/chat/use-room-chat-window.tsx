import type { ChatWindowHost } from '@/services/chat-window-host';
import { ChatPanel, type ChatPanelProps } from './chat-panel';
import { ChatWindowPortal } from './chat-window-portal';
import type { ChatWindowSlot } from './chat-window-slot';
import { useChatWindow } from './use-chat-window';
import { ChatWindowOptions } from './chat-window-options';

/** Owns the popup for the whole room, including when another panel tab or focus mode is shown.
 *
 * Example: `const detached = useRoomChatWindow(chatProps, deps.chatWindowHost)` */
export function useRoomChatWindow(
  props: ChatPanelProps,
  host: ChatWindowHost,
): Readonly<{ slot: ChatWindowSlot; portal: React.ReactNode }> {
  const chatWindow = useChatWindow(props.campaignId, host);
  const slot: ChatWindowSlot =
    chatWindow.status === 'detached'
      ? { kind: 'detached', bringBack: chatWindow.bringBack }
      : {
          kind: 'docked',
          open: chatWindow.open,
          notice: chatWindow.status === 'blocked' ? 'O navegador bloqueou a janela do chat.' : null,
        };
  const portal = chatWindow.portalTarget && (
    <ChatWindowPortal target={chatWindow.portalTarget}>
      <div className="flex h-dvh min-h-0 flex-col bg-panel px-4 pt-3">
        <ChatWindowOptions chatWindow={chatWindow} />
        <ChatPanel {...props} />
      </div>
    </ChatWindowPortal>
  );
  return { slot, portal };
}
