import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type {
  ChatConversation,
  ChatConversationKey,
  ChatConversationTarget,
} from '@/lib/chat-conversations';
import { cn } from '@/lib/utils';
import { unreadLabel } from './chat-messages';

export type ConversationStripProps = Readonly<{
  /** In the strip's order (`stripOrderOf`). */
  conversations: readonly ChatConversation[];
  selectedKey: ChatConversationKey;
  onSelect: (key: ChatConversationKey) => void;
  onClose: (key: ChatConversationKey) => void;
  nameOf: (target: ChatConversationTarget) => string;
  /** "Nova conversa"; `null` hides it. */
  onNewConversation: (() => void) | null;
}>;

/** The conversations of the visit in one row: the Table, the directs and the groups, each with
 *  its unread count (gold for a direct, a group or a mention: what is for the viewer).
 *
 *  Example: `<ConversationStrip conversations={stripOrderOf(all)} selectedKey="table" onSelect={select} nameOf={nameOf} onNewConversation={null} />` */
export function ConversationStrip(props: ConversationStripProps): React.JSX.Element {
  return (
    <nav aria-label="Conversas" className="flex shrink-0 items-center gap-1 border-b border-border">
      <ul className="flex min-w-0 flex-1 gap-1 overflow-x-auto py-2">
        {props.conversations.map((conversation) => (
          <li key={conversation.key} className="shrink-0">
            <ConversationButton
              conversation={conversation}
              name={props.nameOf(conversation.target)}
              selected={conversation.key === props.selectedKey}
              onSelect={() => props.onSelect(conversation.key)}
              onClose={() => props.onClose(conversation.key)}
            />
          </li>
        ))}
      </ul>
      {props.onNewConversation && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Nova conversa"
          onClick={props.onNewConversation}
          className="text-muted-foreground"
        >
          <PlusIcon aria-hidden="true" />
        </Button>
      )}
    </nav>
  );
}

type ConversationButtonProps = Readonly<{
  conversation: ChatConversation;
  name: string;
  selected: boolean;
  onSelect: () => void;
  onClose: () => void;
}>;

function ConversationButton(props: ConversationButtonProps): React.JSX.Element {
  const { unread, mentioned, target } = props.conversation;
  const important = mentioned || target.kind !== 'table';
  const button = (
    <button
      type="button"
      aria-label={unreadLabel(props.name, unread)}
      aria-current={props.selected ? 'true' : undefined}
      onClick={props.onSelect}
      className={cn(
        'inline-flex h-8 max-w-40 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-semibold outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring',
        props.selected
          ? 'border-primary/60 bg-primary/10 text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      <span className="truncate">{props.name}</span>
      {unread > 0 && <UnreadCount count={unread} important={important} />}
    </button>
  );
  if (target.kind === 'table') return button;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <span className="inline-flex">{button}</span>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={props.onClose}>Fechar conversa</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** The square counter of the design system (the dice button's), never a pill; the number
 *  reaches the screen reader by the owner's own label.
 *
 *  Example: `<UnreadCount count={3} important />` */
export function UnreadCount({
  count,
  important,
}: Readonly<{ count: number; important: boolean }>): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      data-important={important}
      className={cn(
        'inline-grid h-4.5 min-w-4.5 place-items-center rounded-sm px-1 text-[11px] font-semibold tabular-nums',
        important ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
