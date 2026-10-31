import type { SceneActivatedDto, SceneClosedDto, SheetChangedEventDto } from '@lorkarium/contracts';
import type { Cell } from '@lorkarium/game-core';
import { useCallback, useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { EditEntry } from '@/lib/edit-history';
import type { BoardScope } from '@/services/board-command-sender';
import type {
  GridListener,
  GridWatchHandle,
  TableSessionUpdate,
} from '@/services/table-session-api';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createPingFeed, type PingFeed } from '@/stores/ping-feed';
import {
  forgetSceneTabs,
  readSceneTabs,
  writeSceneTabs,
  type TabStorage,
} from '@/stores/scene-tabs-storage';
import {
  createCopyArea,
  createTableEditStore,
  type TableEditStore,
} from '@/stores/table-edit-store';

/** The key of the group grid's tab: it follows the group wherever the master takes it. */
export const GROUP_TAB = 'group';

/** One grid open in the room: its confirmed board, this user's interaction and undo stack on it. */
export type SceneTab = Readonly<{
  /** `GROUP_TAB`, or the scene id of an extra tab. */
  key: string;
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  edits: StoreApi<TableEditStore>;
  /** The others' pings on this grid, as they arrive (nothing is kept). */
  pings: PingFeed;
  /** Where this tab's commands go, read when each one is sent (the group grid can move). */
  scopeOf: () => BoardScope;
}>;

export type SceneTabsState = Readonly<{
  campaignId: string;
  /** The group grid's tab first, then the extra ones in the order they were opened. */
  tabs: readonly SceneTab[];
  visibleKey: string;
  /** "Torre ficou privada.", "O mestre levou o grupo para Estrada de Vharn.", or nothing. */
  notice: string | null;
  /** Grows at each `library:changed`: the library reads itself again when it changes. */
  libraryRevision: number;
  /** The last `sheet:changed` of the table: each one is a new object, so a subscriber sees them
   *  all, one by one. */
  sheetChange: SheetChangedEventDto | null;
}>;

export type SceneTabsStore = SceneTabsState &
  Readonly<{
    /** Opens (or just shows) the tab of a grid; the group grid's is its own tab. */
    open: (sceneId: string) => void;
    show: (key: string) => void;
    /** Closes an extra tab (the group's never closes) and shows the group's if it was shown. */
    close: (sceneId: string) => void;
    /** The table-wide updates: activation, a tab closed by the server, the library changed. */
    apply: (update: TableSessionUpdate) => void;
    dismissNotice: () => void;
    /** Reopens the tabs this browser tab remembers for the table (after an F5). */
    restore: () => void;
    /** The table closed: `forget` drops the remembered tabs too (it was left on purpose). */
    dispose: (forget: boolean) => void;
  }>;

/** What a tab's interaction needs from its tab: where its commands go and its undo stack. */
export type TabInteractionDeps = Readonly<{
  scopeOf: () => BoardScope;
  recordEdit: (entry: EditEntry) => void;
  tokenCellOf: (tokenId: string) => Cell | null;
}>;

export type CreateTabInteraction = (deps: TabInteractionDeps) => StoreApi<BoardInteractionStore>;

export type SceneTabsDeps = Readonly<{
  campaignId: string;
  /** The group grid's board, fed by the table's own updates. */
  groupBoard: StoreApi<BoardStore>;
  /** The table's cast: every tab's linked tokens and table pieces are read from it. */
  cast: StoreApi<BoardStore>;
  watch: (sceneId: string, listener: GridListener) => GridWatchHandle;
  storage: TabStorage;
  createInteraction: CreateTabInteraction;
}>;

type SetTabs = StoreApi<SceneTabsStore>['setState'];
type GetTabs = StoreApi<SceneTabsStore>['getState'];

/** The grid tabs of one open table: the group grid's, fixed, and the extra ones this user opened,
 *  each with its own board, interaction and undo stack over the table's copy area. The tabs
 *  follow the server: an activation moves the group's tab, a `scene:closed` closes an extra one.
 *  Remembered per browser tab in `sessionStorage` (`lorkarium.sceneTabs.<campaignId>`).
 *
 *  Example: `createSceneTabsStore({ campaignId, groupBoard, watch: handle.watch, storage, createInteraction })` */
