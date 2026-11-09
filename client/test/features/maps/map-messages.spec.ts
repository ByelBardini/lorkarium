import type { MapRegionLinkDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { libraryMapFailureMessage } from '@/features/library/library-messages';
import {
  mapLinkItemLabel,
  mapLinkStatusLabel,
  mapRegionFailureMessage,
} from '@/features/maps/map-messages';

describe('mapRegionFailureMessage', () => {
  it('speaks of the place, not of the map, when a region is gone', () => {
    expect(mapRegionFailureMessage('not_found')).toBe('Esse lugar não existe mais.');
  });

  it.each(['forbidden', 'invalid', 'unauthenticated', 'offline', 'unexpected'] as const)(
    'a failure %s reads as in the rest of the library',
    (kind) => {
      expect(mapRegionFailureMessage(kind)).toBe(libraryMapFailureMessage(kind));
    },
  );
});

describe('mapLinkItemLabel', () => {
  it.each([
    ['document', 'Documento: Carta'],
    ['scene', 'Grid: Carta'],
    ['map', 'Mapa: Carta'],
    ['image', 'Imagem: Carta'],
  ] as const)('names a %s by its kind', (kind, label) => {
    expect(mapLinkItemLabel(kind, 'Carta')).toBe(label);
  });
});

describe('mapLinkStatusLabel', () => {
  it.each<[MapRegionLinkDto, string]>([
    [null, 'Sem link'],
    [{ state: 'removed', kind: 'map' }, 'Link removido'],
    [{ state: 'locked' }, 'Item que você não pode ver'],
  ])('says where %j leads', (link, label) => {
    expect(mapLinkStatusLabel(link)).toBe(label);
  });

  it('names the item of an open link', () => {
    const link: MapRegionLinkDto = {
      state: 'open',
      kind: 'scene',
      id: '7d3c2b1a-0f9e-4d8c-b7a6-5e4d3c2b1a0f',
      name: 'Estrada',
    };
    expect(mapLinkStatusLabel(link)).toBe('Grid: Estrada');
  });
});
