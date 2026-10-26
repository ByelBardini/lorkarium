import {
  diceRolledDto,
  diceRolledSecretlyDto,
  type DiceRolledDto,
  type DiceRolledSecretlyDto,
  type RolledDieDto,
} from '@lorkarium/contracts';
import { z } from 'zod';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Unsubscribe } from '@/services/realtime-transport';
import type { TableSessionUpdate } from '@/services/table-session-api';
import type { TabStorage } from '@/stores/scene-tabs-storage';

/** The rolls one table keeps for this visit (an F5 included). */
export const DICE_HISTORY_LIMIT = 200;

const DICE_HISTORY_STORAGE_PREFIX = 'lorkarium.dice.';

/** One roll of the history. `receivedAtMs` and `revealAtMs` are wall-clock milliseconds (the
 *  store's `wallClock`, `Date.now` in the app), so they still mean something after an F5: the
 *  result shows as "…" until `revealAtMs`. A `secret` is the notice of a masters-only roll. */
export type DiceHistoryEntry =
  | Readonly<{ kind: 'rolled'; event: DiceRolledDto; receivedAtMs: number; revealAtMs: number }>
  | Readonly<{
      kind: 'secret';
      event: DiceRolledSecretlyDto;
      receivedAtMs: number;
      revealAtMs: number;
    }>;

export type DiceHistoryListener = (entry: DiceHistoryEntry) => void;

export type DiceHistoryState = Readonly<{
  campaignId: string;
  /** Oldest first, at most `DICE_HISTORY_LIMIT`. */
  entries: readonly DiceHistoryEntry[];
}>;

export type DiceHistoryStore = DiceHistoryState &
  Readonly<{
    /** Takes a `diceRolled` / `diceRolledSecretly` of this table; any other update is ignored,
     *  and so is a `rollId` already in the history. */
    apply: (update: TableSessionUpdate, receivedAtMs: number) => void;
    /** Leaving the table: forgets the history and its storage key. */
    clear: () => void;
    /** Hears each roll as it enters (with its throw, for the 3D overlay), never the ones read
     *  back from the storage. */
    onNewEntry: (listener: DiceHistoryListener) => Unsubscribe;
  }>;

export type DiceHistoryDeps = Readonly<{ campaignId: string; storage: TabStorage }>;

// Not a network DTO: only what this tab wrote for itself, read back defensively.
const storedEntriesSchema = z
  .array(
    z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('rolled'),
        event: diceRolledDto,
        receivedAtMs: z.number(),
        revealAtMs: z.number(),
      }),
      z.object({
        kind: z.literal('secret'),
        event: diceRolledSecretlyDto,
        receivedAtMs: z.number(),
        revealAtMs: z.number(),
      }),
    ]),
  )
  .max(DICE_HISTORY_LIMIT);

/** The `sessionStorage` key of one table's history.
 *
 *  Example: `diceHistoryStorageKey(campaignId) // 'lorkarium.dice.<campaignId>'` */
export function diceHistoryStorageKey(campaignId: string): string {
  return DICE_HISTORY_STORAGE_PREFIX + campaignId;
}

/** The dice history of one open table (Zustand vanilla, one per table, made by the open
 *  tables store), kept in `sessionStorage` so an F5 keeps it; a storage that throws (or is
 *  full) leaves it in memory.
 *
 *  Example: `createDiceHistoryStore({ campaignId, storage: sessionStorage }).getState().apply(update, Date.now())` */
export function createDiceHistoryStore(deps: DiceHistoryDeps): StoreApi<DiceHistoryStore> {
  const listeners = new Set<DiceHistoryListener>();
  return createStore<DiceHistoryStore>()((set, get) => ({
    campaignId: deps.campaignId,
    entries: readStored(deps),
    apply: (update, receivedAtMs) => {
      const entry = entryOf(update, receivedAtMs, deps.campaignId);
      if (!entry || get().entries.some((kept) => kept.event.rollId === entry.event.rollId)) return;
      set({ entries: [...get().entries, entry].slice(-DICE_HISTORY_LIMIT) });
      writeStored(deps, get().entries);
      for (const listener of listeners) listener(entry);
    },
    clear: () => {
      set({ entries: [] });
      removeStored(deps);
    },
    onNewEntry: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  }));
}

/** React view of a slice of one table's dice history.
 *
 *  Example: `const entries = useDiceHistory(table.dice, (state) => state.entries)` */
export function useDiceHistory<T>(
  store: StoreApi<DiceHistoryStore>,
  selector: (state: DiceHistoryStore) => T,
): T {
  return useStore(store, selector);
}

function entryOf(
  update: TableSessionUpdate,
  receivedAtMs: number,
  campaignId: string,
): DiceHistoryEntry | null {
  if (update.kind !== 'diceRolled' && update.kind !== 'diceRolledSecretly') return null;
  if (update.event.campaignId !== campaignId) return null;
  const revealAtMs = receivedAtMs + update.event.settlesInMs;
  if (update.kind === 'diceRolled') {
    return { kind: 'rolled', event: update.event, receivedAtMs, revealAtMs };
  }
  return { kind: 'secret', event: update.event, receivedAtMs, revealAtMs };
}

// The throw is only for the replay as it arrives, and its frames would fill the storage quota.
function storableOf(entry: DiceHistoryEntry): DiceHistoryEntry {
  if (entry.kind === 'secret') return entry;
  const parts = entry.event.parts.map((part) => ({
    ...part,
    dice: part.dice.map(withoutModel),
  }));
  return { ...entry, event: { ...entry.event, throw: null, parts } };
}

function withoutModel(die: RolledDieDto): RolledDieDto {
  const { sides, value, status, success } = die;
  return success === undefined ? { sides, value, status } : { sides, value, status, success };
}

function readStored({ campaignId, storage }: DiceHistoryDeps): DiceHistoryEntry[] {
  try {
    const raw = storage.getItem(diceHistoryStorageKey(campaignId));
    if (raw === null) return [];
    const parsed = storedEntriesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function writeStored(
  { campaignId, storage }: DiceHistoryDeps,
  entries: readonly DiceHistoryEntry[],
): void {
  try {
    storage.setItem(diceHistoryStorageKey(campaignId), JSON.stringify(entries.map(storableOf)));
  } catch {
    // Keeps working in memory for this visit.
  }
}

function removeStored({ campaignId, storage }: DiceHistoryDeps): void {
  try {
    storage.removeItem(diceHistoryStorageKey(campaignId));
  } catch {
    // Nothing was stored to begin with.
  }
}
