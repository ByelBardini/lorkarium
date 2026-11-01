import type {
  CharacterChangedEventDto,
  CharacterDto,
  CharacterRemovedEventDto,
} from '@lorkarium/contracts';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { BoardSyncFailure, CharacterUpdate } from '@/services/table-session-api';

type CharacterEvent =
  | Readonly<{ kind: 'characterChanged'; event: CharacterChangedEventDto }>
  | Readonly<{ kind: 'characterRemoved'; event: CharacterRemovedEventDto }>;

/** The confirmed characters of one open table, in the version of the table's characters (apart
 *  from the grids'). `version` is `null` until the first `character:sync`; `held` are events that
 *  cannot apply yet: before it, or after a gap while the resync is on its way. */
export type CharactersStoreState = Readonly<{
  campaignId: string;
  status: 'loading' | 'ready' | 'failed';
  failure: BoardSyncFailure | null;
  version: number | null;
  characters: readonly CharacterDto[];
  held: readonly CharacterEvent[];
  resyncAsked: boolean;
}>;

export type CharactersStore = CharactersStoreState &
  Readonly<{
    apply: (update: CharacterUpdate) => void;
    /** Asks the snapshot again (the viewer's role changed: the server redacts them anew). */
    resync: () => void;
  }>;

const NO_CHARACTERS: readonly CharacterDto[] = [];

/** The characters store of one open table. A sync always replaces them (and replays the events
 *  held past its version); an event applies only at `version + 1`, is a duplicate at or below it,
 *  and a gap asks `requestResync` once.
 *
 *  Example: `const characters = createCharactersStore(campaignId, () => followed.resync())` */
export function createCharactersStore(
  campaignId: string,
  requestResync: () => void,
): StoreApi<CharactersStore> {
  return createStore<CharactersStore>()((set, get) => {
    const resyncOnce = (): Partial<CharactersStoreState> => {
      if (!get().resyncAsked) requestResync();
      return { resyncAsked: true };
    };
    return {
      ...initialState(campaignId),
      apply: (update) => set(nextState(get(), update, resyncOnce)),
      resync: () => {
        set({ resyncAsked: true });
        requestResync();
      },
    };
  });
}

/** React view of a slice of the characters store (re-renders when the slice changes).
 *
 *  Example: `const characters = useCharacters(store, (state) => state.characters)` */
export function useCharacters<T>(
  store: StoreApi<CharactersStore>,
  selector: (state: CharactersStore) => T,
): T {
  return useStore(store, selector);
}

/** The character of `userId` among the table's, if this viewer sees one.
 *
 *  Example: `characterOfUser(characters, bia.userId)?.name // 'Lyra'` */
export function characterOfUser(
  characters: readonly CharacterDto[],
  userId: string,
): CharacterDto | null {
  return characters.find((character) => character.userId === userId) ?? null;
}

function initialState(campaignId: string): CharactersStoreState {
  return {
    campaignId,
    status: 'loading',
    failure: null,
    version: null,
    characters: NO_CHARACTERS,
    held: [],
    resyncAsked: false,
  };
}

function nextState(
  state: CharactersStoreState,
  update: CharacterUpdate,
  resyncOnce: () => Partial<CharactersStoreState>,
): Partial<CharactersStoreState> {
  if (update.kind === 'characters') return syncedState(state, update.sync);
  if (update.kind === 'charactersFailed') return failedState(state, update.failure);
  if (update.event.campaignId !== state.campaignId) return {};
  return eventState(state, update, resyncOnce);
}

function syncedState(
  state: CharactersStoreState,
  sync: Readonly<{ version: number; characters: CharacterDto[] }>,
): Partial<CharactersStoreState> {
  const later = state.held
    .filter(({ event }) => event.version > sync.version)
    .sort((a, b) => a.event.version - b.event.version);
  const fresh = { version: sync.version, characters: sync.characters };
  const replayed = later.reduce(replayedOne, fresh);
  return { ...replayed, status: 'ready', failure: null, held: [], resyncAsked: false };
}

type Confirmed = Readonly<{ version: number; characters: readonly CharacterDto[] }>;

// A held event past a hole after the snapshot is dropped: the next gap asks again.
function replayedOne(confirmed: Confirmed, held: CharacterEvent): Confirmed {
  if (held.event.version !== confirmed.version + 1) return confirmed;
  return { version: held.event.version, characters: charactersAfter(confirmed.characters, held) };
}

function eventState(
  state: CharactersStoreState,
  update: CharacterEvent,
  resyncOnce: () => Partial<CharactersStoreState>,
): Partial<CharactersStoreState> {
  const { version } = state;
  if (version === null) return { held: [...state.held, update] };
  if (update.event.version <= version) return {};
  if (update.event.version > version + 1) {
    return { ...resyncOnce(), held: [...state.held, update] };
  }
  return { version: update.event.version, characters: charactersAfter(state.characters, update) };
}

function charactersAfter(
  characters: readonly CharacterDto[],
  update: CharacterEvent,
): readonly CharacterDto[] {
  if (update.kind === 'characterRemoved') {
    return characters.filter(({ id }) => id !== update.event.characterId);
  }
  const changed = new Map(update.event.characters.map((character) => [character.id, character]));
  const kept = characters.map((character) => changed.get(character.id) ?? character);
  const known = new Set(characters.map(({ id }) => id));
  return [...kept, ...update.event.characters.filter(({ id }) => !known.has(id))];
}

// A failed resync keeps the characters already shown; only a first sync that failed fails.
function failedState(
  state: CharactersStoreState,
  failure: BoardSyncFailure,
): Partial<CharactersStoreState> {
  if (state.version !== null) return { resyncAsked: false };
  return { status: 'failed', failure };
}
