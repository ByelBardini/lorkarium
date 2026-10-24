import {
  TOKEN_GROUP_MAX,
  type DrawingDto,
  type EffectAreaDto,
  type TokenDto,
  type WallDto,
} from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
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
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import { DELETE_CANNOT_UNDO, TOO_MANY_TO_DELETE, deleteSelectionQuestion } from './board-messages';

/** What the master's Delete takes away when the selection has tokens. */
export type SelectionToDelete = Readonly<{
  tokens: readonly TokenDto[];
  drawings: readonly DrawingDto[];
  effectAreas: readonly EffectAreaDto[];
  walls: readonly WallDto[];
}>;

export type DeleteSelectionDialogProps = Readonly<{
  selection: SelectionToDelete;
  interaction: StoreApi<BoardInteractionStore>;
  onClose: () => void;
}>;

/** "Excluir 2 tokens e 1 desenho?": the confirmation of the master's Delete with tokens in the
 *  selection. "Excluir" takes everything; the tokens go without precondition and never onto the
 *  undo stack (the dialog is the protection); the other pieces go as a plain Delete does.
 *
 *  Example: `{deletion && <DeleteSelectionDialog selection={deletion} interaction={interaction} onClose={close} />}` */
export function DeleteSelectionDialog(props: DeleteSelectionDialogProps): React.JSX.Element {
  const { selection, interaction, onClose } = props;
  const tooMany = selection.tokens.length > TOKEN_GROUP_MAX;
  const question = deleteSelectionQuestion({
    tokenNames: selection.tokens.map(({ name }) => name),
    drawings: selection.drawings.length,
    areas: selection.effectAreas.length,
    walls: selection.walls.length,
  });
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{question}</AlertDialogTitle>
          <AlertDialogDescription>
            {tooMany ? TOO_MANY_TO_DELETE : DELETE_CANNOT_UNDO}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={tooMany}
            onClick={() => deleteSelection(interaction, selection)}
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function deleteSelection(
  interaction: StoreApi<BoardInteractionStore>,
  selection: SelectionToDelete,
): void {
  const local = interaction.getState();
  const tokenIds = selection.tokens.map(({ id }) => id);
  void local.command((commands, scope) => commands.deleteTokens(scope, tokenIds));
  if (selection.drawings.length > 0) void local.deleteDrawings(selection.drawings);
  if (selection.effectAreas.length > 0) void local.deleteEffectAreas(selection.effectAreas);
  if (selection.walls.length > 0) void local.deleteWalls(selection.walls);
}
