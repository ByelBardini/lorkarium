import {
  SCENE_FOLDER_DEPTH_MAX,
  type CampaignLibraryDto,
  type MapRegionLinkDto,
  type MapRegionLinkKindDto,
  type MapRegionLinkTargetDto,
} from '@lorkarium/contracts';
import {
  FileText,
  Grid3x3,
  Image as ImageIcon,
  Map as MapIcon,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { searchText } from '@/lib/search-text';
import type { DocumentsApi } from '@/services/documents-api';
import { MapLinkTabField } from './map-link-tab-field';
import { mapLinkItemLabel, mapLinkKindLabel, mapLinkStatusLabel } from './map-messages';

/** The kinds of item a region can lead to, and the folders they sit in. Sheets stay out: they
 *  depend on an owner and a sandbox. */
export type LinkableLibrary = Pick<
  CampaignLibraryDto,
  'documents' | 'scenes' | 'maps' | 'images' | 'folders'
>;

type LinkKindFilter = MapRegionLinkKindDto | 'all';

const LINK_FILTERS: readonly Readonly<{ filter: LinkKindFilter; label: string }>[] = [
  { filter: 'all', label: 'Todos' },
  { filter: 'document', label: 'Documentos' },
  { filter: 'scene', label: 'Grids' },
  { filter: 'map', label: 'Mapas' },
  { filter: 'image', label: 'Imagens' },
];

const LINK_KIND_ICONS: Readonly<Record<MapRegionLinkKindDto, LucideIcon>> = {
  document: FileText,
  scene: Grid3x3,
  map: MapIcon,
  image: ImageIcon,
};

export type MapLinkPickerProps = Readonly<{
  campaignId: string;
  /** The map being edited: a region cannot lead to its own map. */
  mapId: string;
  link: MapRegionLinkDto;
  library: LinkableLibrary;
  /** Reads the tabs of a linked document, for "Abrir em". */
  documents: Pick<DocumentsApi, 'detail'>;
  disabled?: boolean;
  /** The item picked; `null` takes the link away. */
  onChange: (target: MapRegionLinkTargetDto | null) => void;
}>;

type NamedItem = Readonly<{ id: string; name: string; folderId: string | null }>;
type LinkableItem = MapRegionLinkTargetDto & NamedItem;

/** What a region leads to: the current link, "Remover link" and a search over the library. A
 *  link that works keeps the list closed behind "Trocar item"; no link, or one whose item was
 *  deleted, leaves it open because choosing is the only thing left to do.
 *
 *  Example: `<MapLinkPicker mapId={map.id} link={region.link} library={library} onChange={save} />` */
export function MapLinkPicker(props: MapLinkPickerProps): React.JSX.Element {
  const { link, disabled, onChange } = props;
  const [swapping, setSwapping] = useState(false);
  const listOpen = swapping || link === null || link.state === 'removed';
  const pick = (target: MapRegionLinkTargetDto): void => {
    setSwapping(false);
    onChange(target);
  };
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Item ligado</legend>
      <p className="text-sm text-muted-foreground">{mapLinkStatusLabel(link)}</p>
      {link?.state === 'open' && link.kind === 'document' && (
        <MapLinkTabField
          campaignId={props.campaignId}
          link={link}
          documents={props.documents}
          disabled={disabled}
          onChange={(tabId) => onChange({ kind: 'document', id: link.id, ...(tabId && { tabId }) })}
        />
      )}
      <LinkActions
        link={link}
        disabled={disabled}
        onSwap={() => setSwapping((open) => !open)}
        onClear={() => onChange(null)}
      />
      {listOpen && <LinkSearch {...props} onPick={pick} />}
    </fieldset>
  );
}

type LinkActionsProps = Readonly<{
  link: MapRegionLinkDto;
  disabled?: boolean;
  onSwap: () => void;
  onClear: () => void;
}>;

function LinkActions({
  link,
  disabled,
  onSwap,
  onClear,
}: LinkActionsProps): React.JSX.Element | null {
  if (link === null) return null;
  return (
    <div className="flex gap-2">
      {link.state !== 'removed' && (
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onSwap}>
          Trocar item
        </Button>
      )}
      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onClear}>
        Remover link
      </Button>
    </div>
  );
}

type LinkSearchProps = MapLinkPickerProps &
  Readonly<{ onPick: (target: MapRegionLinkTargetDto) => void }>;

