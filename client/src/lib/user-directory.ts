import type {
  AdminDirectoryResponseDto,
  AdminInvitationDto,
  AdminUserDto,
} from '@lorkarium/contracts';
import { searchText } from './search-text';
import { sinceLabel } from './since-label';

/** The status of a row: the account's, or the invitation's (expired at `expiresAt ≤ now`). */
export type DirectoryStatus = 'active' | 'suspended' | 'invited' | 'invite-expired';

export type DirectoryRow =
  | Readonly<{ kind: 'user'; id: string; status: DirectoryStatus; user: AdminUserDto; at: string }>
  | Readonly<{
      kind: 'invitation';
      id: string;
      status: DirectoryStatus;
      invitation: AdminInvitationDto;
      at: string;
    }>;

/** The status tabs: "Convidados" holds both invitation statuses. */
export type StatusFilter = 'all' | 'active' | 'invited' | 'suspended';
export type RoleFilter = 'all' | 'admin' | 'user';

export type DirectoryFilters = Readonly<{ query: string; status: StatusFilter; role: RoleFilter }>;

export const STATUS_FILTERS: readonly StatusFilter[] = ['all', 'active', 'invited', 'suspended'];
export const ROLE_FILTERS: readonly RoleFilter[] = ['all', 'admin', 'user'];

/** Accounts and invitations in one list, the newest first (an account by its creation, an
 *  invitation by when it was sent).
 *
 *  Example: `directoryRows({ users, invitations }, now)[0].kind // 'invitation'` */
export function directoryRows(directory: AdminDirectoryResponseDto, now: Date): DirectoryRow[] {
  const users = directory.users.map((user): DirectoryRow => ({
    kind: 'user',
    id: user.id,
    status: user.status,
    user,
    at: user.createdAt,
  }));
  const invitations = directory.invitations.map((invitation): DirectoryRow => ({
    kind: 'invitation',
    id: invitation.id,
    status: Date.parse(invitation.expiresAt) <= now.getTime() ? 'invite-expired' : 'invited',
    invitation,
    at: invitation.sentAt,
  }));
  return [...users, ...invitations].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** The rows that pass the search (nickname, @ or e-mail; no accent nor case), the status tab and
 *  the role.
 *
 *  Example: `filterDirectory(rows, { query: 'BIA', status: 'all', role: 'all' })` */
export function filterDirectory(
  rows: readonly DirectoryRow[],
  filters: DirectoryFilters,
): DirectoryRow[] {
  return rows.filter(
    (row) =>
      matchesQuery(row, filters.query) &&
      matchesRole(row, filters.role) &&
      matchesStatus(row.status, filters.status),
  );
}

/** How many rows each status tab holds, over the search and the role but not the tab itself.
 *
 *  Example: `statusCounts(rows, filters).suspended // 1` */
export function statusCounts(
  rows: readonly DirectoryRow[],
  filters: DirectoryFilters,
): Readonly<Record<StatusFilter, number>> {
  const visible = filterDirectory(rows, { ...filters, status: 'all' });
  const count = (status: StatusFilter): number =>
    visible.filter((row) => matchesStatus(row.status, status)).length;
  return {
    all: visible.length,
    active: count('active'),
    invited: count('invited'),
    suspended: count('suspended'),
  };
}

/** The "Último acesso" cell: since the last login, "nunca entrou", or the invitation's moment.
 *
 *  Example: `lastAccessLabel(row, now) // 'convite há 2 dias'` */
export function lastAccessLabel(row: DirectoryRow, now: Date): string {
  if (row.kind === 'invitation') {
    if (row.status === 'invite-expired')
      return `venceu ${sinceLabel(row.invitation.expiresAt, now)}`;
    return `convite ${sinceLabel(row.invitation.sentAt, now)}`;
  }
  return row.user.lastSeenAt ? sinceLabel(row.user.lastSeenAt, now) : 'nunca entrou';
}

/** The filters of the URL (`?q=&status=&role=`); anything unknown falls back to "all".
 *
 *  Example: `filtersOf(new URLSearchParams('status=suspended')).status // 'suspended'` */
export function filtersOf(params: URLSearchParams): DirectoryFilters {
  const status = params.get('status');
  const role = params.get('role');
  return {
    query: params.get('q') ?? '',
    status: STATUS_FILTERS.find((candidate) => candidate === status) ?? 'all',
    role: ROLE_FILTERS.find((candidate) => candidate === role) ?? 'all',
  };
}

function matchesQuery(row: DirectoryRow, query: string): boolean {
  const wanted = searchText(query.trim().replace(/^@/, ''));
  if (wanted === '') return true;
  const fields =
    row.kind === 'user'
      ? [row.user.name, row.user.username, row.user.email]
      : [row.invitation.email];
  return fields.some((field) => searchText(field).includes(wanted));
}

function matchesRole(row: DirectoryRow, role: RoleFilter): boolean {
  if (role === 'all') return true;
  return (row.kind === 'user' ? row.user.role : row.invitation.role) === role;
}

function matchesStatus(status: DirectoryStatus, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'invited') return status === 'invited' || status === 'invite-expired';
  return status === filter;
}
