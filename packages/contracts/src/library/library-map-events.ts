import { z } from 'zod';
import { stateVersionDto } from '../http/realtime-ack.dto';

/** Map event names on the table connection. */
export const LIBRARY_MAP_EVENTS = {
  changed: 'library:mapChanged',
  regionShown: 'library:mapRegionShown',
} as const;

/** `library:mapChanged`: a map was written; each client reads it again by the route, so a hidden
 *  region never goes through the socket.
 *
 *  Example: `libraryMapChangedDto.parse({ campaignId, mapId, version: 4, at })` */
export const libraryMapChangedDto = z.strictObject({
  campaignId: z.uuid(),
  mapId: z.uuid(),
  version: stateVersionDto,
  at: z.iso.datetime(),
});
export type LibraryMapChangedDto = z.infer<typeof libraryMapChangedDto>;

/** `library:mapRegionShown`: the master showed a region to whoever is in the room; ephemeral, so
 *  it has no version, and the region is read by the route like any other.
 *
 *  Example: `libraryMapRegionShownDto.parse({ eventId, campaignId, mapId, regionId, at })` */
export const libraryMapRegionShownDto = z.strictObject({
  eventId: z.uuid(),
  campaignId: z.uuid(),
  mapId: z.uuid(),
  regionId: z.uuid(),
  at: z.iso.datetime(),
});
export type LibraryMapRegionShownDto = z.infer<typeof libraryMapRegionShownDto>;

/** Server → room map events, merged into `LibraryServerEvents`. */
export type LibraryMapServerEvents = {
  'library:mapChanged': (event: LibraryMapChangedDto) => void;
  'library:mapRegionShown': (event: LibraryMapRegionShownDto) => void;
};
