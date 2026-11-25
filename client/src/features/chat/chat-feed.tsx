import { useMemo } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { SceneTabsStore } from '@/stores/scene-tabs-store';
import type { ChatMessage } from '@/lib/chat-conversations';
import { messagesByIdOf } from '@/lib/chat-replies';
import { chatFeedOf, type ChatFeedFilter, type ChatFeedItem } from '@/lib/chat-feed';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { DiceHistoryEntry } from '@/stores/dice-history-store';
import { HistoryRow } from '@/features/dice/history-row';
import { useRevealClock } from '@/features/dice/use-reveal-clock';
import { ChatMessageRow } from './chat-message-row';
import { EMPTY_CONVERSATION } from './chat-messages';
import { NewMessagesNotice } from '@/components/new-messages-notice';
import { useFollowBottom, type FollowBottomLatest } from '@/components/use-follow-bottom';
import type { ChatPeople } from './use-chat-people';
import { chatFaceOf, chatVoicesOf, useChatTokenFaces, type ChatTokenFaces } from './use-chat-token';

export type ChatFeedProps = Readonly<{
  /** The conversation's name, for the log's label. */
  name: string;
  messages: readonly ChatMessage[];
  /** The Table's rolls (oldest first); `[]` elsewhere. */
  rolls: readonly DiceHistoryEntry[];
  filter: ChatFeedFilter;
  /** The first message that was unread when the conversation opened ("Novas" goes above it). */
  firstUnreadId: string | null;
  people: ChatPeople;
  viewerNames: readonly string[];
  /** The wall clock of the rolls' `revealAtMs`. */
  diceClock: InteractionClock;
  tabs: StoreApi<SceneTabsStore>;
  /** Starts answering a message (the composer shows "Respondendo a â€¦"). */
  onReply: (message: ChatMessage) => void;
}>;

/** The feed of one conversation: messages in blocks of one voice, the Table's rolls by the dice
 *  tab's own card, and "Novas" above what was unread. A log that announces nothing by itself
 *  (`aria-live="off"`): the chat's announcer speaks for the messages and the dice notice for the
 *  rolls. Follows the bottom while the reader is there; scrolled up, it stays put and offers
 *  "Novas mensagens" when something arrives (the viewer's own message still goes to the end).
 *
 *  Example: `<ChatFeed name="Mesa" messages={table.messages} rolls={dice} filter="all" firstUnreadId={null} people={people} viewerNames={names} diceClock={clock} />` */
export function ChatFeed(props: ChatFeedProps): React.JSX.Element {
  const unreadCount = unreadCountSince(props.messages, props.firstUnreadId);
  const items = chatFeedOf({ ...props, unreadCount });
  const { now } = useRevealClock(props.rolls, props.diceClock);
  const { scroller, content, hasUnseen, jumpToEnd } = useFollowBottom(
    latestOf(items, props.people.viewerId),
  );
  const voices = useMemo(() => chatVoicesOf(props.messages), [props.messages]);
  const faces = useChatTokenFaces(props.tabs, voices);
  const byId = useMemo(() => messagesByIdOf(props.messages), [props.messages]);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        role="log"
        aria-live="off"
        aria-label={`Mensagens: ${props.name}`}
        className="min-h-0 flex-1 overflow-y-auto py-2"
      >
        <div ref={content}>
          {items.length === 0 ? (
            <p className="px-2 py-6 text-sm text-muted-foreground">{EMPTY_CONVERSATION}</p>
          ) : (
            <ol data-message-list className="flex flex-col">
              {items.map((item) => (
                <FeedItem
                  key={keyOf(item)}
                  item={item}
                  now={now}
                  faces={faces}
                  byId={byId}
                  {...props}
                />
              ))}
            </ol>
          )}
        </div>
      </div>
      {hasUnseen && <NewMessagesNotice onJump={jumpToEnd} />}
    </div>
  );
}

function latestOf(
  items: readonly ChatFeedItem<DiceHistoryEntry>[],
  viewerId: string | null,
): FollowBottomLatest {
  const last = items.at(-1);
  if (!last) return { key: null, mine: false };
  return { key: keyOf(last), mine: viewerId !== null && authorIdOf(last) === viewerId };
}

function authorIdOf(item: ChatFeedItem<DiceHistoryEntry>): string | null {
  if (item.kind === 'unread-divider') return null;
  if (item.kind === 'roll') return item.entry.event.rollerId;
  return item.message.event.fromUserId;
}

type FeedItemProps = ChatFeedProps &
  Readonly<{
    item: ChatFeedItem<DiceHistoryEntry>;
    now: number;
    faces: ChatTokenFaces;
    byId: ReadonlyMap<string, ChatMessage>;
  }>;

function FeedItem(props: FeedItemProps): React.JSX.Element {
  const { item, now, people } = props;
  if (item.kind === 'unread-divider') return <UnreadDivider />;
  if (item.kind === 'roll') {
    const roller = people.identityOf(item.entry.event.rollerId);
    return <HistoryRow entry={item.entry} now={now} roller={roller} onReroll={null} />;
  }
  return (
    <ChatMessageRow
      message={item.message}
      continued={item.continued}
      people={people}
      viewerNames={props.viewerNames}
      face={chatFaceOf(props.faces, item.message)}
      quoted={quotedIn(props.byId, item.message)}
      onReply={props.onReply}
    />
  );
}

function quotedIn(
  byId: ReadonlyMap<string, ChatMessage>,
  message: ChatMessage,
): ChatMessage | null {
  const quotedId = message.event.replyTo?.messageId;
  return quotedId === undefined ? null : (byId.get(quotedId) ?? null);
}

function UnreadDivider(): React.JSX.Element {
  return (
    <li className="flex items-center gap-2.5 px-2 pt-3 text-[11px] font-semibold tracking-[0.12em] text-destructive-text uppercase">
      <span aria-hidden="true" className="h-px flex-1 bg-destructive/60" />
      Novas
      <span aria-hidden="true" className="h-px flex-1 bg-destructive/60" />
    </li>
  );
}

function keyOf(item: ChatFeedItem<DiceHistoryEntry>): string {
  if (item.kind === 'unread-divider') return 'unread';
  if (item.kind === 'roll') return `roll:${item.entry.event.rollId}`;
  return item.message.event.messageId;
}

// Counting from the message, not keeping a number: what arrives while open never moves "Novas".
function unreadCountSince(messages: readonly ChatMessage[], firstUnreadId: string | null): number {
  if (firstUnreadId === null) return 0;
  const index = messages.findIndex((each) => each.event.messageId === firstUnreadId);
  return index < 0 ? 0 : messages.length - index;
}
