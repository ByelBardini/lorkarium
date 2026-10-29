import type { ChatSpeakerDto } from '@lorkarium/contracts';
import { KeyboardIcon, SendHorizontalIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { chatCommandCatalogOf } from '@/lib/chat-commands-catalog';
import type { ChatConversationTarget } from '@/lib/chat-conversations';
import { chatContactsOf } from '@/lib/chat-recipients';
import type { ChatSendFailure, ChatSendRequest, ChatSendResult } from '@/services/chat-commands';
import { offlineRecipientsText, RECONNECTING_NOTICE } from './chat-messages';
import { ComposerSuggestions } from './composer-suggestions';
import { useComposerSuggestions } from './use-composer-suggestions';
import type { ChatPeople } from './use-chat-people';
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
}>;

/** The composer: "Falar como" and "Pra quem" at the Table, the field (Enter sends, Shift+Enter
 *  breaks the line, `/` and `@` open the suggestions) and "Enviar". A refusal keeps the draft
 *  and says why; a message nobody online would get is blocked, and the ones offline in a group
 *  are named.
 *
 *  Example: `<ChatComposer target={{ kind: 'table' }} people={people} live send={send} tools={tools} voice={voice} />` */
export function ChatComposer(props: ChatComposerProps): React.JSX.Element {
  const { target, people } = props;
  const composer = useChatComposer({ ...props, ...props.voice });
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
            disabled={!props.live}
          />
        </div>
      )}
      <ComposerBox {...props} composer={composer} />
      <ComposerHint atTable={atTable} canRoll={props.tools.canRoll} />
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

type BoxProps = ChatComposerProps & Readonly<{ composer: ChatComposerState }>;

function ComposerBox({ composer, live, tools, target, people }: BoxProps) {
  const field = useRef<HTMLTextAreaElement | null>(null);
  const [caret, setCaret] = useState(0);
  const atTable = target.kind === 'table';
  const suggestions = useComposerSuggestions({
    draft: composer.draft,
    caret,
    catalog: chatCommandCatalogOf(tools.savedRolls, { canRoll: tools.canRoll, atTable }),
    members: inputMembersOf(people),
    onAccept: (draft, at) => {
      composer.setDraft(draft);
      setCaret(at);
    },
  });
  useCaretAt(field, caret, composer.draft);
  return (
    <div className="relative flex items-end gap-2 rounded-md border border-input bg-card py-1.5 pr-1.5 pl-3 focus-within:border-primary">
      {suggestions.open && <ComposerSuggestions suggestions={suggestions} />}
      <textarea
        ref={field}
        role="combobox"
        aria-label="Mensagem"
        aria-expanded={suggestions.open}
        aria-controls={suggestions.open ? suggestions.listId : undefined}
        aria-activedescendant={suggestions.activeId}
        aria-autocomplete="list"
        rows={1}
        value={composer.draft}
        disabled={!live}
        placeholder="Escreva para a conversa…"
        onChange={(event) => {
          composer.setDraft(event.target.value);
          setCaret(event.target.selectionStart);
          suggestions.reopen();
        }}
        onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
        onKeyDown={(event) => {
          if (suggestions.onKey(event)) return;
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          composer.submit();
        }}
        className="[field-sizing:content] max-h-30 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-sm text-foreground outline-none placeholder:text-placeholder disabled:cursor-not-allowed disabled:opacity-60"
      />
      <Button
        size="icon"
        aria-label="Enviar"
        disabled={!composer.canSend}
        onClick={composer.submit}
      >
        <SendHorizontalIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

// After a suggestion is taken the field's text changes under the caret: put it after the insert.
function useCaretAt(
  field: React.RefObject<HTMLTextAreaElement | null>,
  caret: number,
  draft: string,
): void {
  useEffect(() => {
    const element = field.current;
    if (!element || element.selectionStart === caret) return;
    element.setSelectionRange(caret, caret);
  }, [field, caret, draft]);
}

function ComposerHint({ atTable, canRoll }: Readonly<{ atTable: boolean; canRoll: boolean }>) {
  return (
    <div
      data-testid="composer-hint"
      className="flex items-center justify-end text-[11px] text-muted-foreground"
    >
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="xs"
            aria-label="Atalhos do chat"
            className="text-muted-foreground"
          >
            <KeyboardIcon aria-hidden="true" />
            Atalhos
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          aria-label="Atalhos do chat"
          className="w-80 max-w-[calc(100vw-2rem)] gap-3 p-4"
        >
          <h3 className="text-sm font-semibold text-label">Atalhos do chat</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
            <ShortcutRow shortcut="Enter" description="Enviar mensagem" />
            <ShortcutRow shortcut="Shift+Enter" description="Quebrar linha" />
            <ShortcutRow shortcut="@nome" description="Mencionar alguém" />
            {atTable && <ShortcutRow shortcut="/w nome mensagem" description="Sussurrar" />}
            {atTable && canRoll && (
              <>
                <ShortcutRow shortcut="/r 1d20+5" description="Rolar para a mesa" />
                <ShortcutRow shortcut="/gr 2d6" description="Rolar só para mestres" />
                <ShortcutRow shortcut="/rolagem-salva" description="Rolar uma salva" />
              </>
            )}
          </dl>
          {atTable && (
            <p className="text-xs text-muted-foreground">
              Digite / no campo para ver os comandos disponíveis.
            </p>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ShortcutRow({
  shortcut,
  description,
}: Readonly<{ shortcut: string; description: string }>) {
  return (
    <>
      <dt className="font-mono text-label">{shortcut}</dt>
      <dd className="text-muted-foreground">{description}</dd>
    </>
  );
}
