import { MailIcon } from 'lucide-react';
import { UserAvatar } from '@/components/user-avatar';
import { lastAccessLabel, type DirectoryRow } from '@/lib/user-directory';
import { ROLE_LABEL } from './admin-messages';
import { UserStatusLabel } from './user-status-label';

export type UsersTableProps = Readonly<{
  rows: readonly DirectoryRow[];
  now: Date;
  selfId: string | null;
  /** The menu at the end of a row (none on the admin's own row). */
  actionsOf: (row: DirectoryRow) => React.ReactNode;
}>;

const HEAD =
  'px-3.5 py-2.5 text-left text-[11px] font-semibold tracking-[0.12em] whitespace-nowrap text-placeholder uppercase';
const CELL = 'px-3.5 py-3 align-middle text-sm whitespace-nowrap text-label';

/** Accounts and invitations in one straight table, separated by a rule; scrolls sideways on a
 *  narrow screen.
 *
 *  Example: `<UsersTable rows={rows} now={now} selfId={me.id} actionsOf={(row) => <RowMenu row={row} />} />` */
export function UsersTable({ rows, now, selfId, actionsOf }: UsersTableProps): React.JSX.Element {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse">
        <caption className="sr-only">Usuários</caption>
        <thead>
          <tr>
            {['Usuário', 'E-mail', 'Papel', 'Status', 'Mesas', 'Último acesso'].map((title) => (
              <th key={title} scope="col" className={HEAD}>
                {title}
              </th>
            ))}
            <th scope="col" className={HEAD}>
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-divider">
              {row.kind === 'user' ? (
                <UserCells row={row} selfId={selfId} />
              ) : (
                <InvitationCells row={row} />
              )}
              <td className={CELL}>{lastAccessLabel(row, now)}</td>
              <td className={`${CELL} text-right`}>{row.id === selfId ? null : actionsOf(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserCells({
  row,
  selfId,
}: Readonly<{
  row: Extract<DirectoryRow, { kind: 'user' }>;
  selfId: string | null;
}>): React.JSX.Element {
  const { user } = row;
  return (
    <>
      <td className={CELL}>
        <div className="flex items-center gap-3">
          <UserAvatar name={user.name} color={user.color} avatarId={user.avatarId} size="md" />
          <div className="flex flex-col">
            <span className="font-semibold text-foreground">
              {user.name}
              {user.id === selfId && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">você</span>
              )}
            </span>
            <span className="text-xs text-muted-foreground">@{user.username}</span>
          </div>
        </div>
      </td>
      <td className={CELL}>{user.email}</td>
      <td className={CELL}>
        <RoleLabel role={user.role} />
      </td>
      <td className={CELL}>
        <UserStatusLabel status={row.status} />
      </td>
      <td className={`${CELL} tabular-nums`}>{user.campaignCount}</td>
    </>
  );
}

function InvitationCells({
  row,
}: Readonly<{ row: Extract<DirectoryRow, { kind: 'invitation' }> }>): React.JSX.Element {
  return (
    <>
      <td className={CELL}>
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-full bg-muted"
          >
            <MailIcon className="size-4 text-muted-foreground" />
          </span>
          <span className="text-muted-foreground">Convite pendente</span>
        </div>
      </td>
      <td className={CELL}>{row.invitation.email}</td>
      <td className={CELL}>
        <RoleLabel role={row.invitation.role} />
      </td>
      <td className={CELL}>
        <UserStatusLabel status={row.status} />
      </td>
      <td className={CELL}>—</td>
    </>
  );
}

function RoleLabel({ role }: Readonly<{ role: 'admin' | 'user' }>): React.JSX.Element {
  const tone = role === 'admin' ? 'text-primary' : 'text-muted-foreground';
  return (
    <span className={`text-[11px] font-semibold tracking-[0.12em] uppercase ${tone}`}>
      {ROLE_LABEL[role]}
    </span>
  );
}
