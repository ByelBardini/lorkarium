import type { ChatSentDto } from '@lorkarium/contracts';
import { LockIcon } from 'lucide-react';
import type { StoreApi } from 'zustand/vanilla';
import type { SceneTabsStore } from '@/stores/scene-tabs-store';
import { TokenFace } from '@/features/tokens/token-face';
import { UserAvatar } from '@/components/user-avatar';
import { mentionsAny, type ChatMessage } from '@/lib/chat-conversations';
import { initialsOf } from '@/lib/token-initials';
import { cn } from '@/lib/utils';
import { MENTION_MARK, whisperMark } from './chat-messages';
import type { ChatPeople } from './use-chat-people';
import { useChatToken } from './use-chat-token';

export type ChatMessageRowProps = Readonly<{
  message: ChatMessage;
  /** Same voice as the row above: no avatar, no header. */
  continued: boolean;
  people: ChatPeople;
  /** The names an `@` calls the viewer by. */
  viewerNames: readonly string[];
  tabs: StoreApi<SceneTabsStore>;
}>;

const TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** One message of the feed: the author (or the character spoken as, in the display serif and
 *  italic, with who played it below), the whisper mark in text, the time and the text. A mention
 *  of the viewer gets the gold rule and says so to the screen reader; a whisper the steel one.
 *
 *  Example: `<ChatMessageRow message={message} continued={false} people={people} viewerNames={['Ana', 'ana']} />` */
export function ChatMessageRow(props: ChatMessageRowProps): React.JSX.Element {
  const { event } = props.message;
  const mine = event.fromUserId === props.people.viewerId;
  const mentioned = !mine && mentionsAny(event.text, props.viewerNames);
  const whispered = whisperToOf(event) !== null;
  const spoken = event.speaker.kind === 'token';
  return (
    <li
      className={cn(
        'flex gap-2.5 border-l-2 border-transparent px-2',
        props.continued ? 'pt-0.5' : 'pt-3',
        whispered && 'border-chart-2 bg-chart-2/5',
        mentioned && 'border-primary bg-primary/5',
      )}
    >
      <span className="flex w-7 shrink-0 justify-center">
        {!props.continued && <RowAvatar event={event} people={props.people} tabs={props.tabs} />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {!props.continued && <RowHeader event={event} people={props.people} mine={mine} />}
        <p
          className={cn(
            'text-sm break-words whitespace-pre-wrap text-foreground',
            spoken && 'font-display text-[17px] leading-snug italic',
          )}
        >
          {event.text}
        </p>
        {mentioned && <span className="sr-only">{MENTION_MARK}</span>}
      </div>
    </li>
  );
}

type RowPartProps = Readonly<{ event: ChatSentDto; people: ChatPeople }>;

function RowAvatar({
  event,
  people,
  tabs,
}: RowPartProps & Pick<ChatMessageRowProps, 'tabs'>): React.JSX.Element {
  if (event.speaker.kind === 'token') {
    return <TokenMessageAvatar speaker={event.speaker} tabs={tabs} />;
  }
  const author = people.identityOf(event.fromUserId);
  return (
    <UserAvatar name={author.name} color={author.color} avatarId={author.avatarId} size="sm" />
  );
}

function TokenMessageAvatar({
  speaker,
  tabs,
}: Readonly<{
  speaker: Extract<ChatSentDto['speaker'], { kind: 'token' }>;
  tabs: StoreApi<SceneTabsStore>;
}>): React.JSX.Element {
  const token = useChatToken(tabs, speaker.sceneId, speaker.tokenId);
  return (
    <TokenFace
      initials={token?.initials ?? initialsOf(speaker.name)}
      imageAssetId={token?.imageAssetId ?? null}
      round={token?.frame === 'round'}
      className="size-7 bg-muted font-display text-[11px] text-foreground"
    />
  );
}

function RowHeader({ event, people, mine }: RowPartProps & Readonly<{ mine: boolean }>) {
  const whisperTo = whisperToOf(event);
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <SpeakerName event={event} people={people} mine={mine} />
      {whisperTo !== null && (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-chart-2">
          <LockIcon aria-hidden="true" className="size-2.5" />
          {whisperMark(mine ? people.nameOf(whisperTo) : null)}
        </span>
      )}
      <time dateTime={event.at} className="text-[11px] text-muted-foreground tabular-nums">
        {TIME_FORMAT.format(new Date(event.at))}
      </time>
    </div>
  );
}

function SpeakerName({ event, people, mine }: RowPartProps & Readonly<{ mine: boolean }>) {
  const author = people.nameOf(event.fromUserId);
  if (event.speaker.kind === 'self') {
    return (
      <span className={cn('text-[13px] font-semibold', mine ? 'text-primary' : 'text-foreground')}>
        {author}
      </span>
    );
  }
  const npc = people.memberOf(event.fromUserId)?.role === 'master';
  return (
    <>
      <span className="font-display text-[17px] font-semibold text-primary italic">
        {event.speaker.name}
      </span>
      <span className="text-[11px] text-muted-foreground">{npc ? `NPC · ${author}` : author}</span>
    </>
  );
}

function whisperToOf(event: ChatSentDto): string | null {
  return event.channel.kind === 'table' ? event.channel.whisperTo : null;
}
