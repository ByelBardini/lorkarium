import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/** What the panel asks before acting: throw a draft away (`discard` runs on yes) or delete. */
export type DocumentPanelConfirmation =
  Readonly<{ kind: 'reload'; discard: () => Promise<void> }> | Readonly<{ kind: 'delete' }>;
type DocumentPanelDialogProps = Readonly<{
  /** Closing with a draft that could not be saved. */
  leaving: boolean;
  confirmation: DocumentPanelConfirmation | null;
  onCancel: () => void;
  onConfirm: () => void;
}>;

/** The panel's one question at a time: leave with a draft, discard it, or delete the document.
 *
 *  Example: `<DocumentPanelDialog leaving={false} confirmation={{ kind: 'delete' }} onCancel={…} onConfirm={…} />` */
export function DocumentPanelDialog(props: DocumentPanelDialogProps): React.JSX.Element {
  const deleting = !props.leaving && props.confirmation?.kind === 'delete';
  const title = props.leaving
    ? 'Alterações ainda não salvas'
    : deleting
      ? 'Excluir documento?'
      : 'Descartar meu rascunho?';
  return (
    <AlertDialog open onOpenChange={(open) => !open && props.onCancel()}>
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>
          {deleting
            ? 'O documento será excluído da mesa.'
            : 'Continue editando para conservar o rascunho ou descarte as alterações locais.'}
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>{deleting ? 'Cancelar' : 'Continuar editando'}</AlertDialogCancel>
          <AlertDialogAction onClick={props.onConfirm}>
            {deleting ? 'Excluir' : 'Descartar alterações'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
