import { MessagesSquareIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useParams } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { cn } from '@/lib/utils';
import type { DirectMessagesStore } from '@/stores/direct-messages-store';
import { FriendConversation } from './friend-conversation';
import { FriendsList } from './friends-list';
import type { FriendsScreenDeps } from './friends-screen';

export type FriendsPageProps = Readonly<{ deps: FriendsScreenDeps; accountId: string }>;

/** "Amigos": the list beside the conversation from `md` up; below it, one column at a time
 *  (`/friends` the list, `/friends/:userId` the conversation with "Voltar").
 *
 *  Example: `<FriendsPage deps={deps} accountId={user.id} />` */
export function FriendsPage({ deps, accountId }: FriendsPageProps): React.JSX.Element {
  const selectedId = useParams().userId ?? null;
  useEffect(() => void deps.friends.getState().load(), [deps.friends]);
  useActiveConversation(deps.directMessages, selectedId);
  return (
    <div className="flex min-h-0 flex-1">
      <section
        aria-label="Lista de amigos"
        className={cn(
          'w-full min-w-0 flex-col border-border md:flex md:w-80 md:shrink-0 md:border-r',
          selectedId ? 'hidden' : 'flex',
        )}
      >
        <FriendsList deps={deps} selectedId={selectedId} />
      </section>
      <section
        aria-label="Conversa"
        className={cn('min-w-0 flex-1 flex-col md:flex', selectedId ? 'flex' : 'hidden')}
      >
        {selectedId ? (
          <FriendConversation
            key={selectedId}
            deps={deps}
            accountId={accountId}
            friendId={selectedId}
          />
        ) : (
          <NoConversation />
        )}
      </section>
    </div>
  );
}

// The conversation on screen reads its messages at once; leaving the screen reads none.
function useActiveConversation(
  directMessages: StoreApi<DirectMessagesStore>,
  friendId: string | null,
): void {
  useEffect(() => {
    directMessages.getState().setActive(friendId);
    return () => directMessages.getState().setActive(null);
  }, [directMessages, friendId]);
}

function NoConversation(): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <MessagesSquareIcon aria-hidden="true" className="size-8 text-muted-foreground" />
      <p className="font-display text-2xl text-foreground">Escolhe alguém pra conversar</p>
      <p className="text-sm text-muted-foreground">Ou adiciona a galera pelo @usuário.</p>
    </div>
  );
}
