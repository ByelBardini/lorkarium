import { useEffect, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { ChatHistoryStore } from '@/stores/chat-history-store';
import { chatLineOf } from './chat-messages';
import type { ChatPeople } from './use-chat-people';

/** The chat's own voice for the screen reader: each message of someone else, as it arrives,
 *  in a polite `sr-only` status ("Bia: texto"; "Bia sussurrou para você: texto"). Rolls are
 *  not here: the dice notice already says them.
 *
 *  Example: `<ChatAnnouncer chat={table.chat} people={people} />` */
export function ChatAnnouncer({
  chat,
  people,
}: Readonly<{ chat: StoreApi<ChatHistoryStore>; people: ChatPeople }>): React.JSX.Element {
  const [said, setSaid] = useState('');
  const { viewerId, nameOf } = people;
  useEffect(
    () =>
      chat.getState().onNewMessage((message) => {
        if (message.event.fromUserId === viewerId) return;
        setSaid(chatLineOf(message, nameOf));
      }),
    [chat, viewerId, nameOf],
  );
  return (
    <p role="status" aria-live="polite" data-testid="chat-announcer" className="sr-only">
      {said}
    </p>
  );
}
