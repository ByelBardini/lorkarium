import type {
  LibraryMapChangedDto,
  LibraryMapDetailDto,
  LibraryMapRegionShownDto,
  LibraryMapSummaryDto,
  MapRegionDto,
} from '@lorkarium/contracts';
import { VHARN } from './campaigns-api-fake';

const AT = '2026-11-09T12:00:00.000Z';

export const MUNDO_ID = '8a1f2c3d-4e5b-4c6d-8e7f-9a0b1c2d3e4f';
export const REINO_ID = '9b2e3d4c-5f6a-4d7e-9f80-ab1c2d3e4f50';
export const CAPITAL_REGION_ID = 'a1c3e5f7-1234-4abc-8def-112233445566';
export const FLORESTA_REGION_ID = 'b2d4f6a8-2345-4bcd-9ef0-223344556677';
export const TAVERNA_REGION_ID = 'c3e5a7b9-3456-4cde-8f01-334455667788';
const MUNDO_ASSET_ID = 'd4f6b8ca-4567-4def-9012-445566778899';

/** A map as the library lists it: "Mundo", 2000 × 1000. */
export function libraryMapSummary(
  overrides: Partial<LibraryMapSummaryDto> = {},
): LibraryMapSummaryDto {
  return {
    id: MUNDO_ID,
    name: 'Mundo',
    folderId: null,
    visibility: 'public',
    isMain: false,
    asset: { id: MUNDO_ASSET_ID, mimeType: 'image/webp', width: 2000, height: 1000 },
    version: 3,
    updatedAt: AT,
    ...overrides,
  };
}

/** A small polygon over the map's upper left, unless told otherwise. */
export function mapRegion(overrides: Partial<MapRegionDto> = {}): MapRegionDto {
  return {
    id: CAPITAL_REGION_ID,
    name: 'Capital',
    description: 'Onde o rei mora.',
    geometry: {
      shape: 'polygon',
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.1 },
        { x: 0.2, y: 0.2 },
      ],
    },
    color: '#aa3300',
    icon: 'pin',
    hidden: false,
    link: null,
    ...overrides,
  };
}

/** A polygon bigger than `mapRegion()`'s. */
export function forestRegion(overrides: Partial<MapRegionDto> = {}): MapRegionDto {
  return mapRegion({
    id: FLORESTA_REGION_ID,
    name: 'Floresta',
    geometry: {
      shape: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 0.8, y: 0 },
        { x: 0.8, y: 0.8 },
      ],
    },
    ...overrides,
  });
}

/** A pin at (0.5, 0.25). */
export function pinRegion(overrides: Partial<MapRegionDto> = {}): MapRegionDto {
  return mapRegion({
    id: TAVERNA_REGION_ID,
    name: 'Taverna',
    geometry: { shape: 'pin', point: { x: 0.5, y: 0.25 } },
    ...overrides,
  });
}

/** "Mundo" with its regions, none unless told otherwise. */
export function libraryMapDetail(
  overrides: Partial<LibraryMapDetailDto> = {},
): LibraryMapDetailDto {
  return { ...libraryMapSummary(), regions: [], ...overrides };
}

/** `library:mapChanged` of VHARN, about "Mundo". */
export function mapChanged(overrides: Partial<LibraryMapChangedDto> = {}): LibraryMapChangedDto {
  return { campaignId: VHARN.id, mapId: MUNDO_ID, version: 4, at: AT, ...overrides };
}

/** `library:mapRegionShown` of VHARN: "Capital", on "Mundo". */
export function mapRegionShown(
  overrides: Partial<LibraryMapRegionShownDto> = {},
): LibraryMapRegionShownDto {
  return {
    eventId: 'e5a7c9d1-5678-4ef0-a123-556677889900',
    campaignId: VHARN.id,
    mapId: MUNDO_ID,
    regionId: CAPITAL_REGION_ID,
    at: AT,
    ...overrides,
  };
}
