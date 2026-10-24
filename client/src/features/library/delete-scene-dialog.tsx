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

export type DeleteConfirmDialogProps = Readonly<{
  title: string;
  description: string;
  onConfirm: () => void;
  onClose: () => void;
}>;

/** "Excluir Ossuário?": the server has no trash, so a grid (or a folder) goes only by the
 *  button of this confirmation.
 *
 *  Example: `<DeleteConfirmDialog title="Excluir Ossuário?" description={…} onConfirm={remove} onClose={close} />` */
export function DeleteConfirmDialog(props: DeleteConfirmDialogProps): React.JSX.Element {
  return (
    <AlertDialog open onOpenChange={(open) => !open && props.onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={props.onConfirm}>
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
