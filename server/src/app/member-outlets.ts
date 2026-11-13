import type { ProfileChangedPort } from '../modules/profiles/profile-changed.port';
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

/** One `ProfileChangedPort` that tells each of `ports`, in order: the live tables of the person,
 *  then their friends' lists.
 *
 *  Example: `const profileChanged = profileChangedInOrder(sessions.service, friendNotice)` */
export function profileChangedInOrder(...ports: readonly ProfileChangedPort[]): ProfileChangedPort {
  return {
    profileChanged: async (userId: string): Promise<void> => {
      for (const port of ports) await port.profileChanged(userId);
    },
  };
}
