import type { ChatSpeakerDto } from '@lorkarium/contracts';
import { PaperclipIcon, SendHorizontalIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { EmotePicker } from '@/components/emote-picker';
import { ReplyBar } from '@/components/message-reply';
import { Button } from '@/components/ui/button';
import { CHAT_IMAGE_ACCEPT } from '@/lib/chat-attachment';
import { chatCommandCatalogOf } from '@/lib/chat-commands-catalog';
import type { ChatConversationTarget } from '@/lib/chat-conversations';
import { chatContactsOf } from '@/lib/chat-recipients';
import type { AssetsApi } from '@/services/assets-api';
import type { ChatSendFailure, ChatSendRequest, ChatSendResult } from '@/services/chat-commands';
import { ChatAttachmentPreview, ChatImageLinkField } from './chat-attachment-bar';
import { offlineRecipientsText, RECONNECTING_NOTICE } from './chat-messages';
import { chatVoiceNameOf } from './chat-message-row';
import { ComposerSuggestions } from './composer-suggestions';
import { comboboxPropsOf, useComposerField, type ComposerField } from './use-composer-field';
import type { ChatPeople } from './use-chat-people';
import type { ChatReplyState } from './use-chat-reply';
import { imageFileOf, useChatAttachment, type ChatAttachmentControls } from './use-chat-attachment';
import {
  inputMembersOf,
  useChatComposer,
  type ChatComposerState,
  type ComposerTools,
} from './use-chat-composer';
import { WhisperToMenu } from './whisper-to-menu';

/** "Falar como" of the composer: the menu (drawn beside "Pra quem") and who it chose. */
export type ComposerVoice = Readonly<{
  speaker: ChatSpeakerDto;
  /** The menu, given whether the Table is whispering (a character speaks only to everyone). */
  menu: (whispering: boolean) => React.ReactNode;
  onRefused: (failure: ChatSendFailure) => void;
}>;

export type ChatComposerProps = Readonly<{
  target: ChatConversationTarget;
  people: ChatPeople;
  /** The table's connection is up: without it nothing is sent (there is no queue). */
  live: boolean;
  send: (request: ChatSendRequest) => Promise<ChatSendResult>;
  tools: ComposerTools;
  voice: ComposerVoice;
  reply: ChatReplyState;
  /** Where an attached picture goes: the table's `chat_image`. */
  uploadTo: Readonly<{ campaignId: string; assets: AssetsApi }>;
}>;

/** The composer: "Falar como" and "Pra quem" at the Table, the field (Enter sends, Shift+Enter
 *  breaks the line, `/`, `:` and `@` open the suggestions), the picture (paste, drop, the clip or
 *  Ctrl+I for a link), "Memes e smileys" and "Enviar"; answering a message shows "Respondendo a …"
 *  above the field and keeps the original's whisper. A refusal keeps the draft and says why; a
 *  message nobody online would get is blocked, and the ones offline in a group are named.
 *
 *  Example: `<ChatComposer target={{ kind: 'table' }} people={people} live send={send} tools={tools} voice={voice} reply={reply} uploadTo={{ campaignId, assets }} />` */
export function ChatComposer(props: ChatComposerProps): React.JSX.Element {
  const { target, people } = props;
  const picture = useChatAttachment(props.uploadTo.campaignId, props.uploadTo.assets);
  const composer = useChatComposer({ ...props, ...props.voice, picture });
  const atTable = target.kind === 'table';
  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-border pt-2.5 pb-3">
      <ComposerNotices composer={composer} people={people} live={props.live} />
      {atTable && (
        <div className="flex flex-wrap gap-1.5">
          {props.voice.menu(composer.whisperTo !== null)}
          <WhisperToMenu
            contacts={chatContactsOf(people.members, people.viewerId ?? '')}
            whisperTo={composer.whisperTo}
            onChange={composer.setWhisperTo}
            disabled={!props.live || props.reply.draft !== null}
          />
        </div>
      )}
      <ComposerReplyBar reply={props.reply} people={people} />
      <ChatAttachmentPreview attachment={picture.attachment} onRemove={picture.remove} />
      <ComposerBox {...props} composer={composer} picture={picture} />
    </div>
  );
}

type NoticesProps = Readonly<{ composer: ChatComposerState; people: ChatPeople; live: boolean }>;

function ComposerNotices({ composer, people, live }: NoticesProps) {
  const { offlineIds, blocked } = composer.recipients;
  return (
    <>
      {!live && <p className="text-xs text-muted-foreground">{RECONNECTING_NOTICE}</p>}
      {offlineIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {offlineRecipientsText(offlineIds.map(people.nameOf), blocked)}
        </p>
      )}
      {composer.problem !== null && (
        <p role="alert" className="text-xs text-destructive-text">
          {composer.problem}
        </p>
      )}
    </>
  );
}

