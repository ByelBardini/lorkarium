import type { CampaignRoleDto } from '@lorkarium/contracts';
import { useEffect, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { SegmentField } from '@/components/segment-field';
import {
  stripOrderOf,
  TABLE_CONVERSATION_KEY,
  type ChatConversation,
  type ChatConversationKey,
  type ChatConversationTarget,
} from '@/lib/chat-conversations';
import type { ChatFeedFilter } from '@/lib/chat-feed';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { ChatCommands } from '@/services/chat-commands';
import type { DiceCommands } from '@/services/dice-commands';
import type { SavedRollsApi } from '@/services/saved-rolls-api';
import type { BoardStore } from '@/stores/board-store';
import { useChatHistory, type ChatHistoryStore } from '@/stores/chat-history-store';
import { useDiceHistory } from '@/stores/dice-history-store';
import type { OpenTable, OpenTablesStore } from '@/stores/open-tables-store';
import type { SessionStore } from '@/stores/session-store';
import { useTablePresence, type TablePresenceStore } from '@/stores/table-presence-store';
import { ChatAnnouncer } from './chat-announcer';
import { ComposerSlot } from './composer-slot';
import { ChatFeed } from './chat-feed';
import { TABLE_CONVERSATION_NAME } from './chat-messages';
import { ConversationStrip } from './conversation-strip';
import { DetachedChat, OpenWindowButton, type ChatWindowSlot } from './chat-window-slot';
import { NewConversationDialog } from './new-conversation-dialog';
import { useChatPeople, useOpenTableOf, type ChatPeople } from './use-chat-people';

/** The app's services the chat needs (the `AppDependencies` of the same names). */
export type ChatServices = Readonly<{
  chat: ChatCommands;
  dice: DiceCommands;
  savedRolls: SavedRollsApi;
  /** The wall clock of the dice history's `revealAtMs`. */
  diceClock: InteractionClock;
}>;

export type ChatPanelProps = Readonly<{
  campaignId: string;
  role: CampaignRoleDto;
  sessionStore: StoreApi<SessionStore>;
  openTables: StoreApi<OpenTablesStore>;
  presence: StoreApi<TablePresenceStore> | null;
  /** The grid shown: "Falar como" lists its tokens. */
  board: StoreApi<BoardStore> | null;
  services: ChatServices;
  /** Phase 11: whether the chat lives here or in another window (absent: here, no button). */
  window?: ChatWindowSlot | null;
}>;

/** The "Chat" tab of the room: the strip of conversations, the feed of the one chosen and the
 *  composer. While it is on screen its conversation is the store's active one (read at once);
 *  gone, every conversation counts unread again. With the chat in another window (`window`
 *  detached) the tab only offers to bring it back.
 *
 *  Example: `<ChatPanel campaignId={campaign.id} role={campaign.myRole} sessionStore={deps.sessionStore} openTables={openTables} presence={presence} board={board} services={deps} />` */
export function ChatPanel(props: ChatPanelProps): React.JSX.Element | null {
  const table = useOpenTableOf(props.openTables, props.campaignId);
  if (table === null) return null;
  if (props.window?.kind === 'detached') return <DetachedChat bringBack={props.window.bringBack} />;
  return <OpenChat {...props} table={table} />;
}

type OpenChatProps = ChatPanelProps & Readonly<{ table: OpenTable }>;

function OpenChat(props: OpenChatProps): React.JSX.Element {
  const { table, services } = props;
  const people = useChatPeople(props.presence, props.sessionStore);
  const allConversations = useChatHistory(table.chat, (state) => state.conversations);
  const conversations = allConversations.filter((conversation) => !conversation.closed);
  const shown = useShownConversation(table.chat, conversations);
  const [filter, setFilter] = useState<ChatFeedFilter>('all');
  const live = useTablePresence(table.presence, (state) => state.status === 'live');
  const atTable = shown.conversation.target.kind === 'table';
  const nameOf = (target: ChatConversationTarget) => conversationNameOf(target, people);
  const [starting, setStarting] = useState(false);
  const start = (target: ChatConversationTarget) => {
    shown.select(table.chat.getState().startConversation(target));
    setStarting(false);
  };
  return (
    <section aria-label="Chat" className="flex min-h-0 flex-1 flex-col">
      <ConversationStrip
        conversations={stripOrderOf(conversations)}
        selectedKey={shown.conversation.key}
        onSelect={shown.select}
        onClose={shown.close}
        nameOf={nameOf}
        onNewConversation={() => setStarting(true)}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 empty:hidden">
        {atTable && <FeedFilter filter={filter} onFilter={setFilter} />}
        {props.window?.kind === 'docked' && <OpenWindowButton slot={props.window} />}
      </div>
      <ConversationFeed
        {...props}
        shown={shown}
        filter={filter}
        people={people}
        name={nameOf(shown.conversation.target)}
      />
      <ComposerSlot
        campaignId={props.campaignId}
        role={props.role}
        services={services}
        board={props.board}
        conversation={shown.conversation}
        people={people}
        live={live}
      />
      <ChatAnnouncer chat={table.chat} people={people} />
      {starting && (
        <NewConversationDialog people={people} onStart={start} onClose={() => setStarting(false)} />
      )}
    </section>
  );
}

type ShownConversation = Readonly<{
  conversation: ChatConversation;
  /** The first message unread when it opened ("Novas"). */
  firstUnreadId: string | null;
  select: (key: ChatConversationKey) => void;
  close: (key: ChatConversationKey) => void;
}>;

// The conversation on screen is the store's active one while the panel lives (read at once);
// what was unread is taken before that, for "Novas".
function useShownConversation(
  chat: StoreApi<ChatHistoryStore>,
  conversations: readonly ChatConversation[],
): ShownConversation {
  const [key, setKey] = useState<ChatConversationKey>(TABLE_CONVERSATION_KEY);
  const find = (wanted: ChatConversationKey) => conversations.find((each) => each.key === wanted);
  const [firstUnreadId, setFirstUnreadId] = useState(() => firstUnreadIdOf(find(key)));
  const conversation = find(key) ?? find(TABLE_CONVERSATION_KEY) ?? conversations[0];
  if (!conversation) throw new Error(`chat of ${chat.getState().campaignId} has no Table`);
  useEffect(() => {
    chat.getState().setActive(conversation.key);
    return () => chat.getState().setActive(null);
  }, [chat, conversation.key]);
  const select = (wanted: ChatConversationKey) => {
    setFirstUnreadId(firstUnreadIdOf(find(wanted)));
    setKey(wanted);
  };
  const close = (closed: ChatConversationKey) => {
    if (closed === 'table') return;
    if (closed === conversation.key) select(TABLE_CONVERSATION_KEY);
    chat.getState().closeConversation(closed);
  };
  return { conversation, firstUnreadId, select, close };
}

function firstUnreadIdOf(conversation: ChatConversation | undefined): string | null {
  if (!conversation || conversation.unread === 0) return null;
  const index = conversation.messages.length - conversation.unread;
  return conversation.messages[Math.max(0, index)]?.event.messageId ?? null;
}

type ConversationFeedProps = OpenChatProps &
  Readonly<{ shown: ShownConversation; filter: ChatFeedFilter; people: ChatPeople; name: string }>;

function ConversationFeed(props: ConversationFeedProps): React.JSX.Element {
  const { conversation, firstUnreadId } = props.shown;
  const rolls = useDiceHistory(props.table.dice, (state) => state.entries);
  const me = props.people.viewerId === null ? null : props.people.memberOf(props.people.viewerId);
  return (
    <ChatFeed
      name={props.name}
      messages={conversation.messages}
      rolls={conversation.target.kind === 'table' ? rolls : NO_ROLLS}
      filter={props.filter}
      firstUnreadId={firstUnreadId}
      people={props.people}
      viewerNames={me ? [me.name, me.username] : NO_NAMES}
      diceClock={props.services.diceClock}
      tabs={props.table.tabs}
    />
  );
}

const NO_ROLLS: readonly never[] = [];
const NO_NAMES: readonly string[] = [];

const FILTERS = [
  { value: 'all', label: 'Tudo' },
  { value: 'talk', label: 'Só conversa' },
] as const;

function FeedFilter(
  props: Readonly<{ filter: ChatFeedFilter; onFilter: (filter: ChatFeedFilter) => void }>,
) {
  return (
    <SegmentField
      legend="Mostrar no chat"
      compact
      value={props.filter}
      options={FILTERS}
      onChange={props.onFilter}
      className="mr-auto"
    />
  );
}

function conversationNameOf(target: ChatConversationTarget, people: ChatPeople): string {
  if (target.kind === 'direct') return people.nameOf(target.userId);
  if (target.kind === 'group') return target.name;
  return TABLE_CONVERSATION_NAME;
}
