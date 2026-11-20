import type { FeedbackEntryPo } from './feedback-entries.po';
import type { FeedbackSender } from './feedback.dao';
import { FeedbackError } from './feedback.error';

// A code span or block: GitHub never turns an @ inside it into a mention, and a comment there
// would show as text.
const CODE = /(```[\s\S]*?```|`[^`\n]*`)/;
// An @ that starts a GitHub handle (not the middle of an e-mail address).
const MENTION = /(?<![\w`])@(?=[A-Za-z0-9])/g;

/** Who may send feedback, how much may wait at once, and what goes public.
 *
 *  Example: `FeedbackBo.requireActiveSender(sender, biaId)` */
export const FeedbackBo = {
  /** A suspended account sends nothing; an unknown one is the session's own bug.
   *
   *  Example: `FeedbackBo.requireActiveSender({ username: 'bia', suspended: true }, biaId) // throws FEEDBACK_FORBIDDEN` */
  requireActiveSender(sender: FeedbackSender | undefined, senderId: string): FeedbackSender {
    if (sender === undefined) {
      throw new Error(`sender ${senderId} not found: expected the session's account`);
    }
    if (!sender.suspended) return sender;
    throw new FeedbackError('FEEDBACK_FORBIDDEN', `account ${senderId} is suspended`);
  },

  /** Example: `FeedbackBo.requireWithinWaitingLimit(10, 10, biaId) // throws FEEDBACK_OPEN_LIMIT` */
  requireWithinWaitingLimit(waiting: number, limit: number, senderId: string): void {
    if (waiting < limit) return;
    throw new FeedbackError(
      'FEEDBACK_OPEN_LIMIT',
      `account ${senderId} has ${waiting} entries waiting: expected fewer than ${limit}`,
    );
  },

  /** Every screenshot asked for must be one the sender sent and no entry claimed yet; anything
   *  else answers the same not found (it never tells whose it is).
   *
   *  Example: `FeedbackBo.requireClaimable([shotA], []) // throws ATTACHMENT_NOT_FOUND` */
  requireClaimable(requestedIds: readonly string[], looseIds: readonly string[]): void {
    const missing = requestedIds.find((id) => !looseIds.includes(id));
    if (missing === undefined) return;
    throw new FeedbackError(
      'ATTACHMENT_NOT_FOUND',
      `screenshot ${missing} not found: expected one the sender sent and no entry claimed`,
    );
  },

  /** An entry another admin already published or archived reads as not found.
   *
   *  Example: `FeedbackBo.requireWaiting(undefined, entryId) // throws FEEDBACK_NOT_FOUND` */
  requireWaiting(entry: FeedbackEntryPo | undefined, entryId: string): FeedbackEntryPo {
    if (entry !== undefined) return entry;
    throw new FeedbackError(
      'FEEDBACK_NOT_FOUND',
      `feedback ${entryId} not found: expected one waiting in the queue`,
    );
  },

  /** The body with every @handle broken so publishing it pings nobody (`@<!-- -->bia` renders
   *  as `@bia`); code spans and blocks are left as they are.
   *
   *  Example: `FeedbackBo.inertMentionsOf('valeu @bia') // 'valeu @<!-- -->bia'` */
  inertMentionsOf(body: string): string {
    return body
      .split(CODE)
      .map((part, index) => (index % 2 === 1 ? part : part.replace(MENTION, '@<!-- -->')))
      .join('');
  },
};
