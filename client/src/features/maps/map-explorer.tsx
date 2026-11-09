import type { LibraryMapDetailDto } from '@lorkarium/contracts';
import { useRef, type KeyboardEvent } from 'react';
import type { AppDependencies } from '@/app/router';
import { Button } from '@/components/ui/button';
import { ImageViewerModal } from '@/features/library/image-viewer';
import type { MapWorkspaceEntry } from '@/stores/document-workspace-store';
import { useMapView } from '@/stores/map-view-store';
import { MapCanvas } from './map-canvas';
import { MapEditorSurface, MapRegionEditButton } from './map-editor';
import { MapPlacesList } from './map-places-list';
import { MapRegionCard } from './map-region-card';
import { MapRegionShowButton } from './map-region-show-button';
import { MapTrail } from './map-trail';
import { useMapCardPlacement } from './use-map-card-placement';
import { useMapEditor } from './use-map-editor';
import { useMapRegionOpen, type MapRegionOpening } from './use-map-region-open';

export type MapExplorerProps = Readonly<{
  deps: AppDependencies;
  entry: MapWorkspaceEntry;
  map: LibraryMapDetailDto;
}>;

/** What a reader does on a map: the card of a region, opening what it links to, the trail between
 *  maps and the list of places.
 *
 *  Example: `<MapExplorer deps={deps} entry={entry} map={map} />` */
export function MapExplorer({ deps, entry, map }: MapExplorerProps): React.JSX.Element {
  const { view, campaign } = entry;
  const opening = useMapRegionOpen({ deps, campaign, view });
  const editor = useMapEditor({ deps, entry, map });
  const selectedId = useMapView(view, (state) => state.selectedRegionId);
  const selected = map.regions.find((region) => region.id === selectedId) ?? null;
  const cardPlacement = useMapCardPlacement(view, map.asset, selected);
  const panel = useRef<HTMLDivElement>(null);
  const closeCard = (): void => {
    view.getState().selectRegion(null);
    regionElementIn(panel.current, selectedId)?.focus();
  };
  const answerKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !selected) return;
    event.stopPropagation();
    closeCard();
  };
  return (
    <div ref={panel} onKeyDown={answerKey} className="flex min-h-0 flex-1 flex-col">
      <ExplorerTrail entry={entry} map={map} opening={opening} />
      <div className="relative flex min-h-0 flex-1">
        <MapCanvas
          key={map.id}
          map={editor.shownMap}
          view={view}
          onSelectRegion={(region, clickedAt) => view.getState().selectRegion(region.id, clickedAt)}
          onOpenRegion={editor.editing ? undefined : opening.openRegion}
          editing={editor.canvas}
        />
        <MapPlacesList
          key={`places-${map.id}`}
          regions={map.regions}
          onChoose={(region) => view.getState().focusRegion(region.id)}
        />
        <MapEditorSurface deps={deps} entry={entry} map={map} editor={editor} selected={selected} />
        {selected && !editor.editing && (
          <MapRegionCard
            key={selected.id}
            placement={cardPlacement}
            region={selected}
            onOpen={() => opening.openRegion(selected)}
            onClose={closeCard}
            actions={
              editor.master && (
                <>
                  <MapRegionShowButton
                    api={deps.libraryMapsApi}
                    campaignId={campaign.id}
                    mapId={map.id}
                    regionId={selected.id}
                  />
                  <MapRegionEditButton editor={editor} />
                </>
              )
            }
          />
        )}
        {opening.problem && (
          <ExplorerProblem message={opening.problem} onDismiss={opening.dismissProblem} />
        )}
      </div>
      {opening.image && <ImageViewerModal image={opening.image} onClose={opening.closeImage} />}
    </div>
  );
}

function regionElementIn(panel: HTMLElement | null, regionId: string | null): SVGGElement | null {
  return panel?.querySelector<SVGGElement>(`[data-region-id="${regionId}"]`) ?? null;
}

function ExplorerTrail({
  entry,
  map,
  opening,
}: Readonly<{
  entry: MapWorkspaceEntry;
  map: LibraryMapDetailDto;
  opening: MapRegionOpening;
}>): React.JSX.Element {
  const { view } = entry;
  const trail = useMapView(view, (state) => state.trail);
  const returnTo = (index: number): void => {
    const label = trail[index]?.name ?? map.name;
    void view
      .getState()
      .returnTo(index)
      .then((outcome) => opening.reportTravel(outcome, label));
  };
  return (
    <MapTrail
      trail={trail}
      current={map.name}
      onBack={() => returnTo(trail.length - 1)}
      onReturnTo={returnTo}
    />
  );
}

function ExplorerProblem({
  message,
  onDismiss,
}: Readonly<{ message: string; onDismiss: () => void }>): React.JSX.Element {
  return (
    <div
      role="alert"
      className="absolute top-3 left-1/2 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-md border border-divider bg-panel px-3 py-1.5 text-sm shadow-lg"
    >
      <p className="min-w-0 flex-1">{message}</p>
      <Button size="sm" variant="ghost" onClick={onDismiss}>
        Entendi
      </Button>
    </div>
  );
}
