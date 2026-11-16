import { adminFailureMessage } from './admin-messages';
import { ConfirmDialogFrame } from './confirm-dialog-frame';
import type { UsersIntent } from './users-action';
import { useOnUsersSettled, usersFailureOf, useUsersFetcher } from './use-users-fetcher';

export type ConfirmCommandDialogProps = Readonly<{
  title: string;
  /** The consequence in full words: never "Tem certeza?". */
  consequence: string;
  confirmLabel: string;
  busyLabel: string;
  danger?: boolean;
  intent: UsersIntent;
  /** After the list shows the change; the dialog closes. */
  onDone: () => void;
  onClose: () => void;
}>;

/** A command with a high consequence, confirmed in an `AlertDialog` with a specific label; the
 *  dialog stays open while it runs and shows a refusal without closing.
 *
 *  Example: `<ConfirmCommandDialog title="Dar acesso de admin a @bia?" consequence="…" confirmLabel="Tornar admin" busyLabel="Salvando…" intent={…} onDone={…} onClose={…} />` */
export function ConfirmCommandDialog(props: ConfirmCommandDialogProps): React.JSX.Element {
  const fetcher = useUsersFetcher();
  const failure = usersFailureOf(fetcher.settled);
  useOnUsersSettled(fetcher.settled, (result) => {
    if (!('failure' in result)) props.onDone();
  });
  return (
    <ConfirmDialogFrame
      title={props.title}
      consequence={props.consequence}
      confirmLabel={props.confirmLabel}
      busyLabel={props.busyLabel}
      danger={props.danger}
      busy={fetcher.busy}
      failureMessage={failure && adminFailureMessage(failure)}
      onConfirm={() => fetcher.send(props.intent)}
      onClose={props.onClose}
    />
  );
}
