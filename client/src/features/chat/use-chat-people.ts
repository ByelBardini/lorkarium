import type { SessionMemberDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import { useOpenTables, type OpenTable, type OpenTablesStore } from '@/stores/open-tables-store';
import { useSession, type SessionStore } from '@/stores/session-store';
import {
  createTablePresenceStore,
  useTablePresence,
  type TablePresenceStore,
} from '@/stores/table-presence-store';
import { useRollerIdentity, type RollerIdentity } from '@/features/dice/use-roller-identity';
import { SOMEONE } from './chat-messages';

/** The table's roster as the chat reads it: who reads, everyone, and each one's look. */
export type ChatPeople = Readonly<{
  /** The signed-in account; `null` before the session answers. */
  viewerId: string | null;
  members: readonly SessionMemberDto[];
  identityOf: (userId: string) => RollerIdentity;
  /** The nickname, or "Alguém" for someone no longer in the roster. */
  nameOf: (userId: string) => string;
  memberOf: (userId: string) => SessionMemberDto | null;
}>;

// A table not open yet has no presence: an empty one keeps the hook's call unconditional.
const EMPTY_PRESENCE = createTablePresenceStore('');

/** The chat's view of the roster and of who reads.
 *
 *  Example: `const people = useChatPeople(table.presence, deps.sessionStore); people.nameOf(bia) // 'Bia'` */
export function useChatPeople(
  presence: StoreApi<TablePresenceStore> | null,
  sessionStore: StoreApi<SessionStore>,
): ChatPeople {
  const members = useTablePresence(presence ?? EMPTY_PRESENCE, (state) => state.members);
  const identityOf = useRollerIdentity(presence);
  const session = useSession(sessionStore);
  const viewerId = session.status === 'authenticated' ? session.user.id : null;
  const memberOf = (userId: string) => members.find((each) => each.userId === userId) ?? null;
  const nameOf = (userId: string) => memberOf(userId)?.name ?? SOMEONE;
  return { viewerId, members, identityOf, nameOf, memberOf };
}

/** One table open in the tab (its chat and its dice history); `null` while it is not open.
 *
 *  Example: `const chat = useOpenTableOf(deps.openTables, campaign.id)?.chat` */
export function useOpenTableOf(
  openTables: StoreApi<OpenTablesStore>,
  campaignId: string,
): OpenTable | null {
  return useOpenTables(
    openTables,
    (state) => state.tables.find((table) => table.campaignId === campaignId) ?? null,
  );
}
