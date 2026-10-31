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

/** "Descartar o código não salvo?": `onSettle(true)` leaves, anything else stays.
 *
 *  Example: `<TemplateLeaveDialog onSettle={(leave) => resolve(leave)} />` */
export function TemplateLeaveDialog({
  onSettle,
}: Readonly<{ onSettle: (leave: boolean) => void }>) {
  return (
    <AlertDialog open onOpenChange={(open) => !open && onSettle(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Descartar o código não salvo?</AlertDialogTitle>
          <AlertDialogDescription>
            As mudanças deste modelo ainda não foram salvas e somem se você sair agora.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continuar editando</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => onSettle(true)}>
            Descartar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
