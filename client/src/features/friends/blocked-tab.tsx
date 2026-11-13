import type { BlockedUserDto } from '@lorkarium/contracts';
import { Button } from '@/components/ui/button';
import { friendsFailureText } from '@/lib/friends-failure-text';
import { FriendPerson } from './friend-person';
import { FriendsSection } from './friends-section';
import type { FriendsScreenDeps, ShowFriendsNotice } from './friends-screen';
import { UsernameForm } from './username-form';

export type BlockedTabProps = Readonly<{
  blocked: readonly BlockedUserDto[];
  deps: FriendsScreenDeps;
  onNotice: ShowFriendsNotice;
}>;

/** "Bloqueados": who is blocked (Desbloquear, which does not make friends again) and blocking a
 *  stranger by the exact @.
 *
 *  Example: `<BlockedTab blocked={overview.blocked} deps={deps} onNotice={show} />` */
export function BlockedTab({ blocked, deps, onNotice }: BlockedTabProps): React.JSX.Element {
  const friends = deps.friends.getState();
  const unblock = async (person: BlockedUserDto): Promise<void> => {
    const result = await friends.unblock(person.userId);
    if (!result.ok) return onNotice({ text: friendsFailureText(result.failure), error: true });
    onNotice({ text: `${person.name} foi desbloqueado.`, error: false });
  };
  const blockByUsername = async (username: string): Promise<string | null> => {
    // Looked up before: the success reads the lists again, without them.
    const friend = deps.friends
      .getState()
      .overview?.friends.find((candidate) => candidate.username === username);
    const result = await friends.block({ username });
    if (!result.ok) return friendsFailureText(result.failure, username);
    if (friend) deps.directMessages.getState().forget(friend.userId);
    onNotice({ text: `@${username} foi bloqueado.`, error: false });
    return null;
  };
  return (
    <div className="flex flex-col gap-6 py-4">
      <p className="px-4 text-sm text-muted-foreground">
        Quem está bloqueado não te manda mensagem nem pedido, não vê seu status e não entra nas suas
        mesas.
      </p>
      <div className="px-4">
        <UsernameForm label="Bloquear pelo @" submitLabel="Bloquear" onSubmit={blockByUsername} />
      </div>
      <FriendsSection title="Bloqueados" count={blocked.length} empty="Ninguém bloqueado.">
        {blocked.map((person) => (
          <li
            key={person.userId}
            aria-label={person.name}
            className="flex items-center justify-between gap-2 px-4 py-2"
          >
            <FriendPerson person={person} detail={`@${person.username}`} />
            <Button variant="outline" size="sm" onClick={() => void unblock(person)}>
              Desbloquear
            </Button>
          </li>
        ))}
      </FriendsSection>
    </div>
  );
}
