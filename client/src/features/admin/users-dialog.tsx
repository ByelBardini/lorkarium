import type { AdminUserDto } from '@lorkarium/contracts';
import type { BadgesAdminApi } from '@/services/badges-admin-api';
import type { Clipboard } from '@/services/clipboard';
import type { SanctionsApi } from '@/services/sanctions-api';
import { ConfirmCommandDialog } from './confirm-command-dialog';
import { DeleteUserDialog, type DeleteUserDialogProps } from './delete-user-dialog';
import { LinkResultDialog } from './link-result-dialog';
import { SanctionDialog, type BanMeasure, type SanctionDraft } from './sanction-dialog';
import { SanctionsHistoryDialog } from './sanctions-history-dialog';
import { UserBadgesDialog } from './user-badges-dialog';
import { UserBillingDialog, type UserBillingDialogProps } from './user-billing-dialog';

/** The one dialog of the users page open at a time. A deletion with `measure` is a ban; a measure
 *  with `draft` starts filled (a blocked ban turned into a suspension, a report of the queue). */
export type OpenDialog =
  | AccountDialogState
  | MeasureDialogState
  | Readonly<{ kind: 'resend'; invitationId: string; email: string }>;

type AccountDialogState = Readonly<{
  kind: 'grant-admin' | 'password-link' | 'badges' | 'billing';
  user: AdminUserDto;
}>;

type MeasureDialogState =
  | Readonly<{ kind: 'sanctions'; user: AdminUserDto }>
  | Readonly<{ kind: 'sanction'; user: AdminUserDto; draft?: SanctionDraft }>
  | Readonly<{ kind: 'delete'; user: AdminUserDto; measure?: BanMeasure }>;

export type UsersDialogProps = Readonly<{
  dialog: OpenDialog;
  clipboard: Clipboard;
  /** The catalog and the grants of "Insígnias…". */
  badgesApi: BadgesAdminApi;
  /** The billing of an account, its refunds ("Cobrança…") and the cancel before a deletion. */
  billingApi: UserBillingDialogProps['api'] & DeleteUserDialogProps['billingApi'];
  /** The history of an account's measures ("Medidas…"). */
  sanctionsApi: Pick<SanctionsApi, 'history'>;
  /** The admin's own 2FA is on: the refund and the cancel before a deletion need it. */
  twoFactorOn: boolean;
  /** The command went through: the page writes `message` in its notice and closes the dialog. */
  onDone: (message: string) => void;
  /** Another dialog takes its place ("Suspender em vez disso", "Continuar para a exclusão"). */
  onSwitch: (dialog: OpenDialog) => void;
  onClose: () => void;
}>;

/** Picks the dialog of the command: the confirmations, the measures, the deletion, the issued
 *  links and the badges of the account.
 *
 *  Example: `<UsersDialog dialog={{ kind: 'sanction', user }} clipboard={clipboard} onDone={…} onSwitch={…} onClose={…} />` */
export function UsersDialog(props: UsersDialogProps): React.JSX.Element {
  const { dialog, onClose } = props;
  if (dialog.kind === 'resend') {
    return (
      <LinkResultDialog
        title="Convite reenviado"
        description={`Um link novo foi para ${dialog.email}; o anterior não vale mais.`}
        intent={{ intent: 'invitation-resend', invitationId: dialog.invitationId }}
        fieldLabel="Link do convite"
        note="O link vale 7 dias e só funciona uma vez."
        clipboard={props.clipboard}
        onClose={onClose}
      />
    );
  }
  if (isMeasureDialog(dialog)) return <MeasureDialog {...props} dialog={dialog} />;
  return <AccountDialog {...props} dialog={dialog} />;
}

function isMeasureDialog(
  dialog: AccountDialogState | MeasureDialogState,
): dialog is MeasureDialogState {
  return dialog.kind === 'sanction' || dialog.kind === 'delete' || dialog.kind === 'sanctions';
}

function AccountDialog({
  dialog,
  clipboard,
  badgesApi,
  billingApi,
  twoFactorOn,
  onDone,
  onClose,
}: UsersDialogProps & { dialog: AccountDialogState }): React.JSX.Element {
  const { user } = dialog;
  const handle = `@${user.username}`;
  if (dialog.kind === 'billing')
    return (
      <UserBillingDialog user={user} api={billingApi} twoFactorOn={twoFactorOn} onClose={onClose} />
    );
  if (dialog.kind === 'badges')
    return <UserBadgesDialog user={user} api={badgesApi} onDone={onDone} onClose={onClose} />;
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

type MeasureDialogProps = UsersDialogProps & { dialog: MeasureDialogState };

function MeasureDialog({
  dialog,
  billingApi,
  sanctionsApi,
  twoFactorOn,
  onDone,
  onSwitch,
  onClose,
}: MeasureDialogProps): React.JSX.Element {
  const { user } = dialog;
  if (dialog.kind === 'sanctions')
    return <SanctionsHistoryDialog user={user} api={sanctionsApi} onClose={onClose} />;
  if (dialog.kind === 'sanction') {
    return (
      <SanctionDialog
        user={user}
        draft={dialog.draft}
        onDone={onDone}
        onBan={(measure) => onSwitch({ kind: 'delete', user, measure })}
        onClose={onClose}
      />
    );
  }
  const { measure } = dialog;
  return (
    <DeleteUserDialog
      user={user}
      measure={measure}
      billingApi={billingApi}
      twoFactorOn={twoFactorOn}
      onDeleted={() => onDone(`A conta @${user.username} foi excluída.`)}
      onSuspendInstead={() =>
        onSwitch({ kind: 'sanction', user, draft: { ...measure, kind: 'suspension' } })
      }
      onClose={onClose}
    />
  );
}
