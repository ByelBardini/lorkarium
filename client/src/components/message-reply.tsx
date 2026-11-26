import { AtSignIcon, ReplyIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** The quoted message as a reply shows it: who wrote it and its text. */
export type QuotedMessage = Readonly<{ messageId: string; authorName: string; text: string }>;

export const QUOTE_MISSING = 'Mensagem original indisponível';

const FLASH_MS = 1500;

/** Above a reply: the spine, who wrote the original and its first line. Clicking scrolls to the
 *  original and makes it blink; an original this device no longer has (it arrived before the
 *  visit, or was dropped by the history limit) says so and goes nowhere.
 *
 *  Example: `<ReplyQuote quoted={{ messageId, authorName: 'Bia', text: 'Abram a porta.' }} />` */
export function ReplyQuote({
  quoted,
}: Readonly<{ quoted: QuotedMessage | null }>): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-end gap-1.5 text-xs text-muted-foreground">
      <span
        aria-hidden="true"
        className="mb-[-2px] ml-3 h-2 w-4 shrink-0 rounded-tl-md border-t-2 border-l-2 border-border"
      />
      {quoted === null ? (
        <span className="truncate italic">{QUOTE_MISSING}</span>
      ) : (
        <button
          type="button"
          aria-label={`Ir para a mensagem de ${quoted.authorName}: ${quoted.text}`}
          onClick={(event) => jumpToMessage(event.currentTarget, quoted.messageId)}
          className="flex min-w-0 items-baseline gap-1 rounded-sm text-left hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="shrink-0 font-semibold">{quoted.authorName}</span>
          <span className="truncate">{quoted.text}</span>
        </button>
      )}
    </div>
  );
}

/** The "Responder" of a message, shown while the pointer is over it or a key reaches it (the
 *  message's element needs the `group` class).
 *
 *  Example: `<ReplyButton authorName="Bia" onReply={() => reply.start(message)} />` */
export function ReplyButton({
  authorName,
  onReply,
  className,
}: Readonly<{ authorName: string; onReply: () => void; className?: string }>): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-xs"
      aria-label={`Responder ${authorName}`}
      title="Responder"
      onClick={onReply}
      className={cn(
        'bg-panel opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100',
        className,
      )}
    >
      <ReplyIcon aria-hidden="true" />
    </Button>
  );
}

const CONTROLS = 'button, a, input, textarea, select, [role="button"]';

/** The `onDoubleClick` of a message: starts answering it, except on a control inside it (the
 *  author's name, a picture, a quote), which keeps its own meaning. The word the double click
 *  selected is let go, so the answer does not start with a highlighted word behind it.
 *
 *  Example: `<li onDoubleClick={replyOnDoubleClick(() => reply.start(message))}>` */
export function replyOnDoubleClick(
  onReply: () => void,
): (event: React.MouseEvent<HTMLElement>) => void {
  return (event) => {
    if (isElement(event.target) && event.target.closest(CONTROLS) !== null) return;
    event.currentTarget.ownerDocument.getSelection()?.removeAllRanges();
    onReply();
  };
}

// `instanceof Element` fails for a detached window's elements, which come from another realm.
function isElement(target: EventTarget): target is Element {
  return 'closest' in target;
}

export type ReplyBarProps = Readonly<{
  authorName: string;
  /** The @ toggle; `null` where answering never calls anyone (one's own message, a direct). */
  mention: Readonly<{ on: boolean; toggle: () => void }> | null;
  onCancel: () => void;
}>;

/** Above the field while answering: "Respondendo a Bia", the @ that calls her (on by default)
 *  and the X; Esc in the field cancels too.
 *
 *  Example: `<ReplyBar authorName="Bia" mention={{ on: true, toggle }} onCancel={cancel} />` */
export function ReplyBar({ authorName, mention, onCancel }: ReplyBarProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">
      <ReplyIcon aria-hidden="true" className="size-3.5 shrink-0" />
      <p className="min-w-0 flex-1 truncate">
        Respondendo a <span className="font-semibold text-foreground">{authorName}</span>
      </p>
      {mention && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-pressed={mention.on}
          aria-label={`Mencionar ${authorName}`}
          title={mention.on ? 'Menção ligada' : 'Menção desligada'}
          onClick={mention.toggle}
          className={cn(mention.on ? 'text-primary' : 'text-muted-foreground')}
        >
          <AtSignIcon aria-hidden="true" />
          {mention.on ? 'Ligado' : 'Desligado'}
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Cancelar resposta"
        onClick={onCancel}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

/** Scrolls the list a message belongs to until the message with `messageId` is in view and
 *  makes it blink; the list is the nearest `[data-message-list]` around `from`, so a detached
 *  window looks in its own document.
 *
 *  Example: `jumpToMessage(button, quoted.messageId)` */
export function jumpToMessage(from: Element, messageId: string): void {
  const list = from.closest('[data-message-list]');
  const target = list?.querySelector(`[data-message-id="${messageId}"]`);
  if (!target) return;
  target.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  target.setAttribute('data-flash', '');
  const view = target.ownerDocument.defaultView ?? window;
  view.setTimeout(() => target.removeAttribute('data-flash'), FLASH_MS);
}
