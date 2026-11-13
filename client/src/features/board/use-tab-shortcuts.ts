import { useEffect, useMemo } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { tabShortcutFor, type TabShortcut } from '@/lib/board-shortcuts';
import { neighbourTab, nthTab, roomTabOrder, type RoomTab } from '@/lib/room-tab-order';
import type { DocumentWorkspaceStore, WorkspaceItem } from '@/stores/document-workspace-store';
import { GROUP_TAB, type SceneTabsStore } from '@/stores/scene-tabs-store';
import { tabbedWorkspaceItems } from './room-tab-items';

/** The two stores that together hold the room's tabs: the grids and the workspace items. */
export type RoomTabsDeps = Readonly<{
  campaignId: string;
  tabs: StoreApi<SceneTabsStore>;
  workspace: StoreApi<DocumentWorkspaceStore>;
  /** The viewer's main sheet: a home like the main map, with no tab of its own. */
  mainSheetKey?: string | null;
}>;

/** The key the room shows now: the active workspace item, or else the grid tab shown.
 *
 *  Example: `roomShownKey(deps) // 'group'` */
export function roomShownKey(deps: RoomTabsDeps): string {
  const active = deps.workspace.getState().activeByCampaign[deps.campaignId] ?? null;
  return active ?? deps.tabs.getState().visibleKey;
}

/** Shows a room tab by its key, a grid's or a workspace item's; `false` when it is not open.
 *
 *  Example: `showRoomTab(deps, 'torre')` */
export function showRoomTab(deps: RoomTabsDeps, key: string): boolean {
  const { campaignId, tabs, workspace } = deps;
  if (key === GROUP_TAB || tabs.getState().tabs.some((tab) => tab.key === key)) {
    workspace.getState().activate(campaignId, null);
    tabs.getState().show(key);
    return true;
  }
  if (!itemsOf(deps).some((item) => item.key === key)) return false;
  workspace.getState().activate(campaignId, key);
  return true;
}

/** Shows the tab shown before the current one; `false` (nothing moves) when it was closed.
 *
 *  Example: `showPreviousRoomTab(deps)` */
export function showPreviousRoomTab(deps: RoomTabsDeps): boolean {
  const previous = deps.tabs.getState().previousKey;
  if (previous === null || previous === roomShownKey(deps)) return false;
  return showRoomTab(deps, previous);
}

export type TabShortcutsInput = Readonly<{
  campaignId: string;
  /** `null` until the table opens. */
  tabs: StoreApi<SceneTabsStore> | null;
  workspace: StoreApi<DocumentWorkspaceStore> | undefined;
  mainSheetKey?: string | null;
  /** Only the desktop shell binds the keys: a browser keeps them for its own tabs. */
  desktop: boolean;
}>;

/** Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+1–9 and Ctrl+W over the room's tabs, in the desktop shell. In
 *  any shell it keeps the store's `previousKey` up to date, for Shift+M and Shift+F to go back.
 *
 *  Example: `useTabShortcuts({ campaignId, tabs, workspace, desktop: isDesktopShell(navigator.userAgent) })` */
export function useTabShortcuts(input: TabShortcutsInput): void {
  const { campaignId, tabs, workspace, desktop, mainSheetKey = null } = input;
  const deps = useMemo(
    () => (tabs && workspace ? { campaignId, tabs, workspace, mainSheetKey } : null),
    [campaignId, tabs, workspace, mainSheetKey],
  );
  useNoteShownTab(deps);
  useEffect(() => {
    if (!deps || !desktop) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      const shortcut = tabShortcutFor(event);
      if (!shortcut) return;
      event.preventDefault();
      if (!event.repeat || shortcut !== 'close-tab') runTabShortcut(deps, shortcut);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deps, desktop]);
}

function useNoteShownTab(deps: RoomTabsDeps | null): void {
  useEffect(() => {
    if (!deps) return;
    const note = (): void => deps.tabs.getState().noteShown(roomShownKey(deps));
    note();
    const fromTabs = deps.tabs.subscribe(note);
    const fromWorkspace = deps.workspace.subscribe(note);
    return () => {
      fromTabs();
      fromWorkspace();
    };
  }, [deps]);
}

function runTabShortcut(deps: RoomTabsDeps, shortcut: TabShortcut): void {
  const order = orderOf(deps);
  const shown = roomShownKey(deps);
  if (shortcut === 'close-tab') return void closeRoomTab(deps, order, shown);
  const target =
    typeof shortcut === 'object'
      ? nthTab(order, shortcut.nth)
      : neighbourTab(order, shown, shortcut === 'next-tab' ? 1 : -1);
  if (target) showRoomTab(deps, target.key);
}

async function closeRoomTab(deps: RoomTabsDeps, order: readonly RoomTab[], shown: string) {
  const tab = order.find(({ key }) => key === shown);
  if (!tab?.closable) return;
  const before = neighbourTab(order, shown, -1);
  const isGrid = deps.tabs.getState().tabs.some(({ key }) => key === shown);
  if (isGrid) deps.tabs.getState().close(shown);
  else if (!(await deps.workspace.getState().close(shown))) return;
  if (before) showRoomTab(deps, before.key);
}

// The strip's order (`tabOrder`), so the keys walk the tabs as they are on screen.
function orderOf(deps: RoomTabsDeps): readonly RoomTab[] {
  const { tabs, tabOrder } = deps.tabs.getState();
  const items = tabbedWorkspaceItems(
    deps.workspace.getState(),
    deps.campaignId,
    deps.mainSheetKey ?? null,
  );
  return roomTabOrder({
    groupKey: GROUP_TAB,
    order: tabOrder,
    openKeys: [
      ...tabs.flatMap(({ key }) => (key === GROUP_TAB ? [] : [key])),
      ...items.map(({ key }) => key),
    ],
  });
}

// Every item of this table, homes too: a home is shown by its key, though it has no tab.
function itemsOf({ workspace, campaignId }: RoomTabsDeps): readonly WorkspaceItem[] {
  const { entries, sheets, templates, maps } = workspace.getState();
  return [...entries, ...sheets, ...templates, ...maps].filter(
    (item) => item.campaign.id === campaignId,
  );
}
