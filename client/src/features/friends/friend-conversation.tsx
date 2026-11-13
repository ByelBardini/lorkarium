import type {
  DmSentDto,
  FriendDto,
  PresenceStatusDto,
  PresenceVisibilityDto,
} from '@lorkarium/contracts';
import { Navigate } from 'react-router';
import { directMessageFailureText } from '@/lib/direct-message-failure-text';
import { useDirectMessages } from '@/stores/direct-messages-store';
import { presenceOf, useFriends } from '@/stores/friends-store';
import { usePresenceChoice } from '@/stores/presence-choice-store';
import { ConversationComposer } from './conversation-composer';
import { ConversationFeed } from './conversation-feed';
import { ConversationHeader } from './conversation-header';
import { FRIENDS_PATH } from './friends-path';
import type { FriendsScreenDeps } from './friends-screen';
import { useAccountStatus } from './use-account-status';

export type FriendConversationProps = Readonly<{
  deps: FriendsScreenDeps;
  accountId: string;
  friendId: string;
}>;

const NO_MESSAGES: readonly DmSentDto[] = [];

/** The conversation column with one friend. Someone who is not (or no longer) a friend sends the
 *  screen back to the list.
 *
 *  Example: `<FriendConversation deps={deps} accountId={me.id} friendId={bia.userId} />` */
export function FriendConversation({
  deps,
  accountId,
  friendId,
}: FriendConversationProps): React.JSX.Element | null {
  const overview = useFriends(deps.friends, (state) => state.overview);
  const friend = overview?.friends.find((candidate) => candidate.userId === friendId);
  if (!overview) return null;
  if (!friend) return <Navigate to={FRIENDS_PATH} replace />;
  return <OpenConversation deps={deps} accountId={accountId} friend={friend} />;
}

type OpenConversationProps = Readonly<{
  deps: FriendsScreenDeps;
  accountId: string;
  friend: FriendDto;
}>;

function OpenConversation({ deps, accountId, friend }: OpenConversationProps): React.JSX.Element {
  const presence = useFriends(deps.friends, (state) => presenceOf(state, friend.userId));
  const choice = usePresenceChoice(deps.presenceChoice, (state) => state.choice);
  const live = useAccountStatus(deps.accountRealtime) === 'live';
  const typing = useDirectMessages(deps.directMessages, (state) => state.typing[friend.userId]);
  const messages = useDirectMessages(
    deps.directMessages,
    (state) => state.conversations[friend.userId]?.messages ?? NO_MESSAGES,
  );
  const lock = composerLockOf({ live, choice, friendStatus: presence.status, name: friend.name });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ConversationHeader friend={friend} presence={presence} />
      {!live && (
        <p role="status" className="border-b border-border bg-card px-4 py-2 text-sm text-label">
          Reconectando…
        </p>
      )}
      <ConversationFeed messages={messages} accountId={accountId} friend={friend} now={deps.now} />
      <p aria-live="polite" className="h-5 px-4 text-xs text-muted-foreground italic">
        {typing ? `${friend.name} está digitando…` : ''}
      </p>
      <ConversationComposer friend={friend} lock={lock} directMessages={deps.directMessages} />
    </div>
  );
}

type ComposerLockInput = Readonly<{
  live: boolean;
  choice: PresenceVisibilityDto;
  friendStatus: PresenceStatusDto;
  name: string;
}>;

// Nothing is saved by the server: the field never pretends a message will reach someone later.
function composerLockOf({ live, choice, friendStatus, name }: ComposerLockInput): string | null {
  if (!live) return 'Sem conexão: as mensagens voltam quando reconectar.';
  if (choice === 'invisible') return directMessageFailureText({ kind: 'sender_invisible' }, name);
  if (friendStatus === 'offline') {
    return directMessageFailureText({ kind: 'recipient_offline' }, name);
  }
  return null;
}
