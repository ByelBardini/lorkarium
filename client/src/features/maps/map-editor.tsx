import type { LibraryMapDetailDto, MapRegionDto } from '@lorkarium/contracts';
import type { KeyboardEvent } from 'react';
import type { AppDependencies } from '@/app/router';
import { Button } from '@/components/ui/button';
import type { MapWorkspaceEntry } from '@/stores/document-workspace-store';
import { useMapDrawingFlow } from '@/stores/map-drawing-flow';
import { MapEditorToolbar } from './map-editor-toolbar';
import { MapRegionForm } from './map-region-form';
import type { MapEditor } from './use-map-editor';

export type MapEditorSurfaceProps = Readonly<{
  deps: AppDependencies;
  entry: MapWorkspaceEntry;
  map: LibraryMapDetailDto;
  editor: MapEditor;
  /** The place chosen, as the server confirmed it. */
  selected: MapRegionDto | null;
}>;

/** The master's column over a map: the way into the editor, the tools and the data of the place
 *  chosen. It lets the clicks through where it has nothing, for the map under it.
 *
 *  Example: `<MapEditorSurface deps={deps} entry={entry} map={map} editor={editor} selected={place} />` */
export function MapEditorSurface(props: MapEditorSurfaceProps): React.JSX.Element | null {
  const { editor } = props;
  if (!editor.master) return null;
  return (
    <div className="pointer-events-none absolute top-12 right-3 bottom-3 z-10 flex w-80 max-w-[calc(100%-1.5rem)] flex-col items-end gap-2 *:pointer-events-auto">
      <MapEditorToolbar editor={editor} />
      {editor.editing && <SelectedPlaceForm {...props} />}
    </div>
  );
}

function SelectedPlaceForm(props: MapEditorSurfaceProps): React.JSX.Element | null {
  const { deps, entry, map, editor, selected } = props;
  const drawing = useMapDrawingFlow(editor.flow, (state) => state.tool !== null);
  if (!selected || drawing) return null;
  const { view, campaign } = entry;
  return (
    <div
      onKeyDown={keepEscapeInTheForm}
      className="flex min-h-0 w-full flex-col gap-3 overflow-y-auto rounded-md border border-border bg-popover p-3 text-sm text-popover-foreground shadow-lg"
    >
      {editor.failed && (
        <p role="alert" className="text-destructive-text">
          Não deu para ler a biblioteca: a lista de itens pode estar incompleta.
        </p>
      )}
      <MapRegionForm
        api={deps.libraryMapsApi}
        campaignId={campaign.id}
        mapId={map.id}
        region={selected}
        library={editor.library}
        documents={deps.documentsApi}
        live={editor.live}
        onRegionChanged={(region) => view.getState().applyRegion(map.id, region)}
        onRegionRemoved={(regionId) => view.getState().dropRegion(map.id, regionId)}
      />
    </div>
  );
}

// Esc in a field undoes the field, and in the dialog it closes the dialog: neither closes the form.
function keepEscapeInTheForm(event: KeyboardEvent): void {
  if (event.key === 'Escape') event.stopPropagation();
}

/** "Editar lugar", on the card of a place: opens the editor with that place chosen.
 *
 *  Example: `<MapRegionEditButton editor={editor} />` */
export function MapRegionEditButton({
  editor,
}: Readonly<{ editor: MapEditor }>): React.JSX.Element {
  return (
    <Button size="sm" variant="outline" disabled={!editor.live} onClick={editor.open}>
      Editar lugar
    </Button>
  );
}
