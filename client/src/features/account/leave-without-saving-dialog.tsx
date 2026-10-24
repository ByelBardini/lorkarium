import { useBlocker } from 'react-router';
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

/** Holds a navigation to another page while the profile has edits, and asks "Sair sem salvar?".
 *  A change only of the query or hash (the same page) goes through.
 *
 *  Example: `<LeaveWithoutSavingDialog dirty={draft.dirty} />` */
export function LeaveWithoutSavingDialog({
  dirty,
}: Readonly<{ dirty: boolean }>): React.JSX.Element {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  // "Continuar editando" and Esc close the dialog, which puts the navigation back.
  return (
    <AlertDialog
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => !open && blocker.reset?.()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sair sem salvar?</AlertDialogTitle>
          <AlertDialogDescription>
            O apelido, a cor ou o texto que você mudou ainda não foram salvos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="lg">Continuar editando</AlertDialogCancel>
          {/* Not an AlertDialogAction: closing would also reset the blocker it just let go. */}
          <Button size="lg" variant="destructive" onClick={() => blocker.proceed?.()}>
            Descartar e sair
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
