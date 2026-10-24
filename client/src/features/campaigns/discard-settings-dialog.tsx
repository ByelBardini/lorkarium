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

/** Holds leaving the settings page ("Voltar à mesa", the rail, "back") while it has edits, and
 *  asks "Descartar alterações?". A deletion's redirect is not held (the router does not block it).
 *
 *  Example: `<DiscardSettingsDialog dirty={draft.dirty} />` */
export function DiscardSettingsDialog({ dirty }: Readonly<{ dirty: boolean }>): React.JSX.Element {
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
          <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
          <AlertDialogDescription>
            O que você mudou nas configurações da mesa ainda não foi salvo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="lg">Continuar editando</AlertDialogCancel>
          {/* Not an AlertDialogAction: closing would also reset the blocker it just let go. */}
          <Button size="lg" variant="destructive" onClick={() => blocker.proceed?.()}>
            Descartar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
