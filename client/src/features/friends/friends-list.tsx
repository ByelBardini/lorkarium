import type { FriendsOverviewDto } from '@lorkarium/contracts';
import { SearchIcon, UserPlusIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFriends } from '@/stores/friends-store';
import { AddFriendForm } from './add-friend-form';
import { BlockedTab } from './blocked-tab';
import { FriendGroupsList } from './friend-groups-list';
import { FriendRequestsTab } from './friend-requests-tab';
import { FriendsListFailure, FriendsListSkeleton } from './friends-list-states';
import type { FriendsNotice, FriendsScreenDeps, ShowFriendsNotice } from './friends-screen';

export type FriendsListProps = Readonly<{ deps: FriendsScreenDeps; selectedId: string | null }>;

/** The list column: "Amigos" with "Adicionar", the tabs (Todos, Online, Pedidos, Bloqueados),
 *  the sentence of the last action, and the skeleton or the failure until the first read.
 *
 *  Example: `<FriendsList deps={deps} selectedId={userId ?? null} />` */
export function FriendsList({ deps, selectedId }: FriendsListProps): React.JSX.Element {
  const overview = useFriends(deps.friends, (state) => state.overview);
  const failed = useFriends(deps.friends, (state) => state.failure !== null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<FriendsNotice | null>(null);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-2 px-4 pt-6 pb-3">
        <h1 className="font-display text-3xl text-foreground">Amigos</h1>
        <Button
          variant={adding ? 'outline' : 'default'}
          aria-expanded={adding}
          onClick={() => setAdding(!adding)}
        >
          <UserPlusIcon aria-hidden="true" />
          Adicionar
        </Button>
      </header>
      {adding && (
        <div className="px-4 pb-3">
          <AddFriendForm deps={deps} onNotice={setNotice} />
        </div>
      )}
      <NoticeLine notice={notice} />
      {overview ? (
        <FriendsTabs overview={overview} deps={deps} selectedId={selectedId} onNotice={setNotice} />
      ) : failed ? (
        <FriendsListFailure onRetry={() => void deps.friends.getState().load()} />
      ) : (
        <FriendsListSkeleton />
      )}
    </div>
  );
}

// Both regions stay mounted, so the screen reader hears the sentence that lands in them.
function NoticeLine({ notice }: Readonly<{ notice: FriendsNotice | null }>): React.JSX.Element {
  return (
    <div className="px-4 text-sm">
      <p role="status" className="text-muted-foreground">
        {notice && !notice.error ? notice.text : ''}
      </p>
      <p role="alert" className="text-destructive-text">
        {notice?.error ? notice.text : ''}
      </p>
    </div>
  );
}

type FriendsTabsProps = Readonly<{
  overview: FriendsOverviewDto;
  deps: FriendsScreenDeps;
  selectedId: string | null;
  onNotice: ShowFriendsNotice;
}>;

function FriendsTabs({
  overview,
  deps,
  selectedId,
  onNotice,
}: FriendsTabsProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const lists = (onlineOnly: boolean): React.JSX.Element => (
    <>
      <FriendsSearch query={query} onChange={setQuery} />
      <FriendGroupsList
        friends={overview.friends}
        onlineOnly={onlineOnly}
        query={query}
        selectedId={selectedId}
        deps={deps}
        onNotice={onNotice}
      />
    </>
  );
  const requests = overview.incoming.length;
  return (
    <Tabs defaultValue="all" className="min-h-0 flex-1">
      <TabsList className="px-4">
        <TabsTrigger value="all">Todos</TabsTrigger>
        <TabsTrigger value="online">Online</TabsTrigger>
        <TabsTrigger value="requests">
          {requests > 0 ? `Pedidos (${requests})` : 'Pedidos'}
        </TabsTrigger>
        <TabsTrigger value="blocked">Bloqueados</TabsTrigger>
      </TabsList>
      <TabsContent value="all" className="min-h-0 overflow-y-auto">
        {lists(false)}
      </TabsContent>
      <TabsContent value="online" className="min-h-0 overflow-y-auto">
        {lists(true)}
      </TabsContent>
      <TabsContent value="requests" className="min-h-0 overflow-y-auto">
        <FriendRequestsTab
          incoming={overview.incoming}
          outgoing={overview.outgoing}
          deps={deps}
          onNotice={onNotice}
        />
      </TabsContent>
      <TabsContent value="blocked" className="min-h-0 overflow-y-auto">
        <BlockedTab blocked={overview.blocked} deps={deps} onNotice={onNotice} />
      </TabsContent>
    </Tabs>
  );
}

function FriendsSearch({
  query,
  onChange,
}: Readonly<{ query: string; onChange: (query: string) => void }>): React.JSX.Element {
  return (
    <div className="relative px-4 pt-4">
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-7 left-7 size-4 text-muted-foreground"
      />
      <Input
        type="search"
        aria-label="Buscar amigo"
        placeholder="Buscar por apelido ou @"
        value={query}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 pl-9"
      />
    </div>
  );
}
