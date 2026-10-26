import { memberColorOf, type MemberColor } from '@lorkarium/game-core';
import type { StoreApi } from 'zustand/vanilla';
import {
  createTablePresenceStore,
  useTablePresence,
  type TablePresenceStore,
} from '@/stores/table-presence-store';
import { UNKNOWN_ROLLER } from './dice-messages';

/** Who rolled, as the history and the notice draw them: the name and the avatar. */
export type RollerIdentity = Readonly<{
  name: string;
  color: MemberColor;
  avatarId: string | null;
}>;

// A table not open yet has no presence: an empty one keeps the hook's call unconditional.
const EMPTY_PRESENCE = createTablePresenceStore('');

/** Looks a roller up in the table's roster; someone no longer in it is "Alguém", in the color
 *  drawn from their id.
 *
 *  Example: `const rollerOf = useRollerIdentity(table.presence); rollerOf(event.rollerId).name // 'Bia'` */
export function useRollerIdentity(
  presence: StoreApi<TablePresenceStore> | null,
): (userId: string) => RollerIdentity {
  const members = useTablePresence(presence ?? EMPTY_PRESENCE, (state) => state.members);
  return (userId) => {
    const member = members.find((each) => each.userId === userId);
    if (member === undefined) {
      return { name: UNKNOWN_ROLLER, color: memberColorOf(userId, null), avatarId: null };
    }
    return { name: member.name, color: member.color, avatarId: member.avatarId };
  };
}
