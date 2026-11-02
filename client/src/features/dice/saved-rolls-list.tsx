import type { SavedRollDto, SavedRollFolderDto } from '@lorkarium/contracts';
import { FolderInputIcon, FolderPlusIcon, XIcon } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { savedRollFailureMessage, savedRollProblemOf } from './dice-messages';
import { DeleteFolderDialog, FolderNameForm, SavedRollFolderRow } from './saved-roll-folders';
import type { SavedRollsView } from './use-saved-rolls';

export type SavedRollsListProps = Readonly<{
  saved: SavedRollsView;
  /** Rolls the saved roll alone, labeled by its name. */
  onRoll: (roll: SavedRollDto) => void;
  rollDisabled: boolean;
}>;

/** The viewer's saved rolls at this table: the folders first, closed until clicked, then the rolls
 *  out of any folder. Each roll is a tag: a click rolls it (name + formula, the whole formula in
 *  the tooltip), its folder icon moves it and its "×" asks before deleting.
 *
 *  Example: `<SavedRollsList saved={saved} onRoll={rollSaved} rollDisabled={false} />` */
export function SavedRollsList(props: SavedRollsListProps): React.JSX.Element {
  const { saved } = props;
  const [doomed, setDoomed] = useState<SavedRollDto | null>(null);
  const [doomedFolder, setDoomedFolder] = useState<SavedRollFolderDto | null>(null);
  const [naming, setNaming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const remove = async (roll: SavedRollDto) => {
    setDoomed(null);
    setProblem(savedRollProblemOf(await saved.remove(roll.id)));
  };
  const removeFolder = async (folder: SavedRollFolderDto) => {
    setDoomedFolder(null);
    setProblem(savedRollProblemOf(await saved.removeFolder(folder.id)));
  };
  const onMove = async (roll: SavedRollDto, folderId: string | null) => {
    setProblem(savedRollProblemOf(await saved.move(roll.id, folderId)));
  };
  return (
    <section aria-labelledby="saved-rolls-title" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3
          id="saved-rolls-title"
          className="text-xs tracking-[0.12em] text-muted-foreground uppercase"
        >
          Rolagens salvas
        </h3>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Nova pasta"
          onClick={() => setNaming(true)}
          className="text-muted-foreground"
        >
          <FolderPlusIcon aria-hidden="true" />
        </Button>
      </div>
      {naming && (
        <FolderNameForm
          initialName=""
          submitLabel="Criar"
          onSubmit={saved.createFolder}
          onDone={() => setNaming(false)}
        />
      )}
      <SavedRollsBody
        {...props}
        onDelete={setDoomed}
        onDeleteFolder={setDoomedFolder}
        onMove={(roll, folderId) => void onMove(roll, folderId)}
      />
      {problem !== null && <p className="text-xs text-destructive-text">{problem}</p>}
      <DeleteSavedRollDialog roll={doomed} onCancel={() => setDoomed(null)} onConfirm={remove} />
      <DeleteFolderDialog
        folder={doomedFolder}
        onCancel={() => setDoomedFolder(null)}
        onConfirm={removeFolder}
      />
    </section>
  );
}

type BodyProps = SavedRollsListProps &
  Readonly<{
    onDelete: (roll: SavedRollDto) => void;
    onDeleteFolder: (folder: SavedRollFolderDto) => void;
    onMove: (roll: SavedRollDto, folderId: string | null) => void;
  }>;

function SavedRollsBody({ saved, onDeleteFolder, ...actions }: BodyProps): React.JSX.Element {
  if (saved.loadFailure !== null) {
    return (
      <p className="text-sm text-destructive-text">{savedRollFailureMessage(saved.loadFailure)}</p>
    );
  }
  if (saved.rolls === null) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const { folders } = saved;
  if (saved.rolls.length === 0 && folders.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma rolagem salva. Monte uma e toque no marcador ao lado de Rolar.
      </p>
    );
  }
  const shelves = shelvesOf(saved.rolls, folders);
  const tagProps = { ...actions, folders };
  return (
    <TooltipProvider>
      {folders.length > 0 && (
        <ul aria-label="Pastas de rolagens" className="flex flex-col gap-1">
          {folders.map((folder) => {
            const rolls = shelves.get(folder.id) ?? [];
            return (
              <SavedRollFolderRow
                key={folder.id}
                folder={folder}
                rollCount={rolls.length}
                onRename={(name) => saved.renameFolder(folder.id, name)}
                onDelete={() => onDeleteFolder(folder)}
              >
                <SavedRollTags label={`Rolagens em ${folder.name}`} rolls={rolls} {...tagProps} />
              </SavedRollFolderRow>
            );
          })}
        </ul>
      )}
      <SavedRollTags label="Rolagens salvas" rolls={shelves.get(null) ?? []} {...tagProps} />
    </TooltipProvider>
  );
}

// A roll whose folder is not listed (the folders still on their way) stays visible, out of any.
function shelvesOf(
  rolls: readonly SavedRollDto[],
  folders: readonly SavedRollFolderDto[],
): ReadonlyMap<string | null, readonly SavedRollDto[]> {
  const known = new Set(folders.map(({ id }) => id));
  const shelves = new Map<string | null, SavedRollDto[]>();
  for (const roll of rolls) {
    const shelf = roll.folderId !== null && known.has(roll.folderId) ? roll.folderId : null;
    shelves.set(shelf, [...(shelves.get(shelf) ?? []), roll]);
  }
  return shelves;
}

type TagsProps = Omit<BodyProps, 'saved' | 'onDeleteFolder'> &
  Readonly<{
    label: string;
    rolls: readonly SavedRollDto[];
    folders: readonly SavedRollFolderDto[];
  }>;

function SavedRollTags({ label, rolls, ...actions }: TagsProps): React.JSX.Element | null {
  if (rolls.length === 0) return null;
  return (
    <ul aria-label={label} className="flex flex-wrap gap-1.5">
      {rolls.map((roll) => (
        <SavedRollTag key={roll.id} roll={roll} {...actions} />
      ))}
    </ul>
  );
}

type TagProps = Omit<TagsProps, 'label' | 'rolls'> & Readonly<{ roll: SavedRollDto }>;

function SavedRollTag({ roll, onRoll, onDelete, rollDisabled, ...move }: TagProps) {
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
      <MoveRollMenu roll={roll} {...move} />
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

type MoveMenuProps = Pick<TagsProps, 'folders' | 'onMove'> & Readonly<{ roll: SavedRollDto }>;

function MoveRollMenu({ roll, folders, onMove }: MoveMenuProps): React.JSX.Element | null {
  if (folders.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Mover ${roll.name}`}
          className="text-muted-foreground"
        >
          <FolderInputIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem disabled={roll.folderId === null} onSelect={() => onMove(roll, null)}>
          Sem pasta
        </DropdownMenuItem>
        {folders.map((folder) => (
          <DropdownMenuItem
            key={folder.id}
            disabled={roll.folderId === folder.id}
            onSelect={() => onMove(roll, folder.id)}
          >
            {folder.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
