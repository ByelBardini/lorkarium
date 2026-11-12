import { ChevronUpIcon, MessageSquareIcon } from 'lucide-react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import type { ChatConversation, ChatMessage } from '@/lib/chat-conversations';
import { useChatHistory, type ChatHistoryStore } from '@/stores/chat-history-store';
import type { OpenTable } from '@/stores/open-tables-store';
import type { ChatDockPanelProps } from './chat-dock';
import { chatLineOf, EMPTY_CONVERSATION } from './chat-messages';
import { useChatUnreadMark } from './chat-unread-mark';
import type { ChatPeople } from './use-chat-people';

export type ChatDockBarProps = Readonly<{
  panel: ChatDockPanelProps;
  table: OpenTable;
  people: ChatPeople;
  onOpen: () => void;
  /** The ref of "Abrir chat" (the dock gives it the focus back when the drawer closes). */
  openButtonRef?: (button: HTMLButtonElement | null) => void;
}>;

const BAR_CLASS =
  'pointer-events-auto flex h-10.5 w-full max-w-170 items-center gap-2 rounded-sm border border-border bg-panel/95 pr-1 pl-3 text-sm backdrop-blur';

/** The chat collapsed at the foot of the board (42 px): the latest message of any open
 *  conversation ("Caio: Vou abrir a porta"), the unread counter on "Abrir chat" (gold for a
 *  mention or a whisper to the viewer) — or, with the chat in another window, "Trazer de volta".
 *
 *  Example: `<ChatDockBar panel={panelProps} table={table} people={people} onOpen={openChat} />` */
export function ChatDockBar(props: ChatDockBarProps): React.JSX.Element {
  const slot = props.panel.window;
  return (
    <section aria-label="Chat da mesa" className={BAR_CLASS}>
      <MessageSquareIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      {slot?.kind === 'detached' ? (
        <DetachedBar bringBack={slot.bringBack} />
      ) : (
        <DockedBar {...props} />
      )}
    </section>
  );
}

function DockedBar({ panel, table, people, onOpen, openButtonRef }: ChatDockBarProps) {
  const unread = useChatUnreadMark(panel.openTables, panel.campaignId);
  const latest = useLatestMessage(table.chat);
  return (
    <>
      <p className="min-w-0 flex-1 truncate text-muted-foreground">
        {latest === null ? EMPTY_CONVERSATION : chatLineOf(latest, people.nameOf)}
      </p>
      <Button
        ref={openButtonRef}
        variant="ghost"
        size="sm"
        aria-describedby={unread.describedBy}
        onClick={onOpen}
      >
        Abrir chat
        {unread.mark}
        <ChevronUpIcon aria-hidden="true" />
      </Button>
    </>
  );
}

function DetachedBar({ bringBack }: Readonly<{ bringBack: () => void }>): React.JSX.Element {
  return (
    <>
      <p className="min-w-0 flex-1 truncate text-muted-foreground">Chat aberto em outra janela</p>
      <Button variant="ghost" size="sm" onClick={bringBack}>
        Trazer de volta
      </Button>
    </>
  );
}

function useLatestMessage(chat: StoreApi<ChatHistoryStore>): ChatMessage | null {
  return useChatHistory(chat, (state) => latestMessageOf(state.conversations));
}

// The conversation strip leaves a closed one out: so does the bar.
function latestMessageOf(conversations: readonly ChatConversation[]): ChatMessage | null {
  let latest: ChatMessage | null = null;
  for (const conversation of conversations) {
    const last = conversation.closed ? undefined : conversation.messages.at(-1);
    if (last && (latest === null || last.receivedAtMs >= latest.receivedAtMs)) latest = last;
  }
  return latest;
}
