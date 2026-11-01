import type { MemberRemovedPort, MemberRemoval } from '../modules/campaigns/member-removed.port';

/** One `MemberRemovedPort` that tells each of `ports`, in order: the live session first (the
 *  member's connections leave the table), then their character (the rest of the table, minus
 *  them, hears it go nobody's).
 *
 *  Example: `const removed = removedInOrder(sessions.service, characters.seats)` */
export function removedInOrder(...ports: readonly MemberRemovedPort[]): MemberRemovedPort {
  return {
    memberRemoved: async (removal: MemberRemoval): Promise<void> => {
      for (const port of ports) await port.memberRemoved(removal);
    },
  };
}
