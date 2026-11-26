import type { DmSentDto, FriendDto } from '@lorkarium/contracts';
import { useMemo } from 'react';
import { EmoteText } from '@/components/emote-text';
import { ReplyButton, ReplyQuote, type QuotedMessage } from '@/components/message-reply';
import { NewMessagesNotice } from '@/components/new-messages-notice';
import { useFollowBottom } from '@/components/use-follow-bottom';
import { formatClockTime } from '@/lib/clock-time';
import { directFeedOf, type DirectFeedRun } from '@/lib/direct-feed';
import { cn } from '@/lib/utils';

export type ConversationFeedProps = Readonly<{
  messages: readonly DmSentDto[];
  accountId: string;
  friend: FriendDto;
  now: () => Date;
  /** Starts answering a message (the composer shows "Respondendo a â€¦"). */
  onReply: (message: DmSentDto) => void;
}>;

type Authors = Readonly<{ accountId: string; friendName: string }>;

/** The messages of a conversation: a separator per day, blocks of one author with the time at
 *  the end of each, mine on the right. A reply quotes its original above the bubble (clicking
 *  scrolls to it); hovering a bubble offers "Responder". Follows the newest while the reader is at
 *  the end; scrolled up, it stays put and offers "Novas mensagens" (my own still goes to the end).
 *
 *  Example: `<ConversationFeed messages={conversation.messages} accountId={me.id} friend={bia} now={() => new Date()} onReply={reply.start} />` */
export function ConversationFeed(props: ConversationFeedProps): React.JSX.Element {
  const { messages, accountId, friend } = props;
  const byId = useMemo(() => new Map(messages.map((each) => [each.messageId, each])), [messages]);
  const authors: Authors = { accountId, friendName: friend.name };
  const last = messages.at(-1);
  const { scroller, content, hasUnseen, jumpToEnd } = useFollowBottom({
    key: last?.messageId ?? null,
    mine: last?.fromUserId === accountId,
  });
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        data-message-list
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4"
      >
        <div ref={content} className="flex flex-1 flex-col">
          {messages.length === 0 ? (
            <EmptyConversation friendName={friend.name} />
          ) : (
            directFeedOf(messages, accountId, props.now()).map((day) => (
              <section key={day.key} aria-label={day.label} className="flex flex-col gap-3">
                <p role="separator" className="py-2 text-center text-xs text-muted-foreground">
                  {day.label}
                </p>
                {day.runs.map((run) => (
                  <MessageRun
                    key={run.messages[0]?.messageId}
                    run={run}
                    authors={authors}
                    byId={byId}
                    onReply={props.onReply}
                  />
                ))}
              </section>
            ))
          )}
        </div>
      </div>
      {hasUnseen && <NewMessagesNotice onJump={jumpToEnd} />}
    </div>
  );
}

function EmptyConversation({ friendName }: Readonly<{ friendName: string }>): React.JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
      {`Nenhuma mensagem com ${friendName} ainda. As conversas ficam sÃ³ neste aparelho.`}
    </div>
  );
}

type RunProps = Readonly<{
  run: DirectFeedRun;
  authors: Authors;
  byId: ReadonlyMap<string, DmSentDto>;
  onReply: (message: DmSentDto) => void;
}>;

function MessageRun({ run, authors, byId, onReply }: RunProps): React.JSX.Element {
  const last = run.messages.at(-1);
  return (
    <div className={cn('flex flex-col gap-1', run.mine ? 'items-end' : 'items-start')}>
      <span className="sr-only">{run.mine ? 'VocÃª' : authors.friendName}</span>
      {run.messages.map((message) => (
        <MessageBubble
          key={message.messageId}
          message={message}
          mine={run.mine}
          authors={authors}
          quoted={quotedOf(message, byId, authors)}
          onReply={onReply}
        />
      ))}
      {last && (
        <time dateTime={last.at} className="text-[11px] text-muted-foreground">
          {formatClockTime(last.at)}
        </time>
      )}
    </div>
  );
}

type BubbleProps = Readonly<{
  message: DmSentDto;
  mine: boolean;
  authors: Authors;
  quoted: QuotedMessage | null;
  onReply: (message: DmSentDto) => void;
}>;

function MessageBubble({ message, mine, authors, quoted, onReply }: BubbleProps) {
  return (
    <div
      data-message-id={message.messageId}
      className={cn(
        'group flex max-w-[80%] flex-col gap-0.5 rounded-lg transition-colors duration-700 data-[flash]:bg-primary/20',
        mine ? 'items-end' : 'items-start',
      )}
    >
      {message.replyToMessageId !== null && <ReplyQuote quoted={quoted} />}
      <div className={cn('flex items-center gap-1.5', mine && 'flex-row-reverse')}>
        <p
          className={cn(
            'rounded-lg px-3 py-2 text-sm break-words whitespace-pre-wrap text-foreground transition-colors duration-100',
            mine
              ? 'bg-primary/15 group-hover:bg-primary/25'
              : 'bg-muted group-hover:bg-foreground/10',
          )}
        >
          <EmoteText text={message.text} customEmojis={message.customEmojis} />
        </p>
        <ReplyButton
          authorName={authorNameOf(message, authors)}
          onReply={() => onReply(message)}
          className="shrink-0"
        />
      </div>
    </div>
  );
}

function authorNameOf(message: DmSentDto, authors: Authors): string {
  return message.fromUserId === authors.accountId ? 'VocÃª' : authors.friendName;
}

function quotedOf(
  message: DmSentDto,
  byId: ReadonlyMap<string, DmSentDto>,
  authors: Authors,
): QuotedMessage | null {
  const original =
    message.replyToMessageId === null ? undefined : byId.get(message.replyToMessageId);
  if (!original) return null;
  return {
    messageId: original.messageId,
    authorName: authorNameOf(original, authors),
    text: original.text,
  };
}
