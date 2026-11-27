import type { SavedTokenDto, SavedTokenFolderDto } from '@lorkarium/contracts';
import { LockIcon, MoreHorizontalIcon } from 'lucide-react';
import { useState } from 'react';
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
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { TokenAvatar } from '@/features/tokens/token-avatar';
import { cn } from '@/lib/utils';
import type { SavedTokensResult } from '@/services/saved-tokens-api';
import type { SavedTokensStore } from '@/stores/saved-tokens-store';
import { SAVED_TOKEN_DRAG_TYPE } from '@/lib/saved-token-drag';
import { NO_FOLDER_LABEL, savedTokenDetail } from './saved-token-messages';

const NO_FOLDER = 'no-folder';

export type SavedTokenRowProps = Readonly<{
  saved: SavedTokenDto;
  folders: readonly SavedTokenFolderDto[];
  list: StoreApi<SavedTokensStore>;
  armed: boolean;
  canSpawn: boolean;
  onArm: (saved: SavedTokenDto) => void;
  /** What each action answered: its refusal shows under the list, a success clears it. */
  onProblem: (result: SavedTokensResult<null>) => void;
}>;

/** One saved token of the list, a whole-row card: its portrait, name and size with its first bar.
 *  A click arms it ("Pôr Zumbi no mapa"), a drag puts it where it is dropped on the board; the
 *  menu (shown on hover or focus) renames it in place, moves it to a folder and deletes it after
 *  a yes. Past the plan it shows the lock and still spawns (only the name and the token are read
 *  only).
 *
 *  Example: `<SavedTokenRow saved={zombie} folders={folders} list={list} armed={false} canSpawn onArm={arm} onProblem={show} />` */
export function SavedTokenRow(props: SavedTokenRowProps): React.JSX.Element {
  const { saved, armed, canSpawn } = props;
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (renaming) return <RenameLine {...props} onDone={() => setRenaming(false)} />;
  return (
    <li
      className={cn(
        'group/row flex items-center gap-1 rounded-lg border border-transparent pr-1 transition-colors',
        'hover:border-border hover:bg-muted/60',
        armed && 'border-primary/60 bg-primary/10 hover:border-primary/60 hover:bg-primary/15',
      )}
    >
      <button
        type="button"
        aria-label={`Pôr ${saved.name} no mapa`}
        aria-pressed={armed}
        disabled={!canSpawn}
        draggable={canSpawn}
        onDragStart={(event) => startDrag(event, saved)}
        onClick={() => props.onArm(saved)}
        className={cn(
          'flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg py-1.5 pl-2 text-left',
          'outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60',
        )}
      >
        <TokenAvatar token={saved.token} size="lg" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn('truncate text-sm font-medium', armed && 'text-primary')}>
            {saved.name}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {savedTokenDetail(saved.token)}
          </span>
        </span>
        {saved.planLocked && (
          <LockIcon
            role="img"
            aria-label="Só leitura pelo plano"
            className="size-3.5 text-muted-foreground"
          />
        )}
      </button>
      <RowMenu {...props} onRename={() => setRenaming(true)} onDelete={() => setDeleting(true)} />
      {deleting && <DeleteDialog {...props} onClose={() => setDeleting(false)} />}
    </li>
  );
}

type RowMenuProps = SavedTokenRowProps & Readonly<{ onRename: () => void; onDelete: () => void }>;

function RowMenu({ saved, folders, list, onProblem, onRename, onDelete }: RowMenuProps) {
  const move = async (value: string): Promise<void> => {
    const folderId = value === NO_FOLDER ? null : value;
    onProblem(await list.getState().update(saved.id, { folderId }).then(asProblem));
  };
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Ações de ${saved.name}`}
          className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontalIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={saved.planLocked} onSelect={onRename}>
          Renomear…
        </DropdownMenuItem>
        {folders.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Mover para pasta</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={saved.folderId ?? NO_FOLDER}
                onValueChange={(value) => void move(value)}
              >
                <DropdownMenuRadioItem value={NO_FOLDER}>{NO_FOLDER_LABEL}</DropdownMenuRadioItem>
                {folders.map((folder) => (
                  <DropdownMenuRadioItem key={folder.id} value={folder.id}>
                    {folder.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          Excluir…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RenameLine(props: SavedTokenRowProps & Readonly<{ onDone: () => void }>) {
  const { saved, list, onProblem, onDone } = props;
  const [name, setName] = useState(saved.name);
  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const result = await list.getState().update(saved.id, { name: name.trim() });
    onProblem(asProblem(result));
    if (result.ok) onDone();
  };
  return (
    <li>
      <form onSubmit={(event) => void submit(event)}>
        <Input
          autoFocus
          aria-label="Nome do token salvo"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === 'Escape' && onDone()}
          onBlur={onDone}
          className="h-8 text-sm"
        />
      </form>
    </li>
  );
}

function DeleteDialog(props: SavedTokenRowProps & Readonly<{ onClose: () => void }>) {
  const { saved, list, onProblem, onClose } = props;
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Excluir ${saved.name}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            Sai da sua lista. Os tokens já postos no mapa ficam.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => void list.getState().remove(saved.id).then(asProblem).then(onProblem)}
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// The board takes only drags of this type (`carriesSavedToken`); the name rides as plain text.
function startDrag(event: React.DragEvent<HTMLButtonElement>, saved: SavedTokenDto): void {
  // Copy onto the board, move into a folder of the list.
  event.dataTransfer.effectAllowed = 'copyMove';
  event.dataTransfer.setData(SAVED_TOKEN_DRAG_TYPE, saved.id);
  event.dataTransfer.setData('text/plain', saved.name);
}

function asProblem<T>(result: SavedTokensResult<T>): SavedTokensResult<null> {
  return result.ok ? { ok: true, value: null } : result;
}
