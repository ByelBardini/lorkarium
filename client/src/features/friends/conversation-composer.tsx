import { DIRECT_MESSAGE_MAX_LENGTH, type FriendDto } from '@lorkarium/contracts';
import { SendHorizontalIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { EmotePicker } from '@/components/emote-picker';
import { ReplyBar } from '@/components/message-reply';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { directMessageFailureText } from '@/lib/direct-message-failure-text';
import type { DirectMessagesStore } from '@/stores/direct-messages-store';
import { ComposerSuggestions } from '@/features/chat/composer-suggestions';
import { comboboxPropsOf, useComposerField } from '@/features/chat/use-composer-field';
import type { DirectReplyState } from './use-direct-reply';

export type ConversationComposerProps = Readonly<{
  friend: FriendDto;
  /** Why nothing can be sent now (offline friend, invisible, no connection), or `null`. */
  lock: string | null;
  directMessages: StoreApi<DirectMessagesStore>;
  /** The viewer's account: answering one's own message says "Você". */
  accountId: string;
  reply: DirectReplyState;
}>;

/** The message field: Enter sends, Shift+Enter breaks the line, typing tells the friend, `:`
 *  lists the memes and smileys and "Memes e smileys" opens their grid. A refusal
 *  gives the text back to the field with the reason (`role="alert"`); the message itself shows
 *  when the server confirms it (`dm:sent`). Answering a message shows "Respondendo a …" above
 *  the field (Esc or the X cancels it).
 *
 *  Example: `<ConversationComposer friend={bia} lock={null} directMessages={dms} accountId={me} reply={reply} />` */
export function ConversationComposer(props: ConversationComposerProps): React.JSX.Element {
  const { friend, lock, directMessages, reply } = props;
  const [text, setText] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const store = directMessages.getState();
  const canSend = lock === null && text.trim() !== '';
  const send = async (): Promise<void> => {
    if (!canSend) return;
    setText('');
    setRefusal(null);
    const replyToMessageId = reply.replying?.messageId ?? null;
    const outcome = await store.send(friend.userId, text.trim(), replyToMessageId);
    if (outcome.ok) return reply.cancel();
    setText(outcome.text);
    setRefusal(directMessageFailureText(outcome.failure, friend.name));
  };
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const field = useComposerField(fieldRef, {
    draft: text,
    setDraft: setText,
    catalog: [],
    members: [],
  });
  useFocusOnReply(fieldRef, reply.replying?.messageId);
  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (field.suggestions.onKey(event)) return;
    if (event.key === 'Escape' && reply.replying !== null) {
      event.preventDefault();
      return reply.cancel();
    }
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void send();
  };
  const onChange = (next: string): void => {
    setText(next);
    if (next.trim() !== '') store.notifyTyping(friend.userId);
  };
  return (
    <form
      className="flex flex-col gap-1 border-t border-border px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      {reply.replying && (
        <ReplyBar
          authorName={reply.replying.fromUserId === props.accountId ? 'Você' : friend.name}
          mention={null}
          onCancel={reply.cancel}
        />
      )}
      <div className="relative flex items-end gap-2">
        {field.suggestions.open && <ComposerSuggestions suggestions={field.suggestions} />}
        <Textarea
          ref={fieldRef}
          aria-label={`Mensagem para ${friend.name}`}
          {...comboboxPropsOf(field.suggestions)}
          placeholder={lock ? '' : `Mensagem pra ${friend.name}…`}
          value={text}
          rows={1}
          maxLength={DIRECT_MESSAGE_MAX_LENGTH}
          disabled={lock !== null}
          onKeyDown={onKeyDown}
          onChange={(event) => {
            onChange(event.target.value);
            field.onTyped(event.target);
          }}
          onSelect={(event) => field.onSelect(event.currentTarget)}
          className="max-h-40 min-h-10 resize-none"
        />
        <EmotePicker onPick={field.pickEmote} disabled={lock !== null} />
        <Button type="submit" size="icon" aria-label="Enviar" disabled={!canSend}>
          <SendHorizontalIcon aria-hidden="true" />
        </Button>
      </div>
      <ComposerNote lock={lock} refusal={refusal} />
    </form>
  );
}

function useFocusOnReply(
  fieldRef: React.RefObject<HTMLTextAreaElement | null>,
  repliedId: string | undefined,
): void {
  useEffect(() => {
    if (repliedId !== undefined) fieldRef.current?.focus();
  }, [fieldRef, repliedId]);
}

function ComposerNote({
  lock,
  refusal,
}: Readonly<{ lock: string | null; refusal: string | null }>): React.JSX.Element {
  return (
    <>
      <p role="alert" className="text-xs text-destructive-text empty:hidden">
        {refusal ?? ''}
      </p>
      <p className="text-xs text-muted-foreground">
        {lock ?? 'Enter envia · Shift+Enter quebra linha'}
      </p>
    </>
  );
}
