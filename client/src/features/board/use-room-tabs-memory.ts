import type { CampaignDetailDto, CampaignLibraryDto } from '@lorkarium/contracts';
import { useEffect } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { fallbackTabKey } from '@/lib/room-tab-order';
import type { LibraryApi } from '@/services/library-api';
import type { DocumentWorkspaceStore, WorkspaceItem } from '@/stores/document-workspace-store';
import type { SceneTabsStore } from '@/stores/scene-tabs-store';
import type { RestoredRoomItems, RoomItemRef } from '@/stores/scene-tabs-storage';

export type RoomTabsMemoryInput = Readonly<{
  /** `null` until the table opens. */
  tabs: StoreApi<SceneTabsStore> | null;
  workspace: StoreApi<DocumentWorkspaceStore> | undefined;
  campaign: CampaignDetailDto;
  /** What the viewer may see of the library now; `null` outside a room (nothing comes back). */
  library: Pick<LibraryApi, 'list'> | null;
}>;

type MemoryDeps = Readonly<{
  tabs: StoreApi<SceneTabsStore>;
  workspace: StoreApi<DocumentWorkspaceStore>;
  campaign: CampaignDetailDto;
  library: Pick<LibraryApi, 'list'> | null;
}>;

/** The room's workspace items across an F5: each change is remembered with the grid tabs, and
 *  after an F5 the items come back from the library as it is now, in their places, the one shown
 *  too. An item gone or no longer visible to the viewer is left out quietly, and the room shows
 *  the tab beside it (or the grid) instead.
 *
 *  Example: `useRoomTabsMemory({ tabs, workspace, campaign, library: sheetRoom?.libraryApi ?? null })` */
export function useRoomTabsMemory(input: RoomTabsMemoryInput): void {
  const { tabs, workspace, campaign, library } = input;
  useEffect(() => {
    if (!tabs || !workspace) return;
    const deps: MemoryDeps = { tabs, workspace, campaign, library };
    const remember = (): void => rememberRoomItems(deps);
    // Taken once: the reopening finishes even if the room unmounts meanwhile.
    const restored = tabs.getState().takeRestoredItems();
    if (restored) void reopenRoomItems(deps, restored).then(remember);
    remember();
    return workspace.subscribe(remember);
  }, [tabs, workspace, campaign, library]);
}

function rememberRoomItems({ tabs, workspace, campaign }: MemoryDeps): void {
  const state = workspace.getState();
  const items = workspaceItemsOf(state, campaign.id).map(roomItemRefOf);
  tabs.getState().rememberItems(items, state.activeByCampaign[campaign.id] ?? null);
}

function workspaceItemsOf(state: DocumentWorkspaceStore, campaignId: string): WorkspaceItem[] {
  const { entries, sheets, templates, maps } = state;
  return [...entries, ...sheets, ...templates, ...maps].filter(
    (item) => item.campaign.id === campaignId,
  );
}

/** What an F5 remembers of a workspace item: its kind, its id in the library and its tab's key.
 *
 *  Example: `roomItemRefOf(entry) // { kind: 'document', id: documentId, key: entry.key }` */
export function roomItemRefOf(item: WorkspaceItem): RoomItemRef {
  const { kind, key } = item;
  if (kind === 'document') return { kind, key, id: item.document.id };
  if (kind === 'sheet') return { kind, key, id: item.sheetId };
  if (kind === 'sheet-template') return { kind, key, id: item.templateId };
  return { kind, key, id: item.view.getState().mapId };
}

// A library that cannot be read brings nothing back; the room carries on with its grids.
async function reopenRoomItems(deps: MemoryDeps, restored: RestoredRoomItems): Promise<void> {
  const answer = await deps.library?.list(deps.campaign.id).catch(() => null);
  if (answer?.ok) for (const ref of restored.items) reopenItem(deps, answer.value, ref);
  const back = workspaceItemsOf(deps.workspace.getState(), deps.campaign.id);
  deps.tabs.getState().settleRestoredItems(back.map(({ key }) => key));
  showRestoredActive(deps, restored);
}

type Reopen = (deps: MemoryDeps, library: CampaignLibraryDto, id: string) => void;

// Each one only if the library, as the viewer sees it now, still has it.
const REOPEN: Readonly<Record<RoomItemRef['kind'], Reopen>> = {
  document: ({ workspace, campaign }, library, id) => {
    const document = library.documents.find((item) => item.id === id);
    if (document) workspace.getState().open({ campaign, document });
  },
  sheet: ({ workspace, campaign }, library, id) => {
    const sheet = library.sheets?.find((item) => item.id === id);
    if (sheet) workspace.getState().openSheet({ campaign, sheetId: id, sheetName: sheet.name });
  },
  'sheet-template': ({ workspace, campaign }, library, id) => {
    const template = library.sheetTemplates?.find((item) => item.id === id);
    if (!template) return;
    workspace
      .getState()
      .openSheetTemplate({ campaign, templateId: id, templateName: template.name });
  },
  map: ({ workspace, campaign }, library, id) => {
    const map = library.maps.find((item) => item.id === id);
    if (!map) return;
    const showsMainMap = map.id === library.mainMapId;
    workspace.getState().openMap({ campaign, mapId: id, mapName: map.name, showsMainMap });
  },
};

function reopenItem(deps: MemoryDeps, library: CampaignLibraryDto, ref: RoomItemRef): void {
  REOPEN[ref.kind](deps, library, ref.id);
}

// Each item reopened was shown as it opened: the room goes back to what it showed, or beside it.
function showRestoredActive(
  { tabs, workspace, campaign }: MemoryDeps,
  restored: RestoredRoomItems,
): void {
  const open = new Set(workspaceItemsOf(workspace.getState(), campaign.id).map(({ key }) => key));
  const isGrid = (key: string): boolean => tabs.getState().tabs.some((tab) => tab.key === key);
  const { activeItem, order } = restored;
  const target =
    activeItem === null || open.has(activeItem)
      ? activeItem
      : fallbackTabKey(order, activeItem, (key) => open.has(key) || isGrid(key));
  if (target !== null && open.has(target))
    return workspace.getState().activate(campaign.id, target);
  workspace.getState().activate(campaign.id, null);
  if (target !== null) tabs.getState().show(target);
}
