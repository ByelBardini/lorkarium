import { DIRECT_MESSAGE_MAX_LENGTH, type FriendDto } from '@lorkarium/contracts';
import { SendHorizontalIcon } from 'lucide-react';
import { useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { directMessageFailureText } from '@/lib/direct-message-failure-text';
import type { DirectMessagesStore } from '@/stores/direct-messages-store';

export type ConversationComposerProps = Readonly<{
  friend: FriendDto;
  /** Why nothing can be sent now (offline friend, invisible, no connection), or `null`. */
  lock: string | null;
  directMessages: StoreApi<DirectMessagesStore>;
}>;

/** The message field: Enter sends, Shift+Enter breaks the line, typing tells the friend. A refusal
 *  gives the text back to the field with the reason (`role="alert"`); the message itself shows
 *  when the server confirms it (`dm:sent`).
 *
 *  Example: `<ConversationComposer friend={bia} lock={null} directMessages={dms} />` */
export function ConversationComposer({
  friend,
  lock,
  directMessages,
}: ConversationComposerProps): React.JSX.Element {
  const [text, setText] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const store = directMessages.getState();
  const canSend = lock === null && text.trim() !== '';
  const send = async (): Promise<void> => {
    if (!canSend) return;
    setText('');
    setRefusal(null);
    const outcome = await store.send(friend.userId, text.trim());
    if (outcome.ok) return;
    setText(outcome.text);
    setRefusal(directMessageFailureText(outcome.failure, friend.name));
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
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
      <div className="flex items-end gap-2">
        <Textarea
          aria-label={`Mensagem para ${friend.name}`}
          placeholder={lock ? '' : `Mensagem pra ${friend.name}…`}
          value={text}
          rows={1}
          maxLength={DIRECT_MESSAGE_MAX_LENGTH}
          disabled={lock !== null}
          onKeyDown={onKeyDown}
          onChange={(event) => onChange(event.target.value)}
          className="max-h-40 min-h-10 resize-none"
        />
        <Button type="submit" size="icon" aria-label="Enviar" disabled={!canSend}>
          <SendHorizontalIcon aria-hidden="true" />
        </Button>
      </div>
      <ComposerNote lock={lock} refusal={refusal} />
    </form>
  );
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
