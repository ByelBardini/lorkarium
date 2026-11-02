import type { MemberRoleChange } from './member-role-changed.port';

/** What the live table is told once the role and its seat are committed (a no-op when the seat
 *  did not change). */
export type MemberSeatNotice = () => void;

/** What follows a member's role at the table (their character: created, shown again or hidden),
 *  written inside the role's own transaction, so the two are saved together or not at all.
 *  Implemented by the characters module; the campaigns module never sees a character.
 *
 *  Example: `const notice = await seat.roleSaved({ campaignId, userId, role: 'player', from: 'spectator' })` */
export interface MemberSeatPort {
  roleSaved(change: MemberRoleChange): Promise<MemberSeatNotice>;
}
