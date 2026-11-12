import type { StoreApi } from 'zustand/vanilla';
import type { ChatSoundFactory } from '@/chat-audio/chat-sound';
import { chatUnreadSummaryOf, type ChatUnreadSummary } from '@/lib/chat-conversations';
import { chatTitleOf } from '@/lib/chat-notices';
import type { InteractionClock } from '@/lib/interaction-clock';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/use-media-query';
import type { ChatWindowHost } from '@/services/chat-window-host';
import { useChatHistory, type ChatHistoryStore } from '@/stores/chat-history-store';
import type { ChatPreferencesStore } from '@/stores/chat-preferences-store';
import type { RoomLayoutStore } from '@/stores/room-layout-store';
import { useSession } from '@/stores/session-store';
import { ChatDock } from './chat-dock';
import type { ChatPanelProps } from './chat-panel';
import { useChatSound } from './use-chat-sound';
import { useOpenTableOf } from './use-chat-people';
import { useRoomChatWindow } from './use-room-chat-window';

/** What the room's chat takes from the app (the `PlayRoomPage` props carry them all). */
export type RoomChatServices = Readonly<{
  chatWindowHost: ChatWindowHost;
  /** The previews' lifetime and the gap between two chat sounds. */
  interactionClock: InteractionClock;
  /** "Som do chat" on this device. */
  chatPreferences: StoreApi<ChatPreferencesStore>;
  createChatSound: ChatSoundFactory;
}>;

export type RoomChatProps = Readonly<{
  /** The table's name: the browser tab's title. */
  tableName: string;
  /** What the drawer and the detached window show (the whole `ChatPanel`, with `services.chat`). */
  panel: Omit<ChatPanelProps, 'window' | 'initialConversation'>;
  /** The chat bar's state, the panel and focus mode (they place the bar). */
  roomLayout: StoreApi<RoomLayoutStore>;
  services: RoomChatServices;
}>;

const NOTHING_UNREAD: ChatUnreadSummary = { count: 0, important: false };

/** The chat of the play room, mounted by the room inside the board's box whatever is shown
 *  (focus mode included): the detached window's portal, the browser tab's title with the unread
 *  count, the sound of mentions and whispers and, beside the board (`md+`), the `ChatDock` at its
 *  foot. Below `md` nothing is drawn here yet.
 *
 *  Example: `<RoomChat tableName={campaign.name} panel={chatPanelProps} roomLayout={roomLayout} services={deps} />` */
export function RoomChat(props: RoomChatProps): React.JSX.Element {
  const { panel, roomLayout, services } = props;
  const chatWindow = useRoomChatWindow(panel, services.chatWindowHost);
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const chat = useOpenTableOf(panel.openTables, panel.campaignId)?.chat ?? null;
  useRoomChatSound(props, chat);
  return (
    <>
      {chatWindow.portal}
      {chat === null ? (
        <title>{chatTitleOf(props.tableName, NOTHING_UNREAD)}</title>
      ) : (
        <UnreadTitle chat={chat} tableName={props.tableName} />
      )}
      {desktop && (
        <ChatDock
          {...panel}
          window={chatWindow.slot}
          roomLayout={roomLayout}
          clock={services.interactionClock}
        />
      )}
    </>
  );
}

function useRoomChatSound(props: RoomChatProps, chat: StoreApi<ChatHistoryStore> | null): void {
  const { services } = props;
  const session = useSession(props.panel.sessionStore);
  useChatSound({
    chat,
    clock: services.interactionClock,
    viewerId: session.status === 'authenticated' ? session.user.id : null,
    chatPreferences: services.chatPreferences,
    createChatSound: services.createChatSound,
  });
}

type UnreadTitleProps = Readonly<{ chat: StoreApi<ChatHistoryStore>; tableName: string }>;

// React 19 hoists the `<title>` to the head: the tab reads "(1) Lorkarium · Vharn" from here.
function UnreadTitle({ chat, tableName }: UnreadTitleProps): React.JSX.Element {
  const conversations = useChatHistory(chat, (state) => state.conversations);
  return <title>{chatTitleOf(tableName, chatUnreadSummaryOf(conversations))}</title>;
}