export function createSceneTabsStore(deps: SceneTabsDeps): StoreApi<SceneTabsStore> {
  return createStore<SceneTabsStore>()((set, get) => {
    const actions = new SceneTabsActions(deps, set, get);
    return {
      campaignId: deps.campaignId,
      tabs: [actions.groupTab()],
      visibleKey: GROUP_TAB,
      notice: null,
      libraryRevision: 0,
      sheetChange: null,
      open: (sceneId) => actions.open(sceneId),
      show: (key) => actions.show(key),
      close: (sceneId) => actions.close(sceneId),
      apply: (update) => actions.apply(update),
      dismissNotice: () => set({ notice: null }),
      restore: () => actions.restore(),
      dispose: (forget) => actions.dispose(forget),
    };
  });
}

/** React view of a slice of the tabs (re-renders when the slice changes).
 *
 *  Example: `const tab = useSceneTabs(tabs, visibleTabOf)` */
export function useSceneTabs<T>(
  store: StoreApi<SceneTabsStore>,
  selector: (state: SceneTabsStore) => T,
): T {
  return useStore(store, selector);
}

/** React view of one tab (`visibleTabOf`, `groupTabOf`), or `null` while the table has no tabs
 *  yet (still opening).
 *
 *  Example: `const tab = useSceneTabOf(table?.tabs ?? null, visibleTabOf)` */
export function useSceneTabOf(
  store: StoreApi<SceneTabsStore> | null,
  pick: (state: SceneTabsState) => SceneTab,
): SceneTab | null {
  const subscribe = useCallback(
    (onChange: () => void) => store?.subscribe(onChange) ?? (() => undefined),
    [store],
  );
  return useSyncExternalStore(subscribe, () => (store ? pick(store.getState()) : null));
}

/** The tab shown in the room (the group's when the shown one is gone).
 *
 *  Example: `visibleTabOf(tabs.getState()).board` */
export function visibleTabOf(state: SceneTabsState): SceneTab {
  return state.tabs.find(({ key }) => key === state.visibleKey) ?? groupTabOf(state);
}

/** The group grid's tab, always the first.
 *
 *  Example: `groupTabOf(tabs.getState()).board` */
export function groupTabOf(state: SceneTabsState): SceneTab {
  const [group] = state.tabs;
  if (!group) throw new Error(`table ${state.campaignId} has no tabs; expected the group's first`);
  return group;
}

class SceneTabsActions {
  // Handles are not renderable state, so they live beside the store, not in it.
  private readonly watches = new Map<string, GridWatchHandle>();
  private readonly copyArea = createCopyArea();
  // The grid the master just took the group to, until its snapshot names it.
  private arriving: string | null = null;

  constructor(
    private readonly deps: SceneTabsDeps,
    private readonly set: SetTabs,
    private readonly get: GetTabs,
  ) {
    deps.groupBoard.subscribe(() => this.followGroupGrid());
    deps.cast.subscribe(() => this.relinkTabs());
  }

  groupTab(): SceneTab {
    const { groupBoard } = this.deps;
    const sceneIdOf = (): string => groupBoard.getState().board?.scene.id ?? '';
    return this.tabOf(GROUP_TAB, groupBoard, sceneIdOf);
  }

  open(sceneId: string): void {
    if (this.isGroupGrid(sceneId) || this.has(sceneId)) return this.show(this.keyOf(sceneId));
    this.set({ tabs: [...this.get().tabs, this.watchedTab(sceneId)], visibleKey: sceneId });
    this.remember();
  }

  show(key: string): void {
    if (!this.has(key) && key !== GROUP_TAB) return;
    this.set({ visibleKey: key });
    this.remember();
  }

  close(sceneId: string): void {
    if (!this.has(sceneId)) return;
    this.drop(sceneId);
    this.remember();
  }

  apply(update: TableSessionUpdate): void {
    if (update.kind === 'sceneActivated') return this.onActivated(update.event);
    if (update.kind === 'sceneClosed') return this.onClosed(update.event);
    if (update.kind === 'pinged') return groupTabOf(this.get()).pings.push(update.event);
    if (update.kind === 'sheetChanged') return this.set({ sheetChange: update.event });
    if (update.kind === 'libraryChanged') {
      this.set({ libraryRevision: this.get().libraryRevision + 1 });
    }
  }

  restore(): void {
    const stored = readSceneTabs(this.deps.storage, this.deps.campaignId);
    if (!stored) return;
    for (const sceneId of stored.sceneIds) this.open(sceneId);
    this.show(stored.visible);
  }

