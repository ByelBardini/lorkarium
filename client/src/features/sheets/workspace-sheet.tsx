import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';
import type { AppDependencies } from '@/app/router';
import { WorkspaceItemSurface } from '@/features/documents/workspace-item-surface';
import { useOpenTable } from '@/features/sessions/use-open-table';
import {
  characterSource,
  firstTokenSource,
  type SheetHolderSource,
} from '@/sheet-sandbox/sheet-token-source';
import { workspaceItemTitle, type SheetWorkspaceEntry } from '@/stores/document-workspace-store';
import { useOpenTables, type OpenTable } from '@/stores/open-tables-store';
import type { SceneTab, SceneTabsStore } from '@/stores/scene-tabs-store';
import type { SheetStoreState } from '@/stores/sheet-store';
import { SheetPanel, type SheetPanelServices } from './sheet-panel';

/** One open sheet of the workspace: its panel in the room tab or its window, `sheet:changed` of
 *  its table handed to its store, and its holder read from the table's characters (a character's
 *  sheet) or its open grids (a loose token's).
 *
 *  Example: `{sheets.map((entry) => <WorkspaceSheet key={entry.key} deps={deps} entry={entry} />)}` */
export function WorkspaceSheet({
  deps,
  entry,
}: Readonly<{ deps: AppDependencies; entry: SheetWorkspaceEntry }>): React.JSX.Element {
  useOpenTable(entry.campaign, deps.openTables);
  const table = useOpenTables(
    deps.openTables,
    (state) => state.tables.find((open) => open.campaignId === entry.campaign.id) ?? null,
  );
  useForwardSheetChanges(table?.tabs ?? null, entry.store);
  const tokens = useSheetTokenSource(table, entry.store);
  const services = useMemo<SheetPanelServices>(
    () => ({
      sheetsApi: deps.sheetsApi,
      sheetCommands: deps.sheetCommands,
      dice: deps.dice,
      clock: deps.interactionClock,
      now: deps.now,
    }),
    [deps.sheetsApi, deps.sheetCommands, deps.dice, deps.interactionClock, deps.now],
  );
  return (
    <WorkspaceItemSurface deps={deps} item={entry} detachedLabel="Ficha aberta em outra janela.">
      {(surface) => (
        <SheetPanel
          campaignId={entry.campaign.id}
          title={workspaceItemTitle(entry)}
          store={entry.store}
          tokens={tokens}
          services={services}
          compact={surface.detached}
          onOpenWindow={surface.openWindow}
          onClose={surface.close}
        />
      )}
    </WorkspaceItemSurface>
  );
}

function useForwardSheetChanges(
  tabs: StoreApi<SceneTabsStore> | null,
  store: StoreApi<SheetStoreState>,
): void {
  useEffect(
    () =>
      tabs?.subscribe((state, previous) => {
        if (state.sheetChange && state.sheetChange !== previous.sheetChange)
          store.getState().changed(state.sheetChange);
      }),
    [tabs, store],
  );
}

const NO_TABS: readonly SceneTab[] = [];

// A character's sheet names its player (`memberId`); a loose token is on one of the grids open here.
function useSheetTokenSource(
  table: OpenTable | null,
  store: StoreApi<SheetStoreState>,
): SheetHolderSource | null {
  const tokenId = useStore(store, (state) => state.sheet?.tokenId ?? null);
  const memberId = useStore(store, (state) => state.sheet?.memberId ?? null);
  const tabs = useSceneTabsOf(table?.tabs ?? null);
  return useMemo(() => {
    if (!table) return null;
    if (memberId) return characterSource(table.characters, memberId);
    return tokenId
      ? firstTokenSource(
          tabs.map((tab) => tab.board),
          tokenId,
        )
      : null;
  }, [table, tokenId, memberId, tabs]);
}

function useSceneTabsOf(tabs: StoreApi<SceneTabsStore> | null): readonly SceneTab[] {
  const subscribe = useCallback(
    (onChange: () => void) => tabs?.subscribe(onChange) ?? (() => undefined),
    [tabs],
  );
  return useSyncExternalStore(subscribe, () => tabs?.getState().tabs ?? NO_TABS);
}
