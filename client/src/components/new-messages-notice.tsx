import { ArrowDown } from 'lucide-react';

export type NewMessagesNoticeProps = Readonly<{ onJump: () => void }>;

/** The quiet notice over the end of a feed the reader scrolled away from: something new arrived
 *  below. Clicking it goes to the end. The parent positions it (`relative` around the feed).
 *
 *  Example: `{follow.hasUnseen && <NewMessagesNotice onJump={follow.jumpToEnd} />}` */
export function NewMessagesNotice({ onJump }: NewMessagesNoticeProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onJump}
      className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1 text-xs font-medium text-primary hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      Novas mensagens
      <ArrowDown aria-hidden="true" className="size-3.5" />
    </button>
  );
}