  dispose(forget: boolean): void {
    for (const handle of this.watches.values()) handle.close();
    this.watches.clear();
    if (forget) forgetSceneTabs(this.deps.storage, this.deps.campaignId);
  }

  private watchedTab(sceneId: string): SceneTab {
    const board = createBoardStore(
      this.deps.campaignId,
      () => this.watches.get(sceneId)?.resync(),
      () => this.deps.cast.getState().board,
    );
    const pings = createPingFeed();
    const handle = this.deps.watch(sceneId, (update) => {
      if (update.kind === 'pinged') return pings.push(update.event);
      board.getState().apply(update);
      // Out of reach (private, gone): the tab has nothing to show, as after an F5 restore.
      if (update.kind === 'boardFailed' && update.failure === 'not_found') this.close(sceneId);
    });
    this.watches.set(sceneId, handle);
    return this.tabOf(sceneId, board, () => sceneId, pings);
  }

  private tabOf(
    key: string,
    board: StoreApi<BoardStore>,
    sceneIdOf: () => string,
    pings: PingFeed = createPingFeed(),
  ): SceneTab {
    const edits = createTableEditStore(this.deps.campaignId, this.copyArea);
    const scopeOf = (): BoardScope => ({ campaignId: this.deps.campaignId, sceneId: sceneIdOf() });
    const interaction = this.deps.createInteraction({
      scopeOf,
      recordEdit: (entry) => edits.getState().record(entry),
      tokenCellOf: (tokenId) => cellOfToken(board, tokenId),
    });
    return { key, board, interaction, edits, pings, scopeOf };
  }

  private relinkTabs(): void {
    for (const tab of this.get().tabs) tab.board.getState().relink();
  }

  private onActivated(event: SceneActivatedDto): void {
    // That grid is the group's now: its extra tab would show the same board twice.
    if (this.has(event.sceneId)) this.drop(event.sceneId);
    this.arriving = event.sceneId;
    this.set({ visibleKey: GROUP_TAB });
    this.remember();
    this.followGroupGrid();
  }

  // The group grid's snapshot names where the group is: an extra tab of that grid would show the
  // same board twice (a tab restored before the group's snapshot), and an arrival is announced.
  private followGroupGrid(): void {
    const scene = this.deps.groupBoard.getState().board?.scene;
    if (scene && this.has(scene.id)) this.close(scene.id);
    if (!this.arriving || scene?.id !== this.arriving) return;
    this.arriving = null;
    this.set({ notice: `O mestre levou o grupo para ${scene.name}.` });
  }

  private onClosed(event: SceneClosedDto): void {
    const tab = this.get().tabs.find(({ key }) => key === event.sceneId);
    if (!tab) return;
    const name = tab.board.getState().board?.scene.name ?? 'O grid';
    this.drop(event.sceneId);
    this.remember();
    const why = event.reason === 'private' ? 'ficou privada' : 'foi excluída';
    this.set({ notice: `${name} ${why}.` });
  }

  private drop(sceneId: string): void {
    this.watches.get(sceneId)?.close();
    this.watches.delete(sceneId);
    const { tabs, visibleKey } = this.get();
    const shown = visibleKey === sceneId ? GROUP_TAB : visibleKey;
    this.set({ tabs: tabs.filter(({ key }) => key !== sceneId), visibleKey: shown });
  }

  private remember(): void {
    const { tabs, visibleKey } = this.get();
    const sceneIds = tabs.filter(({ key }) => key !== GROUP_TAB).map(({ key }) => key);
    writeSceneTabs(this.deps.storage, this.deps.campaignId, { sceneIds, visible: visibleKey });
  }

  private has(key: string): boolean {
    return key !== GROUP_TAB && this.get().tabs.some((tab) => tab.key === key);
  }

  private isGroupGrid(sceneId: string): boolean {
    return this.deps.groupBoard.getState().board?.scene.id === sceneId;
  }

  private keyOf(sceneId: string): string {
    return this.isGroupGrid(sceneId) ? GROUP_TAB : sceneId;
  }
}

function cellOfToken(board: StoreApi<BoardStore>, tokenId: string): Cell | null {
  const token = board.getState().board?.tokens.find(({ id }) => id === tokenId);
  return token ? { col: token.col, row: token.row } : null;
}
