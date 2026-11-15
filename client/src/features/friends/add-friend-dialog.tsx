import { SearchIcon } from 'lucide-react';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FriendSearchResults } from './friend-search-results';
import type { FriendsScreenDeps } from './friends-screen';
import { useFriendSearch } from './use-friend-search';

export type AddFriendDialogProps = Readonly<{
  deps: FriendsScreenDeps;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>;

/** "Adicionar amigo": searches accounts by the start of the @ and sends a request to each one
 *  chosen. Closing it forgets the search.
 *
 *  Example: `<AddFriendDialog deps={deps} open={adding} onOpenChange={setAdding} />` */
export function AddFriendDialog({
  deps,
  open,
  onOpenChange,
}: AddFriendDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar amigo</DialogTitle>
          <DialogDescription>
            A pessoa recebe um pedido e aparece na sua lista quando aceitar.
          </DialogDescription>
        </DialogHeader>
        {open && <FriendSearchPanel deps={deps} />}
      </DialogContent>
    </Dialog>
  );
}

function FriendSearchPanel({ deps }: Readonly<{ deps: FriendsScreenDeps }>): React.JSX.Element {
  const [typed, setTyped] = useState('');
  const state = useFriendSearch(deps.friends, typed);
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label="Buscar pelo @usuário"
          placeholder="@usuário"
          autoComplete="off"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          className="h-10 pl-9"
        />
      </div>
      <FriendSearchResults state={state} friends={deps.friends} />
    </div>
  );
}
