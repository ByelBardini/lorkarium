import {
  libraryMapDetailDto,
  libraryMapSummaryDto,
  mainMapResponseDto,
  mapAppearancesResponseDto,
  mapRegionDto,
  type CreateLibraryMapRequestDto,
  type CreateMapRegionRequestInput,
  type LibraryMapDetailDto,
  type LibraryMapSummaryDto,
  type MapAppearanceDto,
  type MapRegionDto,
  type UpdateLibraryMapRequestDto,
  type UpdateMapRegionRequestDto,
} from '@lorkarium/contracts';
import type { z } from 'zod';
import { callApi, errorCodeOf, parseOk, type ApiCall } from './api-call';
import type { HttpMethod, HttpResponse, HttpTransport } from './http-transport';

export type LibraryMapsFailure = Readonly<{
  kind:
    | 'map_is_main'
    | 'regions_full'
    | 'link_self'
    | 'link_target_not_found'
    | 'region_not_showable'
    | 'not_found'
    | 'forbidden'
    | 'invalid'
    | 'unauthenticated'
    | 'offline'
    | 'unexpected';
}>;

export type LibraryMapsFailureKind = LibraryMapsFailure['kind'];

export type LibraryMapsResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; failure: LibraryMapsFailure }>;

/** The maps of a table's library, their regions, showing a region to the room and where a
 *  document appears. Failures come back as values; every answer is validated by its DTO.
 *
 *  Example: `const result = await libraryMapsApi.detail(campaignId, mapId); if (result.ok) result.value.regions` */
export interface LibraryMapsApi {
  detail(campaignId: string, mapId: string): Promise<LibraryMapsResult<LibraryMapDetailDto>>;
  /** The table's main map; `null` when it has none. */
  main(campaignId: string): Promise<LibraryMapsResult<LibraryMapSummaryDto | null>>;
  create(
    campaignId: string,
    input: CreateLibraryMapRequestDto,
  ): Promise<LibraryMapsResult<LibraryMapSummaryDto>>;
  update(
    campaignId: string,
    mapId: string,
    changes: UpdateLibraryMapRequestDto,
  ): Promise<LibraryMapsResult<LibraryMapSummaryDto>>;
  remove(campaignId: string, mapId: string): Promise<LibraryMapsResult<null>>;
  setMain(campaignId: string, mapId: string): Promise<LibraryMapsResult<null>>;
  unsetMain(campaignId: string, mapId: string): Promise<LibraryMapsResult<null>>;
  createRegion(
    campaignId: string,
    mapId: string,
    input: CreateMapRegionRequestInput,
  ): Promise<LibraryMapsResult<MapRegionDto>>;
  updateRegion(
    campaignId: string,
    mapId: string,
    regionId: string,
    changes: UpdateMapRegionRequestDto,
  ): Promise<LibraryMapsResult<MapRegionDto>>;
  removeRegion(
    campaignId: string,
    mapId: string,
    regionId: string,
  ): Promise<LibraryMapsResult<null>>;
  /** Shows a region to whoever is in the room; nothing is saved. */
  showRegion(campaignId: string, mapId: string, regionId: string): Promise<LibraryMapsResult<null>>;
  /** "Aparece em": the places on the maps this reader may see where a document is linked. */
  appearances(
    campaignId: string,
    documentId: string,
  ): Promise<LibraryMapsResult<readonly MapAppearanceDto[]>>;
}

// The maps' own refusals by code; the rest by status.
const FAILURE_BY_CODE: Readonly<Record<string, LibraryMapsFailure>> = {
  MAP_IS_MAIN: { kind: 'map_is_main' },
  MAP_REGIONS_FULL: { kind: 'regions_full' },
  MAP_LINK_SELF: { kind: 'link_self' },
  MAP_LINK_TARGET_NOT_FOUND: { kind: 'link_target_not_found' },
  MAP_REGION_NOT_SHOWABLE: { kind: 'region_not_showable' },
};

const FAILURE_BY_STATUS: Readonly<Record<number, LibraryMapsFailure>> = {
  400: { kind: 'invalid' },
  401: { kind: 'unauthenticated' },
  403: { kind: 'forbidden' },
  404: { kind: 'not_found' },
};

/** `LibraryMapsApi` over HTTP, without automatic command retries.
 *
 *  Example: `await new HttpLibraryMapsApi(transport).setMain(campaignId, mapId)` */
export class HttpLibraryMapsApi implements LibraryMapsApi {
  constructor(private readonly transport: HttpTransport) {}

  detail(campaignId: string, mapId: string): Promise<LibraryMapsResult<LibraryMapDetailDto>> {
    return this.answer('GET', mapPath(campaignId, mapId), libraryMapDetailDto);
  }

  async main(campaignId: string): Promise<LibraryMapsResult<LibraryMapSummaryDto | null>> {
    const call = await callApi(this.transport, 'GET', `${mapsPath(campaignId)}/main`);
    if (call.kind !== 'ok') return failed(call);
    return parseOk(mainMapResponseDto, call.body, (parsed) => parsed.map);
  }