function ComposerReplyBar({
  reply,
  people,
}: Readonly<{ reply: ChatReplyState; people: ChatPeople }>) {
  const replied = reply.draft?.message.event;
  if (!reply.draft || !replied) return null;
  const mine = replied.fromUserId === people.viewerId;
  const mention = mine ? null : { on: reply.draft.mention, toggle: reply.toggleMention };
  return (
    <ReplyBar
      authorName={chatVoiceNameOf(replied, people)}
      mention={mention}
      onCancel={reply.cancel}
    />
  );
}

type BoxProps = ChatComposerProps &
  Readonly<{ composer: ChatComposerState; picture: ChatAttachmentControls }>;

function ComposerBox(props: BoxProps) {
  const { composer, live, picture } = props;
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const field = useBoxField(props, fieldRef);
  const closeLink = () => {
    setLinkOpen(false);
    fieldRef.current?.focus();
  };
  return (
    <>
      {linkOpen && <ChatImageLinkField onSubmit={picture.attachLink} onClose={closeLink} />}
      <div
        className="relative flex items-end gap-2 rounded-md border border-input bg-card py-1.5 pr-1.5 pl-3 focus-within:border-primary"
        onDragOver={(event) => {
          if (live && event.dataTransfer.types.includes('Files')) event.preventDefault();
        }}
        onDrop={(event) => {
          const file = imageFileOf(event.dataTransfer.files);
          if (!live || file === null) return;
          event.preventDefault();
          picture.attachFile(file);
        }}
      >
        <ComposerTextarea
          {...props}
          field={field}
          fieldRef={fieldRef}
          onOpenLink={() => setLinkOpen(true)}
        />
        <AttachButton picture={picture} disabled={!live} />
        <EmotePicker onPick={field.pickEmote} disabled={!live} />
        <Button
          size="icon"
          aria-label="Enviar"
          disabled={!composer.canSend}
          onClick={composer.submit}
        >
          <SendHorizontalIcon aria-hidden="true" />
        </Button>
      </div>
    </>
  );
}

type FieldRef = React.RefObject<HTMLTextAreaElement | null>;

type FieldProps = BoxProps &
  Readonly<{
    field: ComposerField;
    fieldRef: FieldRef;
    onOpenLink: () => void;
  }>;

function useBoxField(props: BoxProps, fieldRef: FieldRef) {
  const { composer, tools, target, people } = props;
  return useComposerField(fieldRef, {
    draft: composer.draft,
    setDraft: composer.setDraft,
    catalog: chatCommandCatalogOf(tools.savedRolls, {
      canRoll: tools.canRoll,
      atTable: target.kind === 'table',
    }),
    members: inputMembersOf(people),
  });
}

function ComposerTextarea(props: FieldProps) {
  const { composer, live, reply, picture, fieldRef, field } = props;
  const repliedId = reply.draft?.message.event.messageId;
  useEffect(() => {
    if (repliedId !== undefined) fieldRef.current?.focus();
  }, [repliedId, fieldRef]);
  return (
    <>
      {field.suggestions.open && <ComposerSuggestions suggestions={field.suggestions} />}
      <textarea
        ref={fieldRef}
        aria-label="Mensagem"
        {...comboboxPropsOf(field.suggestions)}
        rows={1}
        value={composer.draft}
        disabled={!live}
        placeholder="Escreva para a conversa…"
        onChange={(event) => {
          composer.setDraft(event.target.value);
          field.onTyped(event.target);
        }}
        onSelect={(event) => field.onSelect(event.currentTarget)}
        onPaste={(event) => {
          const file = imageFileOf(event.clipboardData.files);
          if (file === null) return;
          event.preventDefault();
          picture.attachFile(file);
        }}
        onKeyDown={(event) => {
          if (field.suggestions.onKey(event)) return;
          onComposerKey(event, props);
        }}
        className="[field-sizing:content] max-h-30 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-sm text-foreground outline-none placeholder:text-placeholder disabled:cursor-not-allowed disabled:opacity-60"
      />
    </>
  );
}

// Ctrl+I opens the link field instead of the browser's italic or its page info.
function onComposerKey(event: React.KeyboardEvent<HTMLTextAreaElement>, props: FieldProps): void {
  const { reply, composer } = props;
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'i') {
    event.preventDefault();
    props.onOpenLink();
    return;
  }
  if (event.key === 'Escape' && reply.draft !== null) {
    event.preventDefault();
    event.stopPropagation();
    reply.cancel();
    return;
  }
  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
  event.preventDefault();
  composer.submit();
}

function AttachButton({
  picture,
  disabled,
}: Readonly<{ picture: ChatAttachmentControls; disabled: boolean }>) {
  const input = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={CHAT_IMAGE_ACCEPT}
        aria-label="Escolher imagem"
        className="hidden"
        onChange={(event) => {
          const file = imageFileOf(event.target.files);
          event.target.value = '';
          if (file !== null) picture.attachFile(file);
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Anexar imagem"
        title="Anexar imagem (Ctrl+I cola um link)"
        disabled={disabled}
        className="text-muted-foreground"
        onClick={() => input.current?.click()}
      >
        <PaperclipIcon aria-hidden="true" />
      </Button>
    </>
  );
}
