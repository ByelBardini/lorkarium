import type { FriendDto, PresenceStatusDto } from '@lorkarium/contracts';
import { searchText } from './search-text';

/** What the friends screen calls each status. */
export const PRESENCE_LABELS: Readonly<Record<PresenceStatusDto, string>> = {
  online: 'Online',
  away: 'Ausente',
  offline: 'Offline',
};

const GROUP_ORDER: readonly PresenceStatusDto[] = ['online', 'away', 'offline'];

export type FriendGroup = Readonly<{
  status: PresenceStatusDto;
  label: string;
  friends: readonly FriendDto[];
}>;

export type FriendGroupFilter = Readonly<{
  /** The "Online" tab: offline friends stay out. */
  onlineOnly: boolean;
  query: string;
}>;

/** The friends list by status (Online, Ausente, Offline; empty groups left out), each by name,
 *  kept to who matches the search.
 *
 *  Example: `friendGroupsOf(overview.friends, (id) => presenceOf(state, id).status, { onlineOnly: false, query: 'bia' })` */
export function friendGroupsOf(
  friends: readonly FriendDto[],
  statusOf: (userId: string) => PresenceStatusDto,
  filter: FriendGroupFilter,
): FriendGroup[] {
  const shown = friends.filter((friend) => matchesFriendQuery(friend, filter.query));
  const statuses = filter.onlineOnly ? GROUP_ORDER.slice(0, 2) : GROUP_ORDER;
  return statuses
    .map((status) => ({
      status,
      label: PRESENCE_LABELS[status],
      friends: byName(shown.filter((friend) => statusOf(friend.userId) === status)),
    }))
    .filter((group) => group.friends.length > 0);
}

/** Whether a friend matches the search: a piece of the nickname or of the @ (an "@" typed is
 *  dropped), without accent or case; an empty search matches everyone.
 *
 *  Example: `matchesFriendQuery(bia, '@BIA') // true` */
export function matchesFriendQuery(
  friend: Pick<FriendDto, 'name' | 'username'>,
  query: string,
): boolean {
  const wanted = searchText(query.trim().replace(/^@/, ''));
  if (wanted === '') return true;
  return searchText(friend.name).includes(wanted) || searchText(friend.username).includes(wanted);
}

function byName(friends: readonly FriendDto[]): FriendDto[] {
  return [...friends].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
