import type { ChatConversationKey } from '@/lib/chat-conversations';
import { chatLineOf } from './chat-messages';
import type { ChatNoticeItem } from './use-chat-notices';

export type ChatPreviewStackProps = Readonly<{
  /** `useChatNotices().previews`, oldest first. */
  previews: readonly ChatNoticeItem[];
  nameOf: (userId: string) => string;
  /** Opens the drawer on the preview's conversation. */
  onOpen: (key: ChatConversationKey) => void;
}>;

/** The new messages rising above the chat bar, oldest on top, each a button that opens the
 *  drawer on its conversation. Silent for the screen reader (`aria-live="off"`): the chat's
 *  announcer already says each message once. Nothing is drawn without a preview.
 *
 *  Example: `<ChatPreviewStack previews={notices.previews} nameOf={people.nameOf} onOpen={openAt} />` */
export function ChatPreviewStack(props: ChatPreviewStackProps): React.JSX.Element | null {
  if (props.previews.length === 0) return null;
  return (
    <ul
      aria-label="Mensagens novas"
      aria-live="off"
      className="pointer-events-none flex w-full max-w-170 flex-col items-start gap-1"
    >
      {props.previews.map((item) => (
        <li key={item.id} className="max-w-full">
          <button
            type="button"
            onClick={() => props.onOpen(item.key)}
            className="pointer-events-auto max-w-full truncate rounded-sm border border-border bg-panel/95 px-3 py-1.5 text-left text-sm text-foreground backdrop-blur transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none"
          >
            {chatLineOf(item.message, props.nameOf)}
          </button>
        </li>
      ))}
    </ul>
  );
}
