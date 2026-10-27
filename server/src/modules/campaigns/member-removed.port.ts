/** A member taken out of a table without deleting it: who, and from which table. */
export type MemberRemoval = Readonly<{ campaignId: string; userId: string }>;

/** Told after the member's row is gone, so their open connections leave the live table and the
 *  others see them go; implemented by the live session service (`session:removedFromTable`,
 *  `session:memberLeft`). A juggernaut who was not a member turning the mode off is one. */
export interface MemberRemovedPort {
  memberRemoved(removal: MemberRemoval): Promise<void>;
}
