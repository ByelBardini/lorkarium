import type { SavedTokenFolderDto } from '@lorkarium/contracts';
import { ChevronRightIcon, FolderIcon, FolderPlusIcon, MoreHorizontalIcon } from 'lucide-react';
import { useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { SavedTokensResult } from '@/services/saved-tokens-api';
import type { SavedTokensStore } from '@/stores/saved-tokens-store';
import { useFolderDrop } from './use-folder-drop';

/** How a group of the list shows that a saved token dragged over it would land there. */
export const DROP_TARGET_CLASS = 'bg-primary/5 ring-2 ring-primary/60';

type FolderPartProps = Readonly<{
  list: StoreApi<SavedTokensStore>;
  onProblem: (result: SavedTokensResult<null>) => void;
}>;

export type SavedTokenFolderProps = FolderPartProps &
  Readonly<{
    folder: SavedTokenFolderDto;
    /** How many of its tokens the search shows. */
    count: number;
    children: React.ReactNode;
  }>;

/** One folder of the saved tokens: a header that folds it (with how many it shows) and a menu
 *  (rename in place; delete: its tokens stay, out of any folder), then its entries.
 *
 *  Example: `<SavedTokenFolder folder={mortos} count={2} list={list} onProblem={show}>{rows}</SavedTokenFolder>` */
export function SavedTokenFolder(props: SavedTokenFolderProps): React.JSX.Element {
  const { folder, count, children } = props;
  const [open, setOpen] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const drop = useFolderDrop(props.list, folder.id, props.onProblem);
  return (
    <ul
      role="group"
      aria-label={folder.name}
      {...drop.handlers}
      className={cn('flex flex-col gap-0.5 rounded-lg', drop.over && DROP_TARGET_CLASS)}
    >
      <li className="group/folder flex items-center gap-1">
        {renaming ? (
          <RenameFolder {...props} onDone={() => setRenaming(false)} />
        ) : (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`Pasta ${folder.name}`}
            onClick={() => setOpen(!open)}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground"
          >
            <ChevronRightIcon
              aria-hidden="true"
              className={cn('size-3.5 transition-transform', open && 'rotate-90')}
            />
            <FolderIcon aria-hidden="true" className="size-3.5" />
            <span className="truncate">{folder.name}</span>
            <span className="font-normal tabular-nums">{count}</span>
          </button>
        )}
        <FolderMenu {...props} onRename={() => setRenaming(true)} />
      </li>
      {open && children}
    </ul>
  );
}

function FolderMenu(props: SavedTokenFolderProps & Readonly<{ onRename: () => void }>) {
  const { folder, list, onProblem, onRename } = props;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Ações da pasta ${folder.name}`}
          className="opacity-0 group-hover/folder:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontalIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onRename}>Renomear…</DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => void list.getState().removeFolder(folder.id).then(onProblem)}
        >
          Excluir pasta
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RenameFolder(props: SavedTokenFolderProps & Readonly<{ onDone: () => void }>) {
  const { folder, list, onProblem, onDone } = props;
  return (
    <NameLine
      initial={folder.name}
      onDone={onDone}
      onSave={async (name) =>
        onProblem(nullOf(await list.getState().renameFolder(folder.id, name)))
      }
    />
  );
}

/** "Nova pasta" beside the search: a click opens the name line under it.
 *
 *  Example: `<NewSavedTokenFolder list={list} onProblem={show} />` */
export function NewSavedTokenFolder({ list, onProblem }: FolderPartProps): React.JSX.Element {
  const [naming, setNaming] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Nova pasta"
        title="Nova pasta"
        aria-expanded={naming}
        onClick={() => setNaming(!naming)}
      >
        <FolderPlusIcon aria-hidden="true" />
      </Button>
      {naming && (
        <div className="basis-full">
          <NameLine
            initial=""
            onDone={() => setNaming(false)}
            onSave={async (name) => onProblem(nullOf(await list.getState().createFolder(name)))}
          />
        </div>
      )}
    </>
  );
}

type NameLineProps = Readonly<{
  initial: string;
  onDone: () => void;
  onSave: (name: string) => Promise<void>;
}>;

function NameLine({ initial, onDone, onSave }: NameLineProps): React.JSX.Element {
  const [name, setName] = useState(initial);
  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (name.trim() !== '') await onSave(name.trim());
    onDone();
  };
  return (
    <form onSubmit={(event) => void submit(event)} className="min-w-0 flex-1">
      <Input
        autoFocus
        aria-label="Nome da pasta"
        placeholder="Nome da pasta"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && onDone()}
        className="h-8 text-sm"
      />
    </form>
  );
}

function nullOf<T>(result: SavedTokensResult<T>): SavedTokensResult<null> {
  return result.ok ? { ok: true, value: null } : result;
}
