import type { AdminDirectoryResponseDto, AdminUserDto } from '@lorkarium/contracts';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  directoryRows,
  filterDirectory,
  filtersOf,
  statusCounts,
  type DirectoryFilters,
  type DirectoryRow,
} from '@/lib/user-directory';
import type { Clipboard } from '@/services/clipboard';
import { adminFailureMessage } from './admin-messages';
import { InviteSheet } from './invite-sheet';
import { InvitationRowMenu, UserRowMenu, type UserRowCommand } from './row-menus';
import { UsersDialog, type OpenDialog } from './users-dialog';
import { UsersTable } from './users-table';
import { UsersToolbar } from './users-toolbar';
import { useOnUsersSettled, usersFailureOf, useUsersFetcher } from './use-users-fetcher';
import type { UsersIntent } from './users-action';

export type UsersPageProps = Readonly<{
  directory: AdminDirectoryResponseDto;
  now: Date;
  selfId: string | null;
  clipboard: Clipboard;
}>;

/** "Usuários": who has access and how they came in. Search and filters live in the URL; commands
 *  with a high consequence confirm in a dialog, the others run from the row's menu.
 *
 *  Example: `<UsersPage directory={directory} now={now} selfId={me.id} clipboard={clipboard} />` */
export function UsersPage({
  directory,
  now,
  selfId,
  clipboard,
}: UsersPageProps): React.JSX.Element {
  const [params, setParams] = useSearchParams();
  // The typed text answers each key at once; the URL follows it (a navigation per key is async).
  const [query, setQuery] = useState(() => filtersOf(params).query);
  const filters = { ...filtersOf(params), query };
  const rows = directoryRows(directory, now);
  const visible = filterDirectory(rows, filters);
  const [inviting, setInviting] = useState(false);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const quick = useQuickCommand(setNotice);
  const setFilters = (next: DirectoryFilters): void => {
    setQuery(next.query);
    setParams(paramsOf(next), { replace: true });
  };
  const ownerOf = (email: string): string | null => ownerLabel(directory, email);
  const openUser = (command: UserRowCommand, user: AdminUserDto): void => {
    if (command === 'revoke-admin')
      quick.run(
        { intent: 'role', userId: user.id, role: 'user' },
        `@${user.username} não é mais admin.`,
      );
    else if (command === 'reactivate')
      quick.run({ intent: 'reactivate', userId: user.id }, `O acesso de @${user.username} voltou.`);
    else setDialog({ kind: command, user });
  };
  const actionsOf = (row: DirectoryRow): React.ReactNode =>
    row.kind === 'user' ? (
      <UserRowMenu user={row.user} onCommand={(command) => openUser(command, row.user)} />
    ) : (
      <InvitationRowMenu
        invitation={row.invitation}
        onCommand={(command) =>
          command === 'resend'
            ? setDialog({
                kind: 'resend',
                invitationId: row.invitation.id,
                email: row.invitation.email,
              })
            : quick.run(
                { intent: 'invitation-cancel', invitationId: row.invitation.id },
                `Convite para ${row.invitation.email} cancelado.`,
              )
        }
      />
    );
  return (
    <div className="flex w-full flex-col gap-6 px-4 py-8 sm:px-8 lg:px-12">
      <title>Lorkarium · Usuários</title>
      <header className="flex flex-wrap items-end gap-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <h1 className="font-display text-[42px] leading-[1.05] font-medium">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Quem tem acesso ao Lorkarium e como entrou.
          </p>
        </div>
        <Button size="xl" onClick={() => setInviting(true)}>
          <PlusIcon aria-hidden="true" />
          Convidar
        </Button>
      </header>
      <UsersToolbar filters={filters} counts={statusCounts(rows, filters)} onChange={setFilters} />
      <p role="status" className="min-h-5 text-sm text-foreground">
        {notice}
      </p>
      {quick.failure && (
        <Alert variant="destructive" className="px-3.5 py-3 text-sm">
          {adminFailureMessage(quick.failure)}
        </Alert>
      )}
      <UsersListing
        rows={rows}
        visible={visible}
        now={now}
        selfId={selfId}
        actionsOf={actionsOf}
        onInvite={() => setInviting(true)}
        onClearFilters={() => setFilters({ query: '', status: 'all', role: 'all' })}
      />
      {inviting && (
        <InviteSheet
          ownerOf={ownerOf}
          clipboard={clipboard}
          onResend={(invitationId) => {
            setInviting(false);
            setDialog({
              kind: 'resend',
              invitationId,
              email: emailOfInvitation(directory, invitationId),
            });
          }}
          onClose={() => setInviting(false)}
        />
      )}
      {dialog && (
        <UsersDialog
          dialog={dialog}
          clipboard={clipboard}
          onDone={(message) => {
            setNotice(message);
            setDialog(null);
          }}
          onSwitch={setDialog}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

type UsersListingProps = Readonly<{
  rows: readonly DirectoryRow[];
  visible: readonly DirectoryRow[];
  now: Date;
  selfId: string | null;
  actionsOf: (row: DirectoryRow) => React.ReactNode;
  onInvite: () => void;
  onClearFilters: () => void;
}>;

function UsersListing(props: UsersListingProps): React.JSX.Element {
  const onlySelf = props.rows.length === 1 && props.rows[0]?.id === props.selfId;
  if (onlySelf) {
    return (
      <EmptyState
        text="Só você por aqui. Convide alguém para começar."
        action="Convidar"
        onAction={props.onInvite}
      />
    );
  }
  if (props.visible.length === 0) {
    return (
      <EmptyState
        text="Ninguém com esse filtro."
        action="Limpar filtros"
        onAction={props.onClearFilters}
      />
    );
  }
  return (
    <>
      <UsersTable
        rows={props.visible}
        now={props.now}
        selfId={props.selfId}
        actionsOf={props.actionsOf}
      />
      <p className="text-sm text-muted-foreground">
        {footerOf(props.visible.length, props.rows.length)}
      </p>
    </>
  );
}

function EmptyState({
  text,
  action,
  onAction,
}: Readonly<{ text: string; action: string; onAction: () => void }>): React.JSX.Element {
  return (
    <div className="flex flex-col items-start gap-3 border-t border-divider py-10">
      <p className="text-muted-foreground">{text}</p>
      <Button variant="outline" size="lg" onClick={onAction}>
        {action}
      </Button>
    </div>
  );
}

type QuickCommand = Readonly<{
  run: (intent: UsersIntent, notice: string) => void;
  failure: ReturnType<typeof usersFailureOf>;
}>;

// The commands without a dialog (their consequence is low): the notice once the list shows them.
function useQuickCommand(setNotice: (notice: string | null) => void): QuickCommand {
  const fetcher = useUsersFetcher();
  const [pending, setPending] = useState<string | null>(null);
  useOnUsersSettled(fetcher.settled, (result) => {
    if (!('failure' in result)) setNotice(pending);
  });
  const run = (intent: UsersIntent, notice: string): void => {
    setPending(notice);
    setNotice(null);
    fetcher.send(intent);
  };
  return { run, failure: usersFailureOf(fetcher.settled) };
}

function paramsOf(filters: DirectoryFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query) params.set('q', filters.query);
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.role !== 'all') params.set('role', filters.role);
  return params;
}

function footerOf(visible: number, total: number): string {
  const noun = total === 1 ? 'usuário' : 'usuários';
  return visible === total ? `${total} ${noun}` : `${visible} de ${total} ${noun}`;
}

function ownerLabel(directory: AdminDirectoryResponseDto, email: string): string | null {
  const user = directory.users.find((candidate) => candidate.email === email);
  if (!user) return null;
  return user.status === 'suspended' ? `@${user.username} (suspenso)` : `@${user.username}`;
}

function emailOfInvitation(directory: AdminDirectoryResponseDto, invitationId: string): string {
  return (
    directory.invitations.find((invitation) => invitation.id === invitationId)?.email ??
    'esse e-mail'
  );
}
