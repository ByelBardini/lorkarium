import type { DmSentDto } from '@lorkarium/contracts';
import { useCallback, useState } from 'react';

/** The message being answered in the conversation with one friend; another friend has none. */
export type DirectReplyState = Readonly<{
  replying: DmSentDto | null;
  start: (message: DmSentDto) => void;
  cancel: () => void;
}>;

type KeptReply = Readonly<{ friendId: string; message: DmSentDto }>;

/** The reply of a direct conversation: switching friends forgets it, sending or Esc cancels it.
 *  `start` keeps its identity while the friend stays.
 *
 *  Example: `const reply = useDirectReply(friend.userId)` */
export function useDirectReply(friendId: string): DirectReplyState {
  const [kept, setKept] = useState<KeptReply | null>(null);
  const start = useCallback((message: DmSentDto) => setKept({ friendId, message }), [friendId]);
  const cancel = useCallback(() => setKept(null), []);
  const replying = kept?.friendId === friendId ? kept.message : null;
  return { replying, start, cancel };
}
