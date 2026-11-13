import type { FriendDto } from '@lorkarium/contracts';
import { friendGroupsOf } from '@/lib/friend-groups';
import { useDirectMessages } from '@/stores/direct-messages-store';
import { OFFLINE_PRESENCE, useFriends } from '@/stores/friends-store';
import { FriendRow } from './friend-row';
import { FriendsSection } from './friends-section';
import type { FriendsScreenDeps, ShowFriendsNotice } from './friends-screen';

export type FriendGroupsListProps = Readonly<{
  friends: readonly FriendDto[];
  onlineOnly: boolean;
  query: string;
  selectedId: string | null;
  deps: FriendsScreenDeps;
  onNotice: ShowFriendsNotice;
}>;

/** The friends by status (Online · Ausente · Offline, with the count), or the sentence of why the
 *  list is empty: no friend yet, no one online, no one matching the search.
 *
 *  Example: `<FriendGroupsList friends={overview.friends} onlineOnly={false} query="" selectedId={null} deps={deps} onNotice={show} />` */
export function FriendGroupsList(props: FriendGroupsListProps): React.JSX.Element {
  const { deps, query } = props;
  const presence = useFriends(deps.friends, (state) => state.presence);
  const conversations = useDirectMessages(deps.directMessages, (state) => state.conversations);
  const presenceOfFriend = (userId: string) => presence[userId] ?? OFFLINE_PRESENCE;
  const statusOf = (userId: string) => presenceOfFriend(userId).status;
  const groups = friendGroupsOf(props.friends, statusOf, { onlineOnly: props.onlineOnly, query });
  if (groups.length === 0) return <EmptyList query={query} onlineOnly={props.onlineOnly} />;
  return (
    <div className="flex flex-col gap-4 py-4">
      {groups.map((group) => (
        <FriendsSection
          key={group.status}
          title={group.label}
          count={group.friends.length}
          empty=""
        >
          {group.friends.map((friend) => (
            <FriendRow
              key={friend.userId}
              friend={friend}
              presence={presenceOfFriend(friend.userId)}
              unread={conversations[friend.userId]?.unread ?? 0}
              selected={props.selectedId === friend.userId}
              deps={deps}
              onNotice={props.onNotice}
            />
          ))}
        </FriendsSection>
      ))}
    </div>
  );
}

function EmptyList({
  query,
  onlineOnly,
}: Readonly<{ query: string; onlineOnly: boolean }>): React.JSX.Element {
  const text =
    query.trim() !== ''
      ? `Ninguém com “${query.trim()}”.`
      : onlineOnly
        ? 'Ninguém online agora.'
        : 'Ainda sem amigos. Bora adicionar alguém?';
  return <p className="px-4 py-6 text-sm text-muted-foreground">{text}</p>;
}
