import { useCallback, useState } from 'react';
import type { ChatConversationKey, ChatMessage } from '@/lib/chat-conversations';
import type { ChatReplyDraft } from '@/lib/chat-replies';

/** The answer being written in the conversation shown; another conversation has none. */
export type ChatReplyState = Readonly<{
  draft: ChatReplyDraft | null;
  start: (message: ChatMessage) => void;
  toggleMention: () => void;
  cancel: () => void;
}>;

type KeyedDraft = Readonly<{ key: ChatConversationKey; draft: ChatReplyDraft }>;

/** The reply of the chat panel: starting one calls the author by default (the @ toggles it);
 *  switching conversations forgets it, sending or Esc cancels it. `start` keeps its identity, so
 *  the feed's rows stay memoized.
 *
 *  Example: `const reply = useChatReply(shown.conversation.key)` */
export function useChatReply(key: ChatConversationKey): ChatReplyState {
  const [kept, setKept] = useState<KeyedDraft | null>(null);
  const start = useCallback(
    (message: ChatMessage) => setKept({ key, draft: { message, mention: true } }),
    [key],
  );
  const toggleMention = useCallback(
    () => setKept((now) => now && { ...now, draft: { ...now.draft, mention: !now.draft.mention } }),
    [],
  );
  const cancel = useCallback(() => setKept(null), []);
  const draft = kept?.key === key ? kept.draft : null;
  return { draft, start, toggleMention, cancel };
}
