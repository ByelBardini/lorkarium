import {
  MAP_REGIONS_MAX,
  type MapRegionLinkDto,
  type MapRegionLinkKindDto,
} from '@lorkarium/contracts';
import { libraryMapFailureMessage } from '@/features/library/library-messages';
import type { LibraryMapsFailureKind } from '@/services/library-maps-api';

const REGION_FAILURE_MESSAGES: Partial<Readonly<Record<LibraryMapsFailureKind, string>>> = {
  regions_full: `Esse mapa já chegou a ${MAP_REGIONS_MAX} lugares. Exclua um antes de criar outro.`,
  link_self: 'Um lugar não pode levar ao mapa em que está.',
  link_target_not_found: 'O item escolhido não existe mais. Escolha outro.',
  map_is_main: 'Esse é o mapa principal da mesa. Escolha outro antes de excluir.',
  region_not_showable: 'Nem todos na sala podem ver esse lugar.',
  not_found: 'Esse lugar não existe mais.',
};

/** What the editor says for a refusal about a region; what is not about regions (no connection,
 *  no permission) reads as in the rest of the library.
 *
 *  Example: `mapRegionFailureMessage('link_target_not_found')` */
export function mapRegionFailureMessage(kind: LibraryMapsFailureKind): string {
  return REGION_FAILURE_MESSAGES[kind] ?? libraryMapFailureMessage(kind);
}

/** What the editor says of a shape that did not make it.
 *
 *  Example: `mapDrawingFailureMessage('no_area')` */
export function mapDrawingFailureMessage(failure: LibraryMapsFailureKind | 'no_area'): string {
  if (failure === 'no_area')
    return 'Esse desenho não forma uma área. Marque pontos fora de uma linha.';
  return mapRegionFailureMessage(failure);
}

export const MAP_REGION_BLANK_NAME = 'Um lugar precisa de um nome.';

const LINK_KIND_LABELS: Readonly<Record<MapRegionLinkKindDto, string>> = {
  document: 'Documento',
  scene: 'Grid',
  map: 'Mapa',
  image: 'Imagem',
};

/** The kind of a linkable item, in the singular.
 *
 *  Example: `mapLinkKindLabel('scene') // 'Grid'` */
export function mapLinkKindLabel(kind: MapRegionLinkKindDto): string {
  return LINK_KIND_LABELS[kind];
}

/** A linkable item as the picker lists and names it.
 *
 *  Example: `mapLinkItemLabel('scene', 'Estrada') // 'Grid: Estrada'` */
export function mapLinkItemLabel(kind: MapRegionLinkKindDto, name: string): string {
  return `${LINK_KIND_LABELS[kind]}: ${name}`;
}

/** The line that tells the master where a region leads now.
 *
 *  Example: `mapLinkStatusLabel({ state: 'removed', kind: 'map' }) // 'Link removido'` */
export function mapLinkStatusLabel(link: MapRegionLinkDto): string {
  if (link === null) return 'Sem link';
  if (link.state === 'open') return mapLinkItemLabel(link.kind, link.name);
  return link.state === 'removed' ? 'Link removido' : 'Item que você não pode ver';
}
