import type { CharacterDto, CharacterSyncDto, ConditionDefinitionDto } from '@lorkarium/contracts';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { BoardSyncFailure, CharacterUpdate } from '@/services/table-session-api';
import { tableStreamAfter, type TableStreamEvent } from './table-stream-reducer';

/** The confirmed table stream of one open table: its characters and its condition list, in one
 *  version of its own (apart from the grids'). `version` is `null` until the first
 *  `character:sync`; `held` are events that cannot apply yet: before it, or after a gap while
 *  the resync is on its way. */
export type CharactersStoreState = Readonly<{
  campaignId: string;
  status: 'loading' | 'ready' | 'failed';
  failure: BoardSyncFailure | null;
  version: number | null;
  characters: readonly CharacterDto[];
  /** The table's list of conditions: the catalog, the picker and every token's conditions. */
  conditionDefinitions: ConditionDefinitionDto[];
  held: readonly TableStreamEvent[];
  resyncAsked: boolean;
}>;

export type CharactersStore = CharactersStoreState &
  Readonly<{
    apply: (update: CharacterUpdate) => void;
    /** Asks the snapshot again (the viewer's role changed: the server redacts them anew). */
    resync: () => void;
  }>;

const NO_CHARACTERS: readonly CharacterDto[] = [];
const NO_DEFINITIONS: ConditionDefinitionDto[] = [];

/** The table stream store of one open table. A sync always replaces it (and replays the events
 *  held past its version); an event — a character's or the condition list's, one counter —
 *  applies only at `version + 1`, is a duplicate at or below it, and a gap asks `requestResync`
 *  once.
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
    conditionDefinitions: NO_DEFINITIONS,
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
  sync: CharacterSyncDto,
): Partial<CharactersStoreState> {
  const later = state.held
    .filter(({ event }) => event.version > sync.version)
    .sort((a, b) => a.event.version - b.event.version);
  const { version, characters, conditionDefinitions } = sync;
  const replayed = later.reduce(replayedOne, { version, characters, conditionDefinitions });
  return { ...replayed, status: 'ready', failure: null, held: [], resyncAsked: false };
}

type Confirmed = Readonly<{
  version: number;
  characters: readonly CharacterDto[];
  conditionDefinitions: ConditionDefinitionDto[];
}>;

// A held event past a hole after the snapshot is dropped: the next gap asks again.
function replayedOne(confirmed: Confirmed, held: TableStreamEvent): Confirmed {
  if (held.event.version !== confirmed.version + 1) return confirmed;
  return { ...tableStreamAfter(confirmed, held), version: held.event.version };
}

function eventState(
  state: CharactersStoreState,
  update: TableStreamEvent,
  resyncOnce: () => Partial<CharactersStoreState>,
): Partial<CharactersStoreState> {
  const { version } = state;
  if (version === null) return { held: [...state.held, update] };
  if (update.event.version <= version) return {};
  if (update.event.version > version + 1) {
    return { ...resyncOnce(), held: [...state.held, update] };
  }
  return { ...tableStreamAfter(state, update), version: update.event.version };
}

// A failed resync keeps the characters already shown; only a first sync that failed fails.
function failedState(
  state: CharactersStoreState,
  failure: BoardSyncFailure,
): Partial<CharactersStoreState> {
  if (state.version !== null) return { resyncAsked: false };
  return { status: 'failed', failure };
}
