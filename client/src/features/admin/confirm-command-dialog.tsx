import { Loader2Icon } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { adminFailureMessage } from './admin-messages';
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
    <AlertDialog open onOpenChange={(open) => !open && !fetcher.busy && props.onClose()}>
      <AlertDialogContent aria-busy={fetcher.busy}>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.consequence}</AlertDialogDescription>
        </AlertDialogHeader>
        {failure && (
          <Alert variant="destructive" className="px-3.5 py-3 text-sm">
            {adminFailureMessage(failure)}
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={fetcher.busy}>Cancelar</AlertDialogCancel>
          <Button
            variant={props.danger ? 'destructive' : 'default'}
            size="lg"
            disabled={fetcher.busy}
            onClick={() => fetcher.send(props.intent)}
          >
            {fetcher.busy && <Loader2Icon aria-hidden="true" className="animate-spin" />}
            {fetcher.busy ? props.busyLabel : props.confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
