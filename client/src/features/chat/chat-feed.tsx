import { useEffect, useRef } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { SceneTabsStore } from '@/stores/scene-tabs-store';
import type { ChatMessage } from '@/lib/chat-conversations';
import { chatFeedOf, type ChatFeedFilter, type ChatFeedItem } from '@/lib/chat-feed';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { DiceHistoryEntry } from '@/stores/dice-history-store';
import { HistoryRow } from '@/features/dice/history-row';
import { useRevealClock } from '@/features/dice/use-reveal-clock';
import { ChatMessageRow } from './chat-message-row';
import { EMPTY_CONVERSATION } from './chat-messages';
import type { ChatPeople } from './use-chat-people';

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
}>;

/** The feed of one conversation: messages in blocks of one voice, the Table's rolls by the dice
 *  tab's own card, and "Novas" above what was unread. A log that announces nothing by itself
 *  (`aria-live="off"`): the chat's announcer speaks for the messages and the dice notice for the
 *  rolls. Follows the bottom as it grows.
 *
 *  Example: `<ChatFeed name="Mesa" messages={table.messages} rolls={dice} filter="all" firstUnreadId={null} people={people} viewerNames={names} diceClock={clock} />` */
export function ChatFeed(props: ChatFeedProps): React.JSX.Element {
  const unreadCount = unreadCountSince(props.messages, props.firstUnreadId);
  const items = chatFeedOf({ ...props, unreadCount });
  const { now } = useRevealClock(props.rolls, props.diceClock);
  const scroller = useFollowBottom(items.length);
  return (
    <div
      ref={scroller}
      role="log"
      aria-live="off"
      aria-label={`Mensagens: ${props.name}`}
      className="min-h-0 flex-1 overflow-y-auto py-2"
    >
      {items.length === 0 ? (
        <p className="px-2 py-6 text-sm text-muted-foreground">{EMPTY_CONVERSATION}</p>
      ) : (
        <ol className="flex flex-col">
          {items.map((item) => (
            <FeedItem key={keyOf(item)} item={item} now={now} {...props} />
          ))}
        </ol>
      )}
    </div>
  );
}

type FeedItemProps = ChatFeedProps &
  Readonly<{ item: ChatFeedItem<DiceHistoryEntry>; now: number }>;

function FeedItem({ item, now, people, viewerNames, tabs }: FeedItemProps): React.JSX.Element {
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
      viewerNames={viewerNames}
      tabs={tabs}
    />
  );
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

function useFollowBottom(count: number): React.RefObject<HTMLDivElement | null> {
  const scroller = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [count]);
  return scroller;
}
