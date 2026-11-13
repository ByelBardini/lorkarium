import { useEffect } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { DocumentWorkspaceStore, WorkspaceItem } from '@/stores/document-workspace-store';
import type { SceneTabsStore } from '@/stores/scene-tabs-store';

type WorkspaceLists = Pick<DocumentWorkspaceStore, 'entries' | 'sheets' | 'templates' | 'maps'>;

/** The workspace items of a table that get a room tab: all but its homes, the main map (the
 *  table's name plays it) and the viewer's main sheet (its button beside the name).
 *
 *  Example: `tabbedWorkspaceItems(workspace.getState(), campaignId, mainSheetKey)` */
export function tabbedWorkspaceItems(
  lists: WorkspaceLists,
  campaignId: string | undefined,
  mainSheetKey: string | null,
): readonly WorkspaceItem[] {
  const { entries, sheets, templates, maps } = lists;
  return [...entries, ...sheets, ...templates, ...maps].filter(
    (item) =>
      item.campaign.id === campaignId &&
      !(item.kind === 'map' && item.showsMainMap) &&
      item.key !== mainSheetKey,
  );
}

export type RoomTabOrderSyncInput = Readonly<{
  tabs: StoreApi<SceneTabsStore>;
  workspace: StoreApi<DocumentWorkspaceStore> | undefined;
  campaignId: string | undefined;
  mainSheetKey: string | null;
}>;

/** Keeps the table's `tabOrder` up with the workspace, as each item opens or closes: at once, by
 *  the store's subscription, so a grid opened right after a document goes after it.
 *
 *  Example: `useRoomTabOrderSync({ tabs, workspace, campaignId, mainSheetKey })` */
export function useRoomTabOrderSync(input: RoomTabOrderSyncInput): void {
  const { tabs, workspace, campaignId, mainSheetKey } = input;
  useEffect(() => {
    if (!workspace) return;
    const sync = (): void => {
      const items = tabbedWorkspaceItems(workspace.getState(), campaignId, mainSheetKey);
      tabs.getState().syncWorkspaceKeys(items.map(({ key }) => key));
    };
    sync();
    return workspace.subscribe(sync);
  }, [tabs, workspace, campaignId, mainSheetKey]);
}
