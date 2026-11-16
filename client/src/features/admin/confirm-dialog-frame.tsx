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

export type ConfirmDialogFrameProps = Readonly<{
  title: string;
  /** The consequence in full words: never "Tem certeza?". */
  consequence: string;
  confirmLabel: string;
  busyLabel: string;
  danger?: boolean;
  busy: boolean;
  /** The refusal of the last try, shown without closing; `null` for none. */
  failureMessage: string | null;
  onConfirm: () => void;
  onClose: () => void;
}>;

/** The look of a backoffice confirmation: an `AlertDialog` with the consequence, a specific
 *  label, open while the command runs (Esc and "Cancelar" wait for it).
 *
 *  Example: `<ConfirmDialogFrame title="Excluir 'Veterano'?" consequence="…" confirmLabel="Excluir" busyLabel="Excluindo…" busy={false} failureMessage={null} onConfirm={…} onClose={…} />` */
export function ConfirmDialogFrame(props: ConfirmDialogFrameProps): React.JSX.Element {
  const { busy } = props;
  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && props.onClose()}>
      <AlertDialogContent aria-busy={busy}>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.consequence}</AlertDialogDescription>
        </AlertDialogHeader>
        {props.failureMessage && (
          <Alert variant="destructive" className="px-3.5 py-3 text-sm">
            {props.failureMessage}
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <Button
            variant={props.danger ? 'destructive' : 'default'}
            size="lg"
            disabled={busy}
            onClick={props.onConfirm}
          >
            {busy && <Loader2Icon aria-hidden="true" className="animate-spin" />}
            {busy ? props.busyLabel : props.confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
