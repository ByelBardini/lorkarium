import type { MapRegionDto } from '@lorkarium/contracts';
import { ChevronRight, MapPin } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { mapPlacesMatching, mapPlacesTree, type MapPlaceNode } from '@/lib/map-places';
import { MAP_PIN_ICON_CHOICES } from './map-pin-icons';

export type MapPlacesListProps = Readonly<{
  regions: readonly MapRegionDto[];
  onChoose: (region: MapRegionDto) => void;
}>;

/** "Lugares neste mapa": every region by name, each under the region around it, searchable without
 *  accents. Starts closed, so it does not cover the map, and is the way in for who cannot aim at a
 *  pin among 300.
 *
 *  Example: `<MapPlacesList regions={map.regions} onChoose={(region) => focus(region.id)} />` */
export function MapPlacesList({ regions, onChoose }: MapPlacesListProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  if (regions.length === 0) return null;
  return (
    <div className="absolute top-3 left-3 z-10 flex max-h-[calc(100%-1.5rem)] w-64 flex-col items-start gap-2">
      <Button size="sm" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>
        <MapPin aria-hidden="true" />
        Lugares neste mapa
      </Button>
      {open && <PlacesPanel regions={regions} onChoose={onChoose} />}
    </div>
  );
}

function PlacesPanel({ regions, onChoose }: MapPlacesListProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const tree = useMemo(() => mapPlacesTree(regions), [regions]);
  const found = useMemo(() => mapPlacesMatching(tree, query), [tree, query]);
  const branches: PlaceBranches = {
    // A search must show what it found, wherever that lies.
    isOpen: (id) => query.trim() !== '' || expanded.has(id),
    toggle: (id) => setExpanded((current) => toggled(current, id)),
    onChoose,
  };
  return (
    <div className="flex min-h-0 w-full flex-col gap-2 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-lg">
      <Input
        type="search"
        aria-label="Buscar lugar"
        placeholder="Buscar lugar"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {found.length === 0 ? (
        <p className="p-1 text-sm text-muted-foreground">Nenhum lugar com esse nome.</p>
      ) : (
        <ul className="min-h-0 overflow-y-auto">
          <PlaceRows places={found} branches={branches} />
        </ul>
      )}
    </div>
  );
}

type PlaceBranches = Readonly<{
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
  onChoose: (region: MapRegionDto) => void;
}>;

function toggled(ids: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(ids);
  if (!next.delete(id)) next.add(id);
  return next;
}

type PlaceRowsProps = Readonly<{ places: readonly MapPlaceNode[]; branches: PlaceBranches }>;

function PlaceRows({ places, branches }: PlaceRowsProps): React.JSX.Element {
  return (
    <>
      {places.map((place) => (
        <PlaceRow key={place.region.id} place={place} branches={branches} />
      ))}
    </>
  );
}

function PlaceRow({
  place: { region, children },
  branches,
}: Readonly<{ place: MapPlaceNode; branches: PlaceBranches }>): React.JSX.Element {
  const open = children.length > 0 && branches.isOpen(region.id);
  return (
    <li>
      <div className="flex items-center">
        <PlaceExpander place={{ region, children }} open={open} branches={branches} />
        <Button
          size="sm"
          variant="ghost"
          className="min-w-0 flex-1 justify-start truncate"
          onClick={() => branches.onChoose(region)}
        >
          <PlacePinIcon region={region} />
          <span className="truncate">{region.name}</span>
        </Button>
      </div>
      {open && (
        <ul className="ml-3 border-l border-divider pl-1">
          <PlaceRows places={children} branches={branches} />
        </ul>
      )}
    </li>
  );
}

function PlacePinIcon({ region }: Readonly<{ region: MapRegionDto }>): React.JSX.Element | null {
  if (region.geometry.shape !== 'pin') return null;
  const { Icon } = MAP_PIN_ICON_CHOICES[region.icon];
  return <Icon aria-hidden="true" data-pin-icon={region.icon} className="shrink-0" />;
}

function PlaceExpander({
  place: { region, children },
  open,
  branches,
}: Readonly<{
  place: MapPlaceNode;
  open: boolean;
  branches: PlaceBranches;
}>): React.JSX.Element {
  if (children.length === 0) return <span aria-hidden="true" className="size-7 shrink-0" />;
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-expanded={open}
      aria-label={`${open ? 'Recolher' : 'Expandir'} ${region.name}`}
      onClick={() => branches.toggle(region.id)}
    >
      <ChevronRight aria-hidden="true" className={open ? 'rotate-90' : undefined} />
    </Button>
  );
}
