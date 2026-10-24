import type { ReactNode } from 'react';
import { MemberRoleContext, type MemberRoleChanger } from './use-member-role-change';

/** Gives the play room the way to promote and move to the spectators; without it, the tab shows
 *  no role command (only the room, under the router, has the API).
 *
 *  Example: `<MemberRoleProvider changer={deps.campaignsApi}><PlayRoomPage … /></MemberRoleProvider>` */
export function MemberRoleProvider({
  changer,
  children,
}: Readonly<{ changer: MemberRoleChanger; children: ReactNode }>): React.JSX.Element {
  return <MemberRoleContext value={changer}>{children}</MemberRoleContext>;
}
