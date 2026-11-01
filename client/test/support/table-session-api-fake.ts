import { act } from '@testing-library/react';
import type {
  CharacterListener,
  CharacterUpdate,
  GridListener,
  GridUpdate,
  TableSessionApi,
  TableSessionHandle,
  TableSessionListener,
  TableSessionUpdate,
} from '@/services/table-session-api';
import { CallJournal } from './call-journal';

/** The live session as the test plays it: `opened` lists each table opened, `closedIds` each
 *  table closed (`closed` counts them), `emit(update)` delivers to the latest listener and
 *  `emitTo(campaignId, update)` to that table's, both inside `act`; `close` writes
 *  `close:<campaignId>` to the journal. Extra grid tabs: `watched` / `unwatched` list each
 *  `watch` and tab `close` as `<campaignId>:<sceneId>`, `watchResyncs` each tab `resync()`, and
 *  `emitToGrid(sceneId, update)` delivers to the open tab of that grid. The cast: `castFollowed`
 *  lists each `followCast` as `<campaignId>:<sceneId>`, `castResyncs` each cast `resync()`, and
 *  `emitToCast(campaignId, update)` delivers to that table's cast. The characters:
 *  `charactersFollowed` lists each `followCharacters` by table, `characterResyncs` each of their
 *  `resync()`, and `emitToCharacters(campaignId, update)` delivers to that table's characters.
 *
 *  Example: `tableSessionApi.emitTo(VHARN.id, { kind: 'state', state: vharnState() })` */
export class TableSessionApiFake implements TableSessionApi {
  readonly opened: string[] = [];
  readonly closedIds: string[] = [];
  /** Each `resync()` the stores asked for, by table. */
  readonly resyncedIds: string[] = [];
  /** Each `setAway(away)` the stores sent, by table. */
  readonly awayCalls: Array<Readonly<{ campaignId: string; away: boolean }>> = [];
  readonly watched: string[] = [];
  readonly unwatched: string[] = [];
  readonly watchResyncs: string[] = [];
  readonly castFollowed: string[] = [];
  readonly castResyncs: string[] = [];
  private readonly castListeners = new Map<string, GridListener>();
  readonly charactersFollowed: string[] = [];
  readonly characterResyncs: string[] = [];
  private readonly characterListeners = new Map<string, CharacterListener>();
  private listener: TableSessionListener | null = null;
  private readonly listeners = new Map<string, TableSessionListener>();
  private readonly gridListeners = new Map<string, GridListener>();

  constructor(private readonly journal: CallJournal = new CallJournal()) {}

  get closed(): number {
    return this.closedIds.length;
  }

  open(campaignId: string, listener: TableSessionListener): TableSessionHandle {
    this.opened.push(campaignId);
    this.listener = listener;
    this.listeners.set(campaignId, listener);
    return {
      close: () => {
        this.closedIds.push(campaignId);
        this.journal.entries.push(`close:${campaignId}`);
      },
      resync: () => {
        this.resyncedIds.push(campaignId);
      },
      setAway: (away) => {
        this.awayCalls.push({ campaignId, away });
      },
      watch: (sceneId, listener) => this.watch(campaignId, sceneId, listener),
      followCast: (sceneId, listener) => {
        this.castFollowed.push(`${campaignId}:${sceneId}`);
        this.castListeners.set(campaignId, listener);
        return { resync: () => void this.castResyncs.push(`${campaignId}:${sceneId}`) };
      },
      followCharacters: (listener) => {
        this.charactersFollowed.push(campaignId);
        this.characterListeners.set(campaignId, listener);
        return { resync: () => void this.characterResyncs.push(campaignId) };
      },
    };
  }

  emitToCharacters(campaignId: string, ...updates: CharacterUpdate[]): void {
    const listener = this.characterListeners.get(campaignId);
    if (!listener) {
      throw new Error(
        `table ${campaignId} follows no characters; followed: ${this.charactersFollowed}`,
      );
    }
    act(() => {
      for (const update of updates) listener(update);
    });
  }

  emitToGrid(sceneId: string, ...updates: GridUpdate[]): void {
    const listener = this.gridListeners.get(sceneId);
    if (!listener) throw new Error(`no tab of ${sceneId} is open; watched: ${this.watched}`);
    act(() => {
      for (const update of updates) listener(update);
    });
  }

  emitToCast(campaignId: string, ...updates: GridUpdate[]): void {
    const listener = this.castListeners.get(campaignId);
    if (!listener)
      throw new Error(`table ${campaignId} follows no cast; followed: ${this.castFollowed}`);
    act(() => {
      for (const update of updates) listener(update);
    });
  }

  private watch(campaignId: string, sceneId: string, listener: GridListener) {
    const key = `${campaignId}:${sceneId}`;
    this.watched.push(key);
    this.gridListeners.set(sceneId, listener);
    return {
      close: () => {
        this.unwatched.push(key);
        if (this.gridListeners.get(sceneId) === listener) this.gridListeners.delete(sceneId);
      },
      resync: () => {
        this.watchResyncs.push(key);
      },
    };
  }

  emitTo(campaignId: string, ...updates: TableSessionUpdate[]): void {
    const listener = this.listeners.get(campaignId);
    if (!listener) throw new Error(`table ${campaignId} was never opened; opened: ${this.opened}`);
    act(() => {
      for (const update of updates) listener(update);
    });
  }

  emit(...updates: TableSessionUpdate[]): void {
    const listener = this.listener;
    if (!listener) throw new Error(`no table opened yet; cannot emit ${JSON.stringify(updates)}`);
    act(() => {
      for (const update of updates) listener(update);
    });
  }
}