function LinkSearch({ mapId, library, disabled, onPick }: LinkSearchProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LinkKindFilter>('all');
  const all = linkableItems(library, mapId);
  const items = matchingItems(all, query).filter(
    (item) => filter === 'all' || item.kind === filter,
  );
  return (
    <div className="flex flex-col gap-2">
      <Input
        type="search"
        aria-label="Buscar item"
        placeholder="Buscar item"
        value={query}
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
      />
      <LinkFilters items={all} active={filter} disabled={disabled} onChoose={setFilter} />
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum item com esse nome.</p>
      ) : (
        <LinkOptions items={items} folders={library.folders} disabled={disabled} onPick={onPick} />
      )}
    </div>
  );
}

type LinkFiltersProps = Readonly<{
  items: readonly LinkableItem[];
  active: LinkKindFilter;
  disabled?: boolean;
  onChoose: (filter: LinkKindFilter) => void;
}>;

function LinkFilters({ items, active, disabled, onChoose }: LinkFiltersProps): React.JSX.Element {
  const offered = LINK_FILTERS.filter(
    ({ filter }) => filter === 'all' || items.some(({ kind }) => kind === filter),
  );
  return (
    <div role="group" aria-label="Filtrar por tipo" className="flex flex-wrap gap-1">
      {offered.map(({ filter, label }) => (
        <Button
          key={filter}
          type="button"
          size="sm"
          variant={filter === active ? 'secondary' : 'ghost'}
          aria-pressed={filter === active}
          disabled={disabled}
          onClick={() => onChoose(filter)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

type LinkOptionsProps = Readonly<{
  items: readonly LinkableItem[];
  folders: LinkableLibrary['folders'];
  disabled?: boolean;
  onPick: (target: MapRegionLinkTargetDto) => void;
}>;

function LinkOptions({ items, folders, disabled, onPick }: LinkOptionsProps): React.JSX.Element {
  return (
    <ul aria-label="Itens da biblioteca" className="flex max-h-64 flex-col overflow-y-auto">
      {items.map((item) => (
        <li key={`${item.kind}:${item.id}`}>
          <LinkOption item={item} folders={folders} disabled={disabled} onPick={onPick} />
        </li>
      ))}
    </ul>
  );
}

function LinkOption({
  item: { kind, id, name, folderId },
  folders,
  disabled,
  onPick,
}: Readonly<{ item: LinkableItem }> & Omit<LinkOptionsProps, 'items'>): React.JSX.Element {
  const Icon = LINK_KIND_ICONS[kind];
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-auto w-full justify-start gap-2 py-1.5 text-left"
      aria-label={mapLinkItemLabel(kind, name)}
      disabled={disabled}
      onClick={() => onPick({ kind, id })}
    >
      <Icon aria-hidden="true" className="shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{name}</span>
        <span className="truncate text-xs font-normal text-muted-foreground">
          {[mapLinkKindLabel(kind), folderPathOf(folderId, folders)].filter(Boolean).join(' · ')}
        </span>
      </span>
    </Button>
  );
}

// Bounded by the deepest a folder can be, so a tree read in the middle of a move cannot loop.
function folderPathOf(folderId: string | null, folders: LinkableLibrary['folders']): string {
  const path: string[] = [];
  let folder = folders.find(({ id }) => id === folderId);
  while (folder && path.length < SCENE_FOLDER_DEPTH_MAX) {
    path.unshift(folder.name);
    const parentId = folder.parentId;
    folder = folders.find(({ id }) => id === parentId);
  }
  return path.join(' › ');
}

function linkableItems(library: LinkableLibrary, mapId: string): LinkableItem[] {
  return [
    ...itemsOfKind('document', library.documents),
    ...itemsOfKind('scene', library.scenes),
    ...itemsOfKind(
      'map',
      library.maps.filter((map) => map.id !== mapId),
    ),
    ...itemsOfKind('image', library.images),
  ].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function itemsOfKind(kind: MapRegionLinkKindDto, items: readonly NamedItem[]): LinkableItem[] {
  return items.map(({ id, name, folderId }) => ({ kind, id, name, folderId }));
}

function matchingItems(items: readonly LinkableItem[], query: string): readonly LinkableItem[] {
  const needle = searchText(query.trim());
  return items.filter((item) => searchText(item.name).includes(needle));
}
