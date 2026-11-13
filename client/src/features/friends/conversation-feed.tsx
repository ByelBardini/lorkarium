import type { DmSentDto, FriendDto } from '@lorkarium/contracts';
import { useEffect, useRef } from 'react';
import { directFeedOf, type DirectFeedRun } from '@/lib/direct-feed';
import { cn } from '@/lib/utils';

const TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

export type ConversationFeedProps = Readonly<{
  messages: readonly DmSentDto[];
  accountId: string;
  friend: FriendDto;
  now: () => Date;
}>;

/** The messages of a conversation: a separator per day, blocks of one author with the time at
 *  the end of each, mine on the right. Scrolls to the newest as they arrive.
 *
 *  Example: `<ConversationFeed messages={conversation.messages} accountId={me.id} friend={bia} now={() => new Date()} />` */
export function ConversationFeed(props: ConversationFeedProps): React.JSX.Element {
  const { messages, accountId, friend } = props;
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages]);
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
        {`Nenhuma mensagem com ${friend.name} ainda. As conversas ficam só neste aparelho.`}
      </div>
    );
  }
  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      {directFeedOf(messages, accountId, props.now()).map((day) => (
        <section key={day.key} aria-label={day.label} className="flex flex-col gap-3">
          <p role="separator" className="py-2 text-center text-xs text-muted-foreground">
            {day.label}
          </p>
          {day.runs.map((run) => (
            <MessageRun
              key={run.messages[0]?.messageId}
              run={run}
              authorName={run.mine ? 'Você' : friend.name}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function MessageRun({
  run,
  authorName,
}: Readonly<{ run: DirectFeedRun; authorName: string }>): React.JSX.Element {
  const last = run.messages.at(-1);
  return (
    <div className={cn('flex flex-col gap-1', run.mine ? 'items-end' : 'items-start')}>
      <span className="sr-only">{authorName}</span>
      {run.messages.map((message) => (
        <p
          key={message.messageId}
          className={cn(
            'max-w-[80%] rounded-lg px-3 py-2 text-sm break-words whitespace-pre-wrap text-foreground',
            run.mine ? 'bg-primary/15' : 'bg-muted',
          )}
        >
          {message.text}
        </p>
      ))}
      {last && (
        <time dateTime={last.at} className="text-[11px] text-muted-foreground">
          {TIME_FORMAT.format(new Date(last.at))}
        </time>
      )}
    </div>
  );
}
