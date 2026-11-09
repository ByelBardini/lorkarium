import { MAP_NAME_MAX_LENGTH, type LibraryMapSummaryDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { SegmentField } from '@/components/segment-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDraftField } from '@/lib/use-draft-field';
import { assetUrlOf } from '@/services/assets-api';
import { DeleteMapDialog } from './library-map-menu';
import type { LibrarySubmit } from './use-library-submit';

export type MapDetailsProps = Readonly<{
  map: LibraryMapSummaryDto;
  isMaster: boolean;
  live: boolean;
  /** Marking or unmarking the main map is on its way. */
  mainPending: boolean;
  submit: LibrarySubmit;
  onOpen: () => void;
}>;

/** The map picked in the library: its image, the master's name, who sees it, the main mark and
 *  delete, and "Abrir" (the room's map tab) for everyone.
 *
 *  Example: `<MapDetails map={map} isMaster live mainPending={false} submit={submit} onOpen={open} />` */
export function MapDetails(props: MapDetailsProps): React.JSX.Element {
  const { map, isMaster, live } = props;
  const [deleting, setDeleting] = useState(false);
  return (
    <section
      aria-label="Mapa escolhido"
      className="flex min-h-0 flex-col gap-5 overflow-y-auto border-l border-border bg-panel p-5"
    >
      <img
        src={assetUrlOf(map.asset.id)}
        alt={map.name}
        className="max-h-52 w-full rounded-md object-contain"
      />
      {map.isMain && <p className="text-xs font-semibold text-primary">Principal</p>}
      {isMaster ? (
        <MapMasterFields {...props} />
      ) : (
        <h2 className="font-display text-xl">{map.name}</h2>
      )}
      <Button variant="outline" onClick={props.onOpen}>
        Abrir
      </Button>
      {isMaster && (
        <Button variant="ghost" disabled={!live} onClick={() => setDeleting(true)}>
          Excluir mapa
        </Button>
      )}
      {deleting && (
        <DeleteMapDialog map={map} submit={props.submit} onClose={() => setDeleting(false)} />
      )}
    </section>
  );
}

function MapMasterFields({ map, live, mainPending, submit }: MapDetailsProps): React.JSX.Element {
  const binding = useDraftField({
    confirmed: map.name,
    save: async (draft) => {
      const name = draft.trim();
      if (!name) return false;
      await submit({ intent: 'updateMap', mapId: map.id, changes: { name } });
      return true;
    },
  });
  return (
    <>
      <label>
        Nome do mapa
        <Input {...binding} disabled={!live} maxLength={MAP_NAME_MAX_LENGTH} />
      </label>
      <SegmentField
        legend="Quem vê na biblioteca"
        fill
        value={map.visibility}
        options={[
          { value: 'private', label: 'Privado', disabled: !live },
          { value: 'public', label: 'Público', disabled: !live },
        ]}
        onChange={(visibility) =>
          void submit({ intent: 'updateMap', mapId: map.id, changes: { visibility } })
        }
      />
      <MainMapNotice map={map} />
      <Button
        disabled={!live || mainPending}
        onClick={() =>
          void submit({ intent: map.isMain ? 'unsetMainMap' : 'setMainMap', mapId: map.id })
        }
      >
        {map.isMain ? 'Deixar de ser principal' : 'Marcar como principal'}
      </Button>
    </>
  );
}

// Being the main map overrides "Privado": everyone must know that before and while it holds.
function MainMapNotice({ map }: Readonly<{ map: LibraryMapSummaryDto }>) {
  if (map.visibility !== 'private') return null;
  return (
    <p role="note" className="text-xs text-muted-foreground">
      {map.isMain
        ? 'Todos da mesa veem este mapa enquanto ele for o principal.'
        : 'Ao marcar como principal, todos da mesa passam a ver este mapa.'}
    </p>
  );
}