  create(
    campaignId: string,
    input: CreateLibraryMapRequestDto,
  ): Promise<LibraryMapsResult<LibraryMapSummaryDto>> {
    return this.answer('POST', mapsPath(campaignId), libraryMapSummaryDto, input);
  }

  update(
    campaignId: string,
    mapId: string,
    changes: UpdateLibraryMapRequestDto,
  ): Promise<LibraryMapsResult<LibraryMapSummaryDto>> {
    return this.answer('PATCH', mapPath(campaignId, mapId), libraryMapSummaryDto, changes);
  }

  remove(campaignId: string, mapId: string): Promise<LibraryMapsResult<null>> {
    return this.command('DELETE', mapPath(campaignId, mapId));
  }

  setMain(campaignId: string, mapId: string): Promise<LibraryMapsResult<null>> {
    return this.markMain('PUT', campaignId, mapId);
  }

  unsetMain(campaignId: string, mapId: string): Promise<LibraryMapsResult<null>> {
    return this.markMain('DELETE', campaignId, mapId);
  }

  createRegion(
    campaignId: string,
    mapId: string,
    input: CreateMapRegionRequestInput,
  ): Promise<LibraryMapsResult<MapRegionDto>> {
    return this.answer('POST', regionsPath(campaignId, mapId), mapRegionDto, input);
  }

  updateRegion(
    campaignId: string,
    mapId: string,
    regionId: string,
    changes: UpdateMapRegionRequestDto,
  ): Promise<LibraryMapsResult<MapRegionDto>> {
    return this.answer('PATCH', regionPath(campaignId, mapId, regionId), mapRegionDto, changes);
  }

  removeRegion(
    campaignId: string,
    mapId: string,
    regionId: string,
  ): Promise<LibraryMapsResult<null>> {
    return this.command('DELETE', regionPath(campaignId, mapId, regionId));
  }

  showRegion(
    campaignId: string,
    mapId: string,
    regionId: string,
  ): Promise<LibraryMapsResult<null>> {
    return this.command('POST', `${regionPath(campaignId, mapId, regionId)}/shows`);
  }

  async appearances(
    campaignId: string,
    documentId: string,
  ): Promise<LibraryMapsResult<readonly MapAppearanceDto[]>> {
    const path = `/campaigns/${encodeURIComponent(campaignId)}/documents/${encodeURIComponent(documentId)}/map-appearances`;
    const call = await callApi(this.transport, 'GET', path);
    if (call.kind !== 'ok') return failed(call);
    return parseOk(mapAppearancesResponseDto, call.body, (parsed) => parsed.appearances);
  }

  private async answer<S extends z.ZodType>(
    method: HttpMethod,
    path: string,
    dto: S,
    body?: unknown,
  ): Promise<LibraryMapsResult<z.infer<S>>> {
    const call = await callApi(this.transport, method, path, body);
    if (call.kind !== 'ok') return failed(call);
    return parseOk(dto, call.body, (parsed) => parsed);
  }

  // Validated but not handed over: two maps change at once, and `library:changed` brings both.
  private async markMain(
    method: HttpMethod,
    campaignId: string,
    mapId: string,
  ): Promise<LibraryMapsResult<null>> {
    const call = await callApi(this.transport, method, `${mapPath(campaignId, mapId)}/main`);
    if (call.kind !== 'ok') return failed(call);
    return parseOk(libraryMapSummaryDto, call.body, () => null);
  }

  private async command(method: HttpMethod, path: string): Promise<LibraryMapsResult<null>> {
    const call = await callApi(this.transport, method, path);
    return call.kind === 'ok' ? { ok: true, value: null } : failed(call);
  }
}

function mapsPath(campaignId: string): string {
  return `/campaigns/${encodeURIComponent(campaignId)}/library-maps`;
}

function mapPath(campaignId: string, mapId: string): string {
  return `${mapsPath(campaignId)}/${encodeURIComponent(mapId)}`;
}

function regionsPath(campaignId: string, mapId: string): string {
  return `${mapPath(campaignId, mapId)}/regions`;
}

function regionPath(campaignId: string, mapId: string, regionId: string): string {
  return `${regionsPath(campaignId, mapId)}/${encodeURIComponent(regionId)}`;
}

function failed(call: Exclude<ApiCall, { kind: 'ok' }>): LibraryMapsResult<never> {
  if (call.kind === 'offline') return { ok: false, failure: { kind: 'offline' } };
  return { ok: false, failure: failureOf(call.response) };
}

function failureOf(response: HttpResponse): LibraryMapsFailure {
  const byCode = FAILURE_BY_CODE[errorCodeOf(response) ?? ''];
  if (byCode) return byCode;
  return FAILURE_BY_STATUS[response.status] ?? { kind: 'unexpected' };
}
