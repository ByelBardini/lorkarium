import type { MapRegionDto } from '@lorkarium/contracts';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { mapLinkStatusLabel } from './map-messages';
import type { MapCardPlacement } from './use-map-card-placement';

export type MapRegionCardProps = Readonly<{
  region: MapRegionDto;
  onOpen: () => void;
  onClose: () => void;
  /** More buttons beside "Abrir", on the card's last row. */
  actions?: ReactNode;
  /** Where it sits over the map; without it, on the corner. */
  placement?: MapCardPlacement;
}>;

/** What a click on a region shows: its name, its description and where it leads. A plain element
 *  over the map, not a popover: an "outside click" would eat the second click of a double click.
 *
 *  Example: `<MapRegionCard region={region} onOpen={open} onClose={close} />` */
export function MapRegionCard(props: MapRegionCardProps): React.JSX.Element {
  const { region, onOpen, onClose, actions, placement } = props;
  const canOpen = region.link?.state === 'open';
  return (
    <section
      ref={placement?.ref}
      style={placement?.style}
      aria-label={region.name}
      aria-live="polite"
      className="absolute top-3 left-3 z-10 flex max-h-[60%] w-80 max-w-[calc(100%-1.5rem)] flex-col gap-2 overflow-y-auto rounded-md border border-border bg-popover p-3 text-sm text-popover-foreground shadow-lg"
    >
      <header className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 font-medium wrap-break-word">{region.name}</h3>
        <Button size="icon-sm" variant="ghost" aria-label="Fechar cartão" onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
      </header>
      {region.hidden && <p className="text-xs text-muted-foreground">Oculta para jogadores</p>}
      {region.description && <p className="whitespace-pre-wrap">{region.description}</p>}
      <MapRegionLinkLine link={region.link} />
      {(canOpen || actions) && (
        <footer className="flex flex-wrap justify-end gap-2">
          {actions}
          {canOpen && (
            <Button size="sm" onClick={onOpen}>
              Abrir
            </Button>
          )}
        </footer>
      )}
    </section>
  );
}

function MapRegionLinkLine({
  link,
}: Readonly<{ link: MapRegionDto['link'] }>): React.JSX.Element | null {
  if (!link) return null;
  return <p className="text-muted-foreground">{linkLineText(link)}</p>;
}

function linkLineText(link: NonNullable<MapRegionDto['link']>): string {
  if (link.state === 'locked') return 'O mestre ainda não revelou isto';
  if (link.state === 'removed') return 'Link removido';
  return mapLinkStatusLabel(link);
}
