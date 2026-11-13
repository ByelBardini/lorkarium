import type {
  DocumentTabChangedDto,
  LibraryMapRegionShownDto,
  SceneActivatedDto,
  SceneClosedDto,
  SheetChangedEventDto,
} from '@lorkarium/contracts';
import type { Cell } from '@lorkarium/game-core';
import { useCallback, useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { EditEntry } from '@/lib/edit-history';
import { posedTokenOf } from '@/lib/patrol-poses';
import { restoredTabOrder, syncedTabOrder } from '@/lib/room-tab-order';
import { insertedTabOrder, shiftedTabOrder } from '@/lib/tab-order';
import type { BoardScope } from '@/services/board-command-sender';
import type {
  GridListener,
  GridWatchHandle,
  TableSessionUpdate,
} from '@/services/table-session-api';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import { createBoardStore, tableLinksOf, type BoardStore } from '@/stores/board-store';
import type { CharactersStore } from '@/stores/characters-store';
import { createPingFeed, type PingFeed } from '@/stores/ping-feed';
import {
  forgetSceneTabs,
  readSceneTabs,
  sameRoomItemRefs,
  writeSceneTabs,
  type RestoredRoomItems,
  type RoomItemRef,
  type StoredSceneTabs,
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
  /** The room's extra tabs, grids and workspace items mixed, in the strip's order: each one goes
   *  to the end as it opens, and the person moves them; the group's is never in it. The one order
   *  of the strip and of Ctrl+Tab/Ctrl+1–9 (`roomTabOrder`). */
  tabOrder: readonly string[];
  visibleKey: string;
  /** "Torre ficou privada.", "O mestre levou o grupo para Estrada de Vharn.", or nothing. */
  notice: string | null;
  /** Grows at each `library:changed`: the library reads itself again when it changes. */
  libraryRevision: number;
  /** Grows at each `library:mapChanged`: an open map reads itself again by its route. */
  mapRevision: number;
  /** Grows at each `scene:activated`: the room leaves the map tab for the group grid. */
  sceneActivations: number;
  /** The room already arrived at the main map. Not stored anywhere on purpose: it lives and dies
   *  with the open table, so opening the table starts at the main map, and coming back from
   *  another open table does not. An F5 that brings the room's tabs back counts as arrived: the
   *  room shows what it showed, not the main map. */
  arrivedAtHome: boolean;
  /** The last `sheet:changed` of the table: each one is a new object, so a subscriber sees them
   *  all, one by one. */
  sheetChange: SheetChangedEventDto | null;
  /** The last `document:tabChanged` of the table: each one is a new object, so the open document
   *  sees them all; the library and the maps never move for a tab body. */
  documentTabChange: DocumentTabChangedDto | null;
  /** The last `library:mapRegionShown` of the table: each one is a new object. Only a subscriber
   *  reads it, at the moment it lands: shown to whoever was in the room then, and no one later. */
  regionShown: LibraryMapRegionShownDto | null;
  /** The room tab shown before the one on screen (a grid's or a workspace key), for Shift+M and
   *  Shift+F to go back to. Only in memory: an F5 forgets where the person came from. */
  previousKey: string | null;
}>;

export type SceneTabsStore = SceneTabsState &
  Readonly<{
    /** Opens (or just shows) the tab of a grid; the group grid's is its own tab. */
    open: (sceneId: string) => void;
    show: (key: string) => void;
    /** What the room shows now (a grid's key or a workspace key): the last different one becomes
     *  `previousKey`. */
    noteShown: (key: string) => void;
    /** Closes an extra tab (the group's never closes) and shows the group's if it was shown. */
    close: (sceneId: string) => void;
    /** The workspace items of this table that have a tab now: a new one goes to the end of
     *  `tabOrder`, a closed one leaves it. */
    syncWorkspaceKeys: (keys: readonly string[]) => void;
    /** Puts the tab `key` just before `before`, or at the end when `null`; nothing goes before
     *  the group's (`GROUP_TAB` as `before` means the first after it). */
    moveTab: (key: string, before: string | null) => void;
    /** Moves the tab `key` one place left (`-1`) or right (`1`); at an end, nothing. */
    shiftTab: (key: string, step: -1 | 1) => void;
    /** The table-wide updates: activation, a tab closed by the server, the library changed. */
    apply: (update: TableSessionUpdate) => void;
    dismissNotice: () => void;
    /** Reopens the tabs this browser tab remembers for the table (after an F5): the grids at once;
     *  the workspace items wait, in their places, for whoever reopens them (`takeRestoredItems`). */
    restore: () => void;
    /** The workspace items of this table now, homes too, and the one shown (`null`: a grid): an
     *  F5 brings them back. */
    rememberItems: (items: readonly RoomItemRef[], activeItem: string | null) => void;
    /** The items the F5 left to reopen, once; `null` after, or when there were none. */
    takeRestoredItems: () => RestoredRoomItems | null;
    /** The reopening is over, `back` the item keys that came back: the others leave the order. */
    settleRestoredItems: (back: readonly string[]) => void;
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
  /** The table stream: every tab's linked tokens wear its characters, and its list of
   *  conditions is every tab's. */
  characters: StoreApi<CharactersStore>;
  watch: (sceneId: string, listener: GridListener) => GridWatchHandle;
  storage: TabStorage;
  createInteraction: CreateTabInteraction;
  /** When each board event of a tab arrived, for its server clock; `Date.now` when absent. */
  wallClock?: () => number;
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
      tabOrder: [],
      visibleKey: GROUP_TAB,
      notice: null,
      libraryRevision: 0,
      mapRevision: 0,
      sceneActivations: 0,
      arrivedAtHome: false,
      sheetChange: null,
      documentTabChange: null,
      regionShown: null,
      previousKey: null,
      open: (sceneId) => actions.open(sceneId),
      show: (key) => actions.show(key),
      noteShown: (key) => actions.noteShown(key),
      close: (sceneId) => actions.close(sceneId),
      syncWorkspaceKeys: (keys) => actions.syncWorkspaceKeys(keys),
      moveTab: (key, before) => actions.moveTab(key, before),
      shiftTab: (key, step) => actions.shiftTab(key, step),
      apply: (update) => actions.apply(update),
      dismissNotice: () => set({ notice: null }),
      restore: () => actions.restore(),
      rememberItems: (items, activeItem) => actions.rememberItems(items, activeItem),
      takeRestoredItems: () => actions.takeRestoredItems(),
      settleRestoredItems: (back) => actions.settleRestoredItems(back),
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
  private shownKey: string | null = null;
  // The workspace items as last remembered (`rememberItems`), written beside the grids.
  private items: readonly RoomItemRef[] = [];
  private activeItem: string | null = null;
  // The item keys an F5 left in the order, until their reopening settles.
  private readonly pending = new Set<string>();
  private restored: RestoredRoomItems | null = null;
  private forgotten = false; // Left on purpose: an unmounting room must not write it back.

  constructor(
    private readonly deps: SceneTabsDeps,
    private readonly set: SetTabs,
    private readonly get: GetTabs,
  ) {
    deps.groupBoard.subscribe(() => this.followGroupGrid());
    deps.characters.subscribe(() => this.relinkTabs());
  }

  groupTab(): SceneTab {
    const { groupBoard } = this.deps;
    const sceneIdOf = (): string => groupBoard.getState().board?.scene.id ?? '';
    return this.tabOf(GROUP_TAB, groupBoard, sceneIdOf);
  }

  open(sceneId: string): void {
    if (this.isGroupGrid(sceneId) || this.has(sceneId)) return this.show(this.keyOf(sceneId));
    const { tabs, tabOrder } = this.get();
    this.set({
      tabs: [...tabs, this.watchedTab(sceneId)],
      tabOrder: [...tabOrder, sceneId],
      visibleKey: sceneId,
    });
    this.remember();
  }

  show(key: string): void {
    if (!this.has(key) && key !== GROUP_TAB) return;
    this.set({ visibleKey: key });
    this.remember();
  }

  noteShown(key: string): void {
    const before = this.shownKey;
    if (key === before) return;
    // Set first: a subscriber of `previousKey` notes the room again, and must see it done.
    this.shownKey = key;
    if (before !== null) this.set({ previousKey: before });
  }

  close(sceneId: string): void {
    if (!this.has(sceneId)) return;
    this.drop(sceneId);
    this.remember();
  }

  syncWorkspaceKeys(keys: readonly string[]): void {
    const keep = (key: string): boolean => this.has(key) || this.pending.has(key);
    this.reorder(syncedTabOrder(this.get().tabOrder, keep, keys));
  }

  // While the F5's items are on their way, what they were stays remembered.
  rememberItems(items: readonly RoomItemRef[], activeItem: string | null): void {
    const known = new Set(items.map(({ key }) => key));
    const waiting = this.items.filter(({ key }) => this.pending.has(key) && !known.has(key));
    const next = [...items, ...waiting];
    const active = this.pending.size > 0 ? this.activeItem : activeItem;
    if (active === this.activeItem && sameRoomItemRefs(next, this.items)) return;
    this.items = next;
    this.activeItem = active;
    this.remember();
  }

  takeRestoredItems(): RestoredRoomItems | null {
    const restored = this.restored;
    this.restored = null;
    return restored;
  }

  // Only the ones that did not come back leave: the strip may not be there to sync (focus mode).
  settleRestoredItems(back: readonly string[]): void {
    const { tabOrder } = this.get();
    const kept = tabOrder.filter((key) => !this.pending.has(key) || back.includes(key));
    this.pending.clear();
    if (kept.length !== tabOrder.length) this.reorder(kept);
  }

  // The group's tab is no part of the order: before it means the first after it.
  moveTab(key: string, before: string | null): void {
    const { tabOrder } = this.get();
    const to = before === GROUP_TAB ? (tabOrder[0] ?? null) : before;
    this.reorder(insertedTabOrder(tabOrder, key, to));
  }

  shiftTab(key: string, step: -1 | 1): void {
    this.reorder(shiftedTabOrder(this.get().tabOrder, key, step));
  }

  apply(update: TableSessionUpdate): void {
    if (update.kind === 'sceneActivated') return this.onActivated(update.event);
    if (update.kind === 'sceneClosed') return this.onClosed(update.event);
    if (update.kind === 'pinged') return groupTabOf(this.get()).pings.push(update.event);
    if (update.kind === 'sheetChanged') return this.set({ sheetChange: update.event });
    if (update.kind === 'documentTabChanged') return this.set({ documentTabChange: update.event });
    if (update.kind === 'mapChanged') return this.set({ mapRevision: this.get().mapRevision + 1 });
    if (update.kind === 'mapRegionShown') return this.set({ regionShown: update.event });
    if (update.kind === 'libraryChanged') {
      this.set({ libraryRevision: this.get().libraryRevision + 1 });
    }
  }

  restore(): void {
    const stored = readSceneTabs(this.deps.storage, this.deps.campaignId);
    if (!stored) return;
    this.holdItems(stored);
    for (const sceneId of stored.sceneIds) this.open(sceneId);
    const { tabOrder } = this.get();
    this.reorder(restoredTabOrder(stored.order ?? tabOrder, tabOrder, this.pending));
    this.show(stored.visible);
  }

  // Set before the grids reopen: each one writes the record again, the items in it.
  private holdItems(stored: StoredSceneTabs): void {
    if (stored.items === undefined) return;
    this.items = stored.items;
    this.activeItem = stored.activeItem ?? null;
    for (const { key } of stored.items) this.pending.add(key);
    const order = stored.order ?? [];
    this.restored = { items: stored.items, activeItem: this.activeItem, order };
    this.set({ arrivedAtHome: true });
  }

  dispose(forget: boolean): void {
    for (const handle of this.watches.values()) handle.close();
    this.watches.clear();
    if (!forget) return;
    this.forgotten = true;
    forgetSceneTabs(this.deps.storage, this.deps.campaignId);
  }

  private watchedTab(sceneId: string): SceneTab {
    const board = createBoardStore(
      this.deps.campaignId,
      () => this.watches.get(sceneId)?.resync(),
      tableLinksOf(this.deps.characters),
      this.deps.wallClock,
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
    this.set({ visibleKey: GROUP_TAB, sceneActivations: this.get().sceneActivations + 1 });
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

  // The tab-order helpers hand back the same array when nothing moved.
  private reorder(next: readonly string[]): void {
    if (next === this.get().tabOrder) return;
    this.set({ tabOrder: next });
    this.remember();
  }

  private drop(sceneId: string): void {
    this.watches.get(sceneId)?.close();
    this.watches.delete(sceneId);
    const { tabs, tabOrder, visibleKey } = this.get();
    const shown = visibleKey === sceneId ? GROUP_TAB : visibleKey;
    this.set({
      tabs: tabs.filter(({ key }) => key !== sceneId),
      tabOrder: tabOrder.filter((key) => key !== sceneId),
      visibleKey: shown,
    });
  }

  private remember(): void {
    if (this.forgotten) return;
    const { tabOrder, visibleKey } = this.get();
    // In the strip's order: an F5 opens them again one by one, each at the end.
    const sceneIds = tabOrder.filter((key) => this.has(key));
    writeSceneTabs(this.deps.storage, this.deps.campaignId, {
      sceneIds,
      visible: visibleKey,
      order: tabOrder,
      items: this.items,
      activeItem: this.activeItem,
    });
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

// A patrolling token is undone back to where it showed, not to the origin saved with its patrol.
function cellOfToken(board: StoreApi<BoardStore>, tokenId: string): Cell | null {
  const { board: state, patrol } = board.getState();
  const token = state?.tokens.find(({ id }) => id === tokenId);
  if (!token) return null;
  const { col, row } = posedTokenOf(token, patrol.poses);
  return { col, row };
}
