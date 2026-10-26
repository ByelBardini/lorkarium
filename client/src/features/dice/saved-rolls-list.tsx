import type { SavedRollDto } from '@lorkarium/contracts';
import { XIcon } from 'lucide-react';
import { useState } from 'react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { savedRollFailureMessage } from './dice-messages';
import type { SavedRollsView } from './use-saved-rolls';

export type SavedRollsListProps = Readonly<{
  saved: SavedRollsView;
  /** Rolls the saved roll alone, labeled by its name. */
  onRoll: (roll: SavedRollDto) => void;
  rollDisabled: boolean;
}>;

/** The viewer's saved rolls at this table as tags: a click rolls one (name + formula, the
 *  whole formula in the tooltip) and its "×" asks before deleting.
 *
 *  Example: `<SavedRollsList saved={saved} onRoll={rollSaved} rollDisabled={false} />` */
export function SavedRollsList(props: SavedRollsListProps): React.JSX.Element {
  const { saved } = props;
  const [doomed, setDoomed] = useState<SavedRollDto | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const remove = async (roll: SavedRollDto) => {
    setDoomed(null);
    const result = await saved.remove(roll.id);
    setProblem(result.ok ? null : savedRollFailureMessage(result.failure));
  };
  return (
    <section aria-labelledby="saved-rolls-title" className="flex flex-col gap-2.5">
      <h3
        id="saved-rolls-title"
        className="text-xs tracking-[0.12em] text-muted-foreground uppercase"
      >
        Rolagens salvas
      </h3>
      <SavedRollsBody {...props} onDelete={setDoomed} />
      {problem !== null && <p className="text-xs text-destructive-text">{problem}</p>}
      <DeleteSavedRollDialog roll={doomed} onCancel={() => setDoomed(null)} onConfirm={remove} />
    </section>
  );
}

type BodyProps = SavedRollsListProps & Readonly<{ onDelete: (roll: SavedRollDto) => void }>;

function SavedRollsBody({ saved, ...actions }: BodyProps): React.JSX.Element {
  if (saved.loadFailure !== null) {
    return (
      <p className="text-sm text-destructive-text">{savedRollFailureMessage(saved.loadFailure)}</p>
    );
  }
  if (saved.rolls === null) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (saved.rolls.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma rolagem salva. Monte uma e toque no marcador ao lado de Rolar.
      </p>
    );
  }
  return (
    <TooltipProvider>
      <ul aria-label="Rolagens salvas" className="flex flex-wrap gap-1.5">
        {saved.rolls.map((roll) => (
          <SavedRollTag key={roll.id} roll={roll} {...actions} />
        ))}
      </ul>
    </TooltipProvider>
  );
}

type TagProps = Omit<BodyProps, 'saved'> & Readonly<{ roll: SavedRollDto }>;

function SavedRollTag({ roll, onRoll, onDelete, rollDisabled }: TagProps): React.JSX.Element {
  const formula = roll.parts.map((part) => part.expression).join(' + ');
  return (
    <li className="flex max-w-full items-center rounded-sm border border-input bg-card transition-colors hover:border-primary motion-reduce:transition-none">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Rolar ${roll.name}`}
            disabled={rollDisabled}
            onClick={() => onRoll(roll)}
            className="flex min-w-0 items-center gap-1.5 rounded-sm py-1.5 pr-1 pl-2.5 text-sm font-medium text-foreground outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
          >
            <span className="truncate">{roll.name}</span>
            <span className="truncate font-mono text-xs font-normal text-muted-foreground">
              {formula}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent>{formula}</TooltipContent>
      </Tooltip>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Apagar ${roll.name}`}
        onClick={() => onDelete(roll)}
        className="mr-0.5 text-muted-foreground hover:text-destructive-text"
      >
        <XIcon aria-hidden="true" />
      </Button>
    </li>
  );
}

type DeleteDialogProps = Readonly<{
  roll: SavedRollDto | null;
  onCancel: () => void;
  onConfirm: (roll: SavedRollDto) => void;
}>;

function DeleteSavedRollDialog({
  roll,
  onCancel,
  onConfirm,
}: DeleteDialogProps): React.JSX.Element {
  return (
    <AlertDialog open={roll !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Apagar “{roll?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            A rolagem salva some da sua lista nesta mesa. O histórico não muda.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="lg">Cancelar</AlertDialogCancel>
          <Button size="lg" variant="destructive" onClick={() => roll && onConfirm(roll)}>
            Apagar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
