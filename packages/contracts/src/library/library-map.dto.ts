import { z } from 'zod';
import { assetDto } from '../assets/asset.dto';
import { hexColorDto } from '../color/hex-color.dto';
import { stateVersionDto } from '../http/realtime-ack.dto';
import { sceneVisibilityDto } from './library.dto';

// Repeats the game-core's limits (`map-region.vo.ts`): contracts depends only on zod.
export const MAP_NAME_MAX_LENGTH = 60;
export const MAP_REGION_NAME_MAX_LENGTH = 60;
export const MAP_REGION_DESCRIPTION_MAX_LENGTH = 500;
export const MAP_REGIONS_MAX = 300;
export const MAP_POLYGON_VERTICES_MIN = 3;
export const MAP_POLYGON_VERTICES_MAX = 1024;

const LIBRARY_MAP_CHANGE_KEYS = ['name', 'folderId', 'visibility'] as const;
const MAP_REGION_CHANGE_KEYS = [
  'name',
  'description',
  'geometry',
  'color',
  'icon',
  'hidden',
  'link',
] as const;

/** What a pin can look like on the map; `pin` is the plain marker. */
export const MAP_PIN_ICONS = [
  'pin',
  'castle',
  'city',
  'village',
  'temple',
  'tavern',
  'camp',
  'mine',
  'forest',
  'mountain',
  'port',
  'battle',
  'danger',
  'treasure',
  'star',
  'flag',
] as const;

export const mapPinIconDto = z.enum(MAP_PIN_ICONS);
export type MapPinIconDto = z.infer<typeof mapPinIconDto>;

const mapNameDto = z.string().trim().min(1).max(MAP_NAME_MAX_LENGTH);
const mapRegionNameDto = z.string().trim().min(1).max(MAP_REGION_NAME_MAX_LENGTH);
const mapRegionDescriptionDto = z.string().trim().max(MAP_REGION_DESCRIPTION_MAX_LENGTH);
const mapCoordinateDto = z.number().min(0).max(1);

function hasSomeChange(changes: object): boolean {
  return Object.keys(changes).length > 0;
}

function emptyChangesMessage(keys: readonly string[]): string {
  return `changes is empty; expected at least one of ${keys.join(', ')}`;
}

/** A point on the map image, normalized (0 to 1) so it does not vary with zoom or screen size.
 *
 *  Example: `mapPointDto.parse({ x: 0.5, y: 0.25 })` */
export const mapPointDto = z.strictObject({ x: mapCoordinateDto, y: mapCoordinateDto });
export type MapPointDto = z.infer<typeof mapPointDto>;

/** The shape of a region: an area (`polygon`) or a spot (`pin`). A polygon of zero area passes
 *  here: that check is the game-core's, which this package cannot import.
 *
 *  Example: `mapRegionGeometryDto.parse({ shape: 'pin', point: { x: 0.5, y: 0.5 } })` */
export const mapRegionGeometryDto = z.discriminatedUnion('shape', [
  z.strictObject({
    shape: z.literal('polygon'),
    points: z.array(mapPointDto).min(MAP_POLYGON_VERTICES_MIN).max(MAP_POLYGON_VERTICES_MAX),
  }),
  z.strictObject({ shape: z.literal('pin'), point: mapPointDto }),
]);
export type MapRegionGeometryDto = z.infer<typeof mapRegionGeometryDto>;

/** What a region can open; a sheet is left out because it depends on a holder and on the sandbox. */
export const mapRegionLinkKindDto = z.enum(['document', 'scene', 'map', 'image']);
export type MapRegionLinkKindDto = z.infer<typeof mapRegionLinkKindDto>;

/** The link as the master writes it; `null` in a body = no link.
 *
 *  Example: `mapRegionLinkTargetDto.parse({ kind: 'document', id: diarioId })` */
export const mapRegionLinkTargetDto = z.strictObject({
  kind: mapRegionLinkKindDto,
  id: z.uuid(),
});
export type MapRegionLinkTargetDto = z.infer<typeof mapRegionLinkTargetDto>;

/** The link as each reader receives it. `locked` has no field on purpose: a visible region whose
 *  item is private must not reveal its id, name or type. `removed` only reaches a master; `null`
 *  = no link.
 *
 *  Example: `mapRegionLinkDto.parse({ state: 'locked' })` */
export const mapRegionLinkDto = z
  .discriminatedUnion('state', [
    z.strictObject({
      state: z.literal('open'),
      kind: mapRegionLinkKindDto,
      id: z.uuid(),
      name: z.string(),
    }),
    z.strictObject({ state: z.literal('locked') }),
    z.strictObject({ state: z.literal('removed'), kind: mapRegionLinkKindDto }),
  ])
  .nullable();
export type MapRegionLinkDto = z.infer<typeof mapRegionLinkDto>;

/** A region as its reader receives it; a hidden one only ever reaches a master.
 *
 *  Example: `mapRegionDto.parse(body).link // { state: 'locked' }` */
export const mapRegionDto = z.strictObject({
  id: z.uuid(),
  name: mapRegionNameDto,
  description: mapRegionDescriptionDto,
  geometry: mapRegionGeometryDto,
  color: hexColorDto,
  icon: mapPinIconDto,
  hidden: z.boolean(),
  link: mapRegionLinkDto,
});
export type MapRegionDto = z.infer<typeof mapRegionDto>;

