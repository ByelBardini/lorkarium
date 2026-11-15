import { friendSearchQueryDto, type FriendProfileDto } from '@lorkarium/contracts';
import { useEffect, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { FriendsStore } from '@/stores/friends-store';

/** What the "Adicionar amigo" list shows for the typed text. */
export type FriendSearchState =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'searching' }>
  | Readonly<{ kind: 'found'; accounts: readonly FriendProfileDto[] }>
  | Readonly<{ kind: 'failed' }>;

// Waits for a pause in the typing: one request per word, not per letter.
export const FRIEND_SEARCH_PAUSE_MS = 250;

/** Searches the accounts by the start of the typed @ after a pause in the typing; a text too
 *  short or out of the @ format searches nothing, and an older answer never replaces a newer one.
 *
 *  Example: `const state = useFriendSearch(deps.friends, typed)` */
export function useFriendSearch(friends: StoreApi<FriendsStore>, typed: string): FriendSearchState {
  const parsed = friendSearchQueryDto.safeParse({ q: typed });
  const prefix = parsed.success ? parsed.data.q : null;
  const [answer, setAnswer] = useState<SearchAnswer | null>(null);
  useEffect(() => {
    if (prefix === null) return;
    let current = true;
    const timer = setTimeout(() => {
      void friends
        .getState()
        .search(prefix)
        .then((result) => {
          if (current) setAnswer({ prefix, state: stateOf(result) });
        });
    }, FRIEND_SEARCH_PAUSE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [friends, prefix]);
  if (prefix === null) return { kind: 'idle' };
  return answer?.prefix === prefix ? answer.state : { kind: 'searching' };
}

// The answer remembers its prefix: a list found for "ni" is never shown under "nic".
type SearchAnswer = Readonly<{ prefix: string; state: FriendSearchState }>;

function stateOf(result: Awaited<ReturnType<FriendsStore['search']>>): FriendSearchState {
  return result.ok ? { kind: 'found', accounts: result.value } : { kind: 'failed' };
}
