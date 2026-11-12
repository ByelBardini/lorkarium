import { useMemo } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { ChatMessage } from '@/lib/chat-conversations';
import type { SceneTabsStore } from '@/stores/scene-tabs-store';
import { ChatVoiceAvatar } from './chat-message-row';
import { TABLE_CONVERSATION_NAME } from './chat-messages';
import type { ChatPeople } from './use-chat-people';
import type { ChatNoticeItem } from './use-chat-notices';
import { chatFaceOf, chatVoicesOf, useChatTokenFaces, type ChatTokenFaces } from './use-chat-token';

const WHISPER_PLACE = 'Sussurro na Mesa';

const DIRECT_PLACE = 'Privado';

export type ChatImportantNoticesProps = Readonly<{
  /** `useChatNotices().importants`, oldest first. */
  importants: readonly ChatNoticeItem[];
  people: ChatPeople;
  /** The grids open here: the face of a token spoken as. */
  tabs: StoreApi<SceneTabsStore>;
  /** Opens the drawer on the notice's conversation (and takes the notice out). */
  onOpen: (item: ChatNoticeItem) => void;
}>;

/** The mentions and whispers to the viewer as gold cards above the chat bar (or the open
 *  drawer), oldest on top: the voice's face, who ("Kael (Caio)" when spoken as a token), the
 *  conversation and the text. They stay until the conversation is read; each one is a button
 *  that opens the drawer there. Silent (`aria-live="off"`): the chat's announcer already says
 *  each message once. Nothing is drawn without a notice.
 *
 *  Example: `<ChatImportantNotices importants={notices.importants} people={people} tabs={table.tabs} onOpen={openNotice} />` */
export function ChatImportantNotices(props: ChatImportantNoticesProps): React.JSX.Element | null {
  const messages = useMemo(() => props.importants.map((item) => item.message), [props.importants]);
  const voices = useMemo(() => chatVoicesOf(messages), [messages]);
  const faces = useChatTokenFaces(props.tabs, voices);
  if (props.importants.length === 0) return null;
  return (
    <ul
      aria-label="Avisos importantes"
      aria-live="off"
      className="pointer-events-none flex w-full max-w-190 flex-col items-start gap-1.5"
    >
      {props.importants.map((item) => (
        <li key={item.id} className="max-w-full">
          <NoticeCard item={item} people={props.people} faces={faces} onOpen={props.onOpen} />
        </li>
      ))}
    </ul>
  );
}

type NoticeCardProps = Readonly<{
  item: ChatNoticeItem;
  people: ChatPeople;
  faces: ChatTokenFaces;
  onOpen: (item: ChatNoticeItem) => void;
}>;

function NoticeCard({ item, people, faces, onOpen }: NoticeCardProps): React.JSX.Element {
  const { event } = item.message;
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="pointer-events-auto flex max-w-full items-start gap-2.5 rounded-sm border border-l-2 border-primary/60 border-l-primary bg-panel/95 px-3 py-2 text-left backdrop-blur transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
    >
      <ChatVoiceAvatar event={event} people={people} face={chatFaceOf(faces, item.message)} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[13px] text-muted-foreground">
          <span className="font-semibold text-primary">{voiceOf(item.message, people)}</span>
          {' · '}
          {placeOf(item.message)}
        </span>{' '}
        <span className="line-clamp-2 text-sm break-words text-foreground">{event.text}</span>
      </span>
    </button>
  );
}

function voiceOf({ event }: ChatMessage, people: ChatPeople): string {
  const author = people.nameOf(event.fromUserId);
  return event.speaker.kind === 'token' ? `${event.speaker.name} (${author})` : author;
}

function placeOf({ event }: ChatMessage): string {
  const { channel } = event;
  if (channel.kind === 'group') return channel.name;
  if (channel.kind === 'direct') return DIRECT_PLACE;
  return channel.whisperTo === null ? TABLE_CONVERSATION_NAME : WHISPER_PLACE;
}