/** A map as the library lists it, without its regions.
 *
 *  Example: `libraryMapSummaryDto.parse(body).isMain // false` */
export const libraryMapSummaryDto = z.strictObject({
  id: z.uuid(),
  name: mapNameDto,
  folderId: z.uuid().nullable(),
  visibility: sceneVisibilityDto,
  isMain: z.boolean(),
  asset: assetDto,
  version: stateVersionDto,
  updatedAt: z.iso.datetime(),
});
export type LibraryMapSummaryDto = z.infer<typeof libraryMapSummaryDto>;

/** `GET …/library-maps/:mapId`: the map and the regions its reader may know of.
 *
 *  Example: `libraryMapDetailDto.parse(body).regions.length // 12` */
export const libraryMapDetailDto = libraryMapSummaryDto.extend({
  regions: z.array(mapRegionDto).max(MAP_REGIONS_MAX),
});
export type LibraryMapDetailDto = z.infer<typeof libraryMapDetailDto>;

/** `GET …/library-maps/main`; `map: null` = the table has no main map.
 *
 *  Example: `mainMapResponseDto.parse(body).map?.id` */
export const mainMapResponseDto = z.strictObject({ map: libraryMapSummaryDto.nullable() });
export type MainMapResponseDto = z.infer<typeof mainMapResponseDto>;

/** One place on a map where a document appears: what it takes to open the map at the region. */
export const mapAppearanceDto = z.strictObject({
  mapId: z.uuid(),
  mapName: mapNameDto,
  regionId: z.uuid(),
  regionName: mapRegionNameDto,
});
export type MapAppearanceDto = z.infer<typeof mapAppearanceDto>;

/** `GET …/documents/:documentId/map-appearances`: "Aparece em".
 *
 *  Example: `mapAppearancesResponseDto.parse(body).appearances[0]?.mapName` */
export const mapAppearancesResponseDto = z.strictObject({
  appearances: z.array(mapAppearanceDto),
});
export type MapAppearancesResponseDto = z.infer<typeof mapAppearancesResponseDto>;

/** Body of `POST …/library-maps`. `isMain` stays out: being the main map has its own route.
 *
 *  Example: `createLibraryMapRequestDto.parse({ name: 'Mundo', assetId })` */
export const createLibraryMapRequestDto = z.strictObject({
  name: mapNameDto,
  assetId: z.uuid(),
  folderId: z.uuid().nullable().optional(),
  visibility: sceneVisibilityDto.optional(),
});
export type CreateLibraryMapRequestDto = z.infer<typeof createLibraryMapRequestDto>;

/** Body of `PATCH …/library-maps/:mapId`: an absent key stays, `folderId: null` = the root. The
 *  image of a map never changes after it is created.
 *
 *  Example: `updateLibraryMapRequestDto.parse({ visibility: 'public' })` */
export const updateLibraryMapRequestDto = z
  .strictObject({
    name: mapNameDto.optional(),
    folderId: z.uuid().nullable().optional(),
    visibility: sceneVisibilityDto.optional(),
  })
  .refine(hasSomeChange, emptyChangesMessage(LIBRARY_MAP_CHANGE_KEYS));
export type UpdateLibraryMapRequestDto = z.infer<typeof updateLibraryMapRequestDto>;

/** Body of `POST …/regions`: no description, no link and visible unless said otherwise.
 *
 *  Example: `createMapRegionRequestDto.parse({ name: 'Reino', geometry, color: '#aa3300' })` */
export const createMapRegionRequestDto = z.strictObject({
  name: mapRegionNameDto,
  description: mapRegionDescriptionDto.default(''),
  geometry: mapRegionGeometryDto,
  color: hexColorDto,
  icon: mapPinIconDto.default('pin'),
  hidden: z.boolean().default(false),
  link: mapRegionLinkTargetDto.nullable().default(null),
});
export type CreateMapRegionRequestDto = z.infer<typeof createMapRegionRequestDto>;
export type CreateMapRegionRequestInput = z.input<typeof createMapRegionRequestDto>;

/** Body of `PATCH …/regions/:regionId`: an absent key stays, `link: null` removes the link.
 *
 *  Example: `updateMapRegionRequestDto.parse({ hidden: true })` */
export const updateMapRegionRequestDto = z
  .strictObject({
    name: mapRegionNameDto.optional(),
    description: mapRegionDescriptionDto.optional(),
    geometry: mapRegionGeometryDto.optional(),
    color: hexColorDto.optional(),
    icon: mapPinIconDto.optional(),
    hidden: z.boolean().optional(),
    link: mapRegionLinkTargetDto.nullable().optional(),
  })
  .refine(hasSomeChange, emptyChangesMessage(MAP_REGION_CHANGE_KEYS));
export type UpdateMapRegionRequestDto = z.infer<typeof updateMapRegionRequestDto>;

/** Params of the routes of one map of the library. */
export const libraryMapParamsDto = z.strictObject({ campaignId: z.uuid(), mapId: z.uuid() });

/** Params of the routes of one region of a map. */
export const mapRegionParamsDto = z.strictObject({
  campaignId: z.uuid(),
  mapId: z.uuid(),
  regionId: z.uuid(),
});
