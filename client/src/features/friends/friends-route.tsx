import type { RouteObject } from 'react-router';
import type { AppDependencies } from '@/app/router';
import { useSession } from '@/stores/session-store';
import { FRIENDS_PATH } from './friends-path';
import { FriendsPage } from './friends-page';
import type { FriendsScreenDeps } from './friends-screen';

/** "Amigos" under the shell: `/friends` and, with a conversation open, `/friends/:userId`. No
 *  loader: the friends store reads the lists (and the account socket keeps them fresh).
 *
 *  Example: `{ id: 'shell', children: [...homeRoutes(deps), friendsRoute(deps)] }` */
export function friendsRoute(deps: AppDependencies): RouteObject {
  const screen: FriendsScreenDeps = {
    friends: deps.friends,
    directMessages: deps.directMessages,
    accountRealtime: deps.accountRealtime,
    presenceChoice: deps.presenceChoice,
    now: deps.now,
  };
  return {
    path: `${FRIENDS_PATH.slice(1)}/:userId?`,
    Component: function FriendsRoute(): React.JSX.Element | null {
      const session = useSession(deps.sessionStore);
      if (session.status !== 'authenticated') return null;
      return <FriendsPage deps={screen} accountId={session.user.id} />;
    },
  };
}
