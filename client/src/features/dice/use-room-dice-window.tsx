import type { ChatWindowHost } from '@/services/chat-window-host';
import { ChatWindowPortal } from '@/features/chat/chat-window-portal';
import { DetachedWindowFrame } from '@/features/chat/detached-window-frame';
import type { ChatWindowSlot } from '@/features/chat/chat-window-slot';
import { useChatWindow } from '@/features/chat/use-chat-window';
import { DicePanel, type DicePanelProps } from './dice-panel';

/** Keeps the dice window alive across room tabs and focus mode. Example: `useRoomDiceWindow(props, host)` */
export function useRoomDiceWindow(
  props: DicePanelProps,
  host: ChatWindowHost,
): Readonly<{ slot: ChatWindowSlot; portal: React.ReactNode }> {
  const popup = useChatWindow(props.campaignId, host, 'dice');
  const slot: ChatWindowSlot =
    popup.status === 'detached'
      ? { kind: 'detached', bringBack: popup.bringBack }
      : {
          kind: 'docked',
          open: popup.open,
          notice: popup.status === 'blocked' ? 'O navegador bloqueou a janela de dados.' : null,
        };
  const portal = popup.portalTarget && (
    <ChatWindowPortal target={popup.portalTarget}>
      <DetachedWindowFrame title="Dados" window={popup}>
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          <DicePanel {...props} />
        </div>
      </DetachedWindowFrame>
    </ChatWindowPortal>
  );
  return { slot, portal };
}
