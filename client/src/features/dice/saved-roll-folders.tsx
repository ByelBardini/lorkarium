import { SAVED_ROLL_NAME_MAX_LENGTH, type SavedRollFolderDto } from '@lorkarium/contracts';
import { ChevronRightIcon, FolderIcon, PencilIcon, XIcon } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
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
import { Input } from '@/components/ui/input';
import type { SavedRollsResult } from '@/services/saved-rolls-api';
import { savedRollFailureMessage } from './dice-messages';

export type FolderNameFormProps = Readonly<{
  initialName: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<SavedRollsResult<SavedRollFolderDto>>;
  onDone: () => void;
}>;

/** The line that names a folder, new or renamed. Enter saves, Esc or "×" closes; the server's
 *  refusal stays under the field.
 *
 *  Example: `<FolderNameForm initialName="" submitLabel="Criar" onSubmit={saved.createFolder} onDone={close} />` */
export function FolderNameForm(props: FolderNameFormProps): React.JSX.Element {
  const { onDone } = props;
  const id = useId();
  const [name, setName] = useState(props.initialName);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = await props.onSubmit(name.trim());
    if (result.ok) return onDone();
    setProblem(savedRollFailureMessage(result.failure));
  };
  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          aria-label="Nome da pasta"
          value={name}
          maxLength={SAVED_ROLL_NAME_MAX_LENGTH}
          aria-invalid={problem !== null}
          aria-describedby={problem === null ? undefined : `${id}-error`}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === 'Escape' && onDone()}
          className="h-8 text-sm"
        />
        <Button type="submit" size="sm" disabled={name.trim() === ''}>
          {props.submitLabel}
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Cancelar" onClick={onDone}>
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      {problem !== null && (
        <p id={`${id}-error`} className="text-xs text-destructive-text">
          {problem}
        </p>
      )}
    </form>
  );
}

export type SavedRollFolderRowProps = Readonly<{
  folder: SavedRollFolderDto;
  rollCount: number;
  onRename: (name: string) => Promise<SavedRollsResult<SavedRollFolderDto>>;
  onDelete: () => void;
  /** The rolls inside, shown only while the folder is open. */
  children: ReactNode;
}>;

/** One folder of saved rolls: starts closed, and a click on its name opens the rolls inside.
 *
 *  Example: `<SavedRollFolderRow folder={magias} rollCount={2} onRename={rename} onDelete={ask}>{tags}</SavedRollFolderRow>` */
export function SavedRollFolderRow(props: SavedRollFolderRowProps): React.JSX.Element {
  const { folder, rollCount } = props;
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  if (renaming) {
    return (
      <li>
        <FolderNameForm
          initialName={folder.name}
          submitLabel="Salvar"
          onSubmit={props.onRename}
          onDone={() => setRenaming(false)}
        />
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-expanded={open}
          aria-label={`Pasta ${folder.name}, ${rollCount} ${rollCount === 1 ? 'rolagem' : 'rolagens'}`}
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm py-1 text-left text-sm font-medium text-foreground outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ChevronRightIcon
            aria-hidden="true"
            className={`size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
          />
          <FolderIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{folder.name}</span>
          <span className="text-xs font-normal text-muted-foreground">{rollCount}</span>
        </button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Renomear pasta ${folder.name}`}
          onClick={() => setRenaming(true)}
          className="text-muted-foreground"
        >
          <PencilIcon aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Apagar pasta ${folder.name}`}
          onClick={props.onDelete}
          className="text-muted-foreground hover:text-destructive-text"
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      {open && <div className="pl-5">{props.children}</div>}
    </li>
  );
}

export type DeleteFolderDialogProps = Readonly<{
  folder: SavedRollFolderDto | null;
  onCancel: () => void;
  onConfirm: (folder: SavedRollFolderDto) => void;
}>;

/** Asks before deleting a folder, saying its rolls stay.
 *
 *  Example: `<DeleteFolderDialog folder={doomed} onCancel={close} onConfirm={remove} />` */
export function DeleteFolderDialog(props: DeleteFolderDialogProps): React.JSX.Element {
  const { folder, onCancel, onConfirm } = props;
  return (
    <AlertDialog open={folder !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Apagar a pasta “{folder?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            As rolagens dela não são apagadas: ficam fora de pastas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="lg">Cancelar</AlertDialogCancel>
          <Button size="lg" variant="destructive" onClick={() => folder && onConfirm(folder)}>
            Apagar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
