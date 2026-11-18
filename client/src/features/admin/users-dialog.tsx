import type { AdminUserDto } from '@lorkarium/contracts';
import type { BadgesAdminApi } from '@/services/badges-admin-api';
import type { Clipboard } from '@/services/clipboard';
import { ConfirmCommandDialog } from './confirm-command-dialog';
import { DeleteUserDialog } from './delete-user-dialog';
import { LinkResultDialog } from './link-result-dialog';
import { UserBadgesDialog } from './user-badges-dialog';
import { UserBillingDialog, type UserBillingDialogProps } from './user-billing-dialog';

/** The one dialog of the users page open at a time. */
export type OpenDialog =
  | Readonly<{
      kind: 'grant-admin' | 'suspend' | 'delete' | 'password-link' | 'badges' | 'billing';
      user: AdminUserDto;
    }>
  | Readonly<{ kind: 'resend'; invitationId: string; email: string }>;

export type UsersDialogProps = Readonly<{
  dialog: OpenDialog;
  clipboard: Clipboard;
  /** The catalog and the grants of "Insígnias…". */
  badgesApi: BadgesAdminApi;
  /** The billing of an account and its refunds ("Cobrança…"). */
  billingApi: UserBillingDialogProps['api'];
  /** The admin's own 2FA is on: the refund needs it. */
  twoFactorOn: boolean;
  /** The command went through: the page writes `message` in its notice and closes the dialog. */
  onDone: (message: string) => void;
  /** Another dialog takes its place ("Suspender em vez disso"). */
  onSwitch: (dialog: OpenDialog) => void;
  onClose: () => void;
}>;

/** Picks the dialog of the command: the confirmations, the deletion, the issued links and the
 *  badges of the account.
 *
 *  Example: `<UsersDialog dialog={{ kind: 'suspend', user }} clipboard={clipboard} onDone={…} onSwitch={…} onClose={…} />` */
export function UsersDialog({
  dialog,
  clipboard,
  badgesApi,
  billingApi,
  twoFactorOn,
  onDone,
  onSwitch,
  onClose,
}: UsersDialogProps): React.JSX.Element {
  if (dialog.kind === 'billing') {
    return (
      <UserBillingDialog
        user={dialog.user}
        api={billingApi}
        twoFactorOn={twoFactorOn}
        onClose={onClose}
      />
    );
  }
  if (dialog.kind === 'badges') {
    return (
      <UserBadgesDialog user={dialog.user} api={badgesApi} onDone={onDone} onClose={onClose} />
    );
  }
  if (dialog.kind === 'resend') {
    return (
      <LinkResultDialog
        title="Convite reenviado"
        description={`Um link novo foi para ${dialog.email}; o anterior não vale mais.`}
        intent={{ intent: 'invitation-resend', invitationId: dialog.invitationId }}
        fieldLabel="Link do convite"
        note="O link vale 7 dias e só funciona uma vez."
        clipboard={clipboard}
        onClose={onClose}
      />
    );
  }
  const { user } = dialog;
  const handle = `@${user.username}`;
  if (dialog.kind === 'password-link') {
    return (
      <LinkResultDialog
        title={`Link de nova senha para ${handle}`}
        description="Mandamos o link para o e-mail da pessoa; a senha atual vale até ela trocar."
        intent={{ intent: 'password-reset', userId: user.id }}
        fieldLabel="Link de nova senha"
        note="Vale 1 hora."
        clipboard={clipboard}
        onClose={onClose}
      />
    );
  }
  if (dialog.kind === 'delete') {
    return (
      <DeleteUserDialog
        user={user}
        onDeleted={() => onDone(`A conta ${handle} foi excluída.`)}
        onSuspendInstead={() => onSwitch({ kind: 'suspend', user })}
        onClose={onClose}
      />
    );
  }
  if (dialog.kind === 'grant-admin') {
    return (
      <ConfirmCommandDialog
        title={`Dar acesso de admin a ${handle}?`}
        consequence="A pessoa poderá convidar, suspender e excluir contas."
        confirmLabel="Tornar admin"
        busyLabel="Salvando…"
        intent={{ intent: 'role', userId: user.id, role: 'admin' }}
        onDone={() => onDone(`${handle} agora é admin.`)}
        onClose={onClose}
      />
    );
  }
  return (
    <ConfirmCommandDialog
      title={`Suspender o acesso de ${handle}?`}
      consequence={`${handle} sai de todas as sessões agora e não consegue entrar até o acesso voltar.`}
      confirmLabel="Suspender"
      busyLabel="Suspendendo…"
      danger
      intent={{ intent: 'suspend', userId: user.id }}
      onDone={() => onDone(`O acesso de ${handle} foi suspenso.`)}
      onClose={onClose}
    />
  );
}
