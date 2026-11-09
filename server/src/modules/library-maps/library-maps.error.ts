export type LibraryMapErrorCode =
  | 'LIBRARY_MAP_NOT_FOUND'
  | 'MAP_IS_MAIN'
  | 'MAP_REGION_NOT_FOUND'
  | 'MAP_REGION_GEOMETRY_INVALID'
  | 'MAP_REGIONS_FULL'
  | 'MAP_LINK_SELF'
  | 'MAP_LINK_TARGET_NOT_FOUND'
  | 'MAP_REGION_NOT_SHOWABLE';

/** Every refusal of the map library of its own; the edge turns `code` into the HTTP status. */
export class LibraryMapError extends Error {
  constructor(
    readonly code: LibraryMapErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LibraryMapError';
  }
}

// Also for a map the reader may not see: a 403 would tell them it exists (critério 14).
export class LibraryMapNotFoundError extends LibraryMapError {
  constructor(
    readonly campaignId: string,
    readonly mapId: string,
    readonly userId: string,
  ) {
    super(
      'LIBRARY_MAP_NOT_FOUND',
      `campaign ${campaignId} has no library map ${mapId} that user ${userId} can see; expected a map of that campaign, public, main or read by a master`,
    );
  }
}

// The table needs somewhere to land: the master picks another main map, or none, first.
export class MapIsMainError extends LibraryMapError {
  constructor(readonly mapId: string) {
    super(
      'MAP_IS_MAIN',
      `library map ${mapId} is the main map of its campaign; expected it to stop being the main map before deleting it`,
    );
  }
}

// Also for a region at another address: the map in the URL has to be the region's own.
export class MapRegionNotFoundError extends LibraryMapError {
  constructor(
    readonly mapId: string,
    readonly regionId: string,
  ) {
    super(
      'MAP_REGION_NOT_FOUND',
      `library map ${mapId} has no region ${regionId}; expected the id of a region of that map`,
    );
  }
}

export class MapRegionGeometryInvalidError extends LibraryMapError {
  constructor(detail: string) {
    super('MAP_REGION_GEOMETRY_INVALID', `invalid region geometry: ${detail}`);
  }
}

export class MapRegionsFullError extends LibraryMapError {
  constructor(
    readonly mapId: string,
    readonly regions: number,
    readonly limit: number,
  ) {
    super(
      'MAP_REGIONS_FULL',
      `library map ${mapId} already has ${regions} regions; expected fewer than ${limit} to add one`,
    );
  }
}

export class MapLinkSelfError extends LibraryMapError {
  constructor(readonly mapId: string) {
    super(
      'MAP_LINK_SELF',
      `a region of library map ${mapId} points at that same map; expected another map`,
    );
  }
}

// Also for a target of another table: its id says nothing about whether it exists.
export class MapLinkTargetNotFoundError extends LibraryMapError {
  constructor(campaignId: string, kind: string, targetId: string) {
    super(
      'MAP_LINK_TARGET_NOT_FOUND',
      `campaign ${campaignId} has no ${kind} ${targetId}; expected the id of a ${kind} of that campaign`,
    );
  }
}

export class MapRegionNotShowableError extends LibraryMapError {
  constructor(
    readonly mapId: string,
    readonly regionId: string,
  ) {
    super(
      'MAP_REGION_NOT_SHOWABLE',
      `region ${regionId} of library map ${mapId} cannot be shown; expected a visible region on a public or main map`,
    );
  }
}
