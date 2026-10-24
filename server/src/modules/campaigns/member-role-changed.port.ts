/** A member's role, saved: who, at which table, and the role they have now. */
export type MemberRoleChange = Readonly<{
  campaignId: string;
  userId: string;
  role: 'player' | 'spectator';
}>;

/** Told after a role change was saved, so the live table hears it and the member's open
 *  connections move to the rooms of the new role; implemented by the live session service
 *  (`session:memberUpdated`). */
export interface MemberRoleChangedPort {
  memberRoleChanged(change: MemberRoleChange): Promise<void>;
}
