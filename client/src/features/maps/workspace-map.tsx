import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { StoreApi } from 'zustand/vanilla';
import type { AppDependencies } from '@/app/router';
import { Button } from '@/components/ui/button';
import { useOpenTable } from '@/features/sessions/use-open-table';
import type { MapWorkspaceEntry } from '@/stores/document-workspace-store';
import { useMapView, type MapViewState } from '@/stores/map-view-store';
import { useOpenTables, type OpenTable } from '@/stores/open-tables-store';
import type { SceneTabsState } from '@/stores/scene-tabs-store';
import { useSession } from '@/stores/session-store';
import type { TablePresenceState } from '@/stores/table-presence-store';
import { MapExplorer } from './map-explorer';

/** The table's map tab: its panel in the room while the tab is shown (a map has no window of its
 *  own), and the map read again whenever what this reader may see of it can have changed.
 *
 *  Example: `{maps.map((entry) => <WorkspaceMap key={entry.key} deps={deps} entry={entry} />)}` */
export function WorkspaceMap({
  deps,
  entry,
}: Readonly<{ deps: AppDependencies; entry: MapWorkspaceEntry }>): React.JSX.Element | null {
  useOpenTable(entry.campaign, deps.openTables);
  useMapRereads(deps, entry);
  if (!entry.target) return null;
  return createPortal(<WorkspaceMapPanel deps={deps} entry={entry} />, entry.target);
}

function WorkspaceMapPanel({
  deps,
  entry,
}: Readonly<{ deps: AppDependencies; entry: MapWorkspaceEntry }>): React.JSX.Element {
  const { view } = entry;
  const status = useMapView(view, (state) => state.status);
  const map = useMapView(view, (state) => state.map);
  if (map) return <MapExplorer deps={deps} entry={entry} map={map} />;
  if (status === 'failed') {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
        <p role="alert">Não deu para abrir o mapa.</p>
        <Button onClick={() => void view.getState().load()}>Tentar de novo</Button>
      </div>
    );
  }
  return (
    <p role="status" className="m-auto text-sm text-muted-foreground">
      Carregando mapa…
    </p>
  );
}

function useMapRereads(deps: AppDependencies, entry: MapWorkspaceEntry): void {
  const { view, campaign } = entry;
  const table = useOpenTables(
    deps.openTables,
    (state) => state.tables.find((open) => open.campaignId === campaign.id) ?? null,
  );
  const session = useSession(deps.sessionStore);
  const userId = session.status === 'authenticated' ? session.user.id : '';
  useEffect(() => followTableChanges(table, view), [table, view]);
  useEffect(() => followReaderChanges(table, view, userId), [table, view, userId]);
}

function followTableChanges(
  table: OpenTable | null,
  view: StoreApi<MapViewState>,
): (() => void) | undefined {
  return table?.tabs.subscribe((state, previous) => {
    if (changedLibrary(state, previous)) void view.getState().load();
  });
}

function changedLibrary(state: SceneTabsState, previous: SceneTabsState): boolean {
  return (
    state.libraryRevision !== previous.libraryRevision || state.mapRevision !== previous.mapRevision
  );
}

// Back from a dropped connection (what was written meanwhile told nobody), or with another role
// (a master who stops being one must lose the hidden regions).
function followReaderChanges(
  table: OpenTable | null,
  view: StoreApi<MapViewState>,
  userId: string,
): (() => void) | undefined {
  return table?.presence.subscribe((state, previous) => {
    const cameBack = state.status === 'live' && previous.status !== 'live';
    if (cameBack || readerRoleIn(state, userId) !== readerRoleIn(previous, userId))
      void view.getState().load();
  });
}

function readerRoleIn(state: TablePresenceState, userId: string): string | undefined {
  return state.members.find((member) => member.userId === userId)?.role;
}
