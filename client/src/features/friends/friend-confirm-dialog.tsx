import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { FriendConfirmation } from './friend-confirmations';

export type FriendConfirmDialogProps = Readonly<{
  /** `null` closes the dialog. */
  confirmation: FriendConfirmation | null;
  onClose: () => void;
}>;

/** The confirmation of removing, blocking and "Recusar e bloquear" (`role="alertdialog"`).
 *
 *  Example: `<FriendConfirmDialog confirmation={{ title: 'Remover Bia?', description, action: 'Remover', run }} onClose={close} />` */
export function FriendConfirmDialog({
  confirmation,
  onClose,
}: FriendConfirmDialogProps): React.JSX.Element {
  return (
    <AlertDialog open={confirmation !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirmation?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="lg">Cancelar</AlertDialogCancel>
          <AlertDialogAction size="lg" variant="destructive" onClick={() => confirmation?.run()}>
            {confirmation?.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
