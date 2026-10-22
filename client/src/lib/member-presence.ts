import type { SessionMemberDto } from '@lorkarium/contracts';

export type MemberPresence = 'online' | 'away' | 'offline';

/** Whether a member is here, as the server confirmed it: away when online with every tab of
 *  theirs standing still.
 *
 *  Example: `presenceOf(member) // 'online'` */
export function presenceOf(member: Pick<SessionMemberDto, 'online' | 'awaySince'>): MemberPresence {
  if (!member.online) return 'offline';
  return member.awaySince ? 'away' : 'online';
}
