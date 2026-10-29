import { useEffect, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { ChatMessage } from '@/lib/chat-conversations';
import type { ChatHistoryStore } from '@/stores/chat-history-store';
import { chatAnnouncement, type AnnouncedPlace } from './chat-messages';
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
        setSaid(announcementOf(message, nameOf));
      }),
    [chat, viewerId, nameOf],
  );
  return (
    <p role="status" aria-live="polite" data-testid="chat-announcer" className="sr-only">
      {said}
    </p>
  );
}

function announcementOf(message: ChatMessage, nameOf: (userId: string) => string): string {
  const { event } = message;
  const author = event.speaker.kind === 'token' ? event.speaker.name : nameOf(event.fromUserId);
  return chatAnnouncement(author, placeOf(message), event.text);
}

function placeOf({ event }: ChatMessage): AnnouncedPlace {
  const { channel } = event;
  if (channel.kind === 'group') return { kind: 'group', name: channel.name };
  if (channel.kind === 'direct') return { kind: 'direct' };
  return channel.whisperTo === null ? { kind: 'table' } : { kind: 'whisper' };
}
