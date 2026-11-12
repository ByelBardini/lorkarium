import {
  campaignIdParamsDto,
  createLibraryMapRequestDto,
  createMapRegionRequestDto,
  documentParamsDto,
  libraryMapParamsDto,
  mapRegionParamsDto,
  updateLibraryMapRequestDto,
  updateMapRegionRequestDto,
  type ApiErrorDto,
  type LibraryMapDetailDto,
  type LibraryMapSummaryDto,
  type MainMapResponseDto,
  type MapAppearancesResponseDto,
  type MapRegionDto,
} from '@lorkarium/contracts';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { invalidBodyError } from '../../lib/invalid-body';
import { AssetError } from '../assets/assets.error';
import { CampaignError, CampaignNotFoundError } from '../campaigns/campaigns.error';
import { DocumentError, DocumentNotFoundError } from '../documents/documents.error';
import { LibraryError } from '../library/library.error';
import type { LibraryRequester } from '../library/library.service';
import {
  LibraryMapError,
  LibraryMapNotFoundError,
  MapRegionNotFoundError,
  type LibraryMapErrorCode,
} from './library-maps.error';
import type { LibraryMapsService } from './library-maps.service';
import type { MapAppearancesService } from './map-appearances.service';
import type { MapRegionShowService } from './map-region-show.service';
import type { MapRegionsService } from './map-regions.service';
import { withPlanLimitReply } from '../plans/plan-limit-response';

const MAPS_URL = '/campaigns/:campaignId/library-maps';
const MAP_URL = `${MAPS_URL}/:mapId`;
const MAIN_MAP_URL = `${MAP_URL}/main`;
const REGIONS_URL = `${MAP_URL}/regions`;
const REGION_URL = `${REGIONS_URL}/:regionId`;
const APPEARANCES_URL = '/campaigns/:campaignId/documents/:documentId/map-appearances';
// Readers change with who is the main map and with visibility: nothing here may be cached.
const NO_CACHE = 'private, no-store';

type MapErrorReply = Readonly<{ status: number; body: ApiErrorDto }>;

export type LibraryMapRouteServices = Readonly<{
  maps: LibraryMapsService;
  regions: MapRegionsService;
  shows: MapRegionShowService;
  appearances: MapAppearancesService;
}>;

const STATUS_BY_CODE: Readonly<Record<LibraryMapErrorCode, number>> = {
  LIBRARY_MAP_NOT_FOUND: 404,
  MAP_IS_MAIN: 409,
  MAP_REGION_NOT_FOUND: 404,
  MAP_REGION_GEOMETRY_INVALID: 400,
  MAP_REGIONS_FULL: 422,
  MAP_LINK_SELF: 422,
  MAP_LINK_TARGET_NOT_FOUND: 404,
  MAP_REGION_NOT_SHOWABLE: 409,
};

// Public text only: the internal message cites ids and stays in the log.
const PUBLIC_MESSAGE: Readonly<Record<LibraryMapErrorCode, string>> = {
  LIBRARY_MAP_NOT_FOUND: 'Map not found',
  MAP_IS_MAIN: 'This is the main map; pick another one first',
  MAP_REGION_NOT_FOUND: 'Region not found',
  MAP_REGION_GEOMETRY_INVALID: 'The shape of this region is not valid',
  MAP_REGIONS_FULL: 'This map already has as many regions as it can hold',
  MAP_LINK_SELF: 'A region cannot lead to its own map',
  MAP_LINK_TARGET_NOT_FOUND: 'The linked item was not found',
  MAP_REGION_NOT_SHOWABLE: 'Players cannot see this region',
};

/** HTTP edge of the maps of the library, nested in the table (§2.6); every route needs a session
 *  and acts as the session's user.
 *
 *  Example: `app.register(libraryMapsRoutes(services), { prefix: '/api' })` */
export function libraryMapsRoutes(
  services: LibraryMapRouteServices,
): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    app.setErrorHandler(withPlanLimitReply(replyWithMapError));
    registerMapRoutes(app, services.maps);
    registerMainMapRoutes(app, services.maps);
    registerRegionRoutes(app, services.regions);
    registerShowRoute(app, services.shows);
    registerAppearancesRoute(app, services.appearances);
  };
}

function registerMapRoutes(app: FastifyInstance, service: LibraryMapsService): void {
  const opts = { preHandler: app.authGuards.requireAuth };
  app.post(MAPS_URL, opts, async (request, reply) => {
    const input = createLibraryMapRequestDto.parse(request.body);
    const map = await service.create(requesterOf(app, request), input);
    return reply.code(201).send(map satisfies LibraryMapSummaryDto);
  });
  app.get(`${MAPS_URL}/main`, opts, async (request, reply) => {
    reply.header('cache-control', NO_CACHE);
    return (await service.main(requesterOf(app, request))) satisfies MainMapResponseDto;
  });
  app.get(MAP_URL, opts, async (request, reply) => {
    const requester = requesterOf(app, request);
    reply.header('cache-control', NO_CACHE);
    const map = await service.detail(requester, mapIdOf(request, requester));
    return map satisfies LibraryMapDetailDto;
  });
  app.patch(MAP_URL, opts, async (request) => {
    const requester = requesterOf(app, request);
    const changes = updateLibraryMapRequestDto.parse(request.body);
    const mapId = mapIdOf(request, requester);
    return (await service.update(requester, mapId, changes)) satisfies LibraryMapSummaryDto;
  });
  app.delete(MAP_URL, opts, async (request, reply) => {
    const requester = requesterOf(app, request);
    await service.delete(requester, mapIdOf(request, requester));
    return reply.code(204).send();
  });
}

function registerMainMapRoutes(app: FastifyInstance, service: LibraryMapsService): void {
  const opts = { preHandler: app.authGuards.requireAuth };
  app.put(MAIN_MAP_URL, opts, async (request) => {
    const requester = requesterOf(app, request);
    const mapId = mapIdOf(request, requester);
    return (await service.setMain(requester, mapId)) satisfies LibraryMapSummaryDto;
  });
  app.delete(MAIN_MAP_URL, opts, async (request) => {
    const requester = requesterOf(app, request);
    const mapId = mapIdOf(request, requester);
    return (await service.unsetMain(requester, mapId)) satisfies LibraryMapSummaryDto;
  });
}

function registerRegionRoutes(app: FastifyInstance, regions: MapRegionsService): void {
  const opts = { preHandler: app.authGuards.requireAuth };
  app.post(REGIONS_URL, opts, async (request, reply) => {
    const requester = requesterOf(app, request);
    const input = createMapRegionRequestDto.parse(request.body);
    const region = await regions.create(requester, mapIdOf(request, requester), input);
    return reply.code(201).send(region satisfies MapRegionDto);
  });
  app.patch(REGION_URL, opts, async (request) => {
    const requester = requesterOf(app, request);
    const changes = updateMapRegionRequestDto.parse(request.body);
    const mapId = mapIdOf(request, requester);
    const regionId = regionIdOf(request, mapId);
    return (await regions.update(requester, mapId, regionId, changes)) satisfies MapRegionDto;
  });
  app.delete(REGION_URL, opts, async (request, reply) => {
    const requester = requesterOf(app, request);
    const mapId = mapIdOf(request, requester);
    await regions.delete(requester, mapId, regionIdOf(request, mapId));
    return reply.code(204).send();
  });
}

function registerShowRoute(app: FastifyInstance, shows: MapRegionShowService): void {
  const opts = { preHandler: app.authGuards.requireAuth };
  app.post(`${REGION_URL}/shows`, opts, async (request, reply) => {
    const requester = requesterOf(app, request);
    const mapId = mapIdOf(request, requester);
    await shows.show(requester, mapId, regionIdOf(request, mapId));
    return reply.code(204).send();
  });
}

function registerAppearancesRoute(app: FastifyInstance, appearances: MapAppearancesService): void {
  const opts = { preHandler: app.authGuards.requireAuth };
  app.get(APPEARANCES_URL, opts, async (request, reply) => {
    const requester = requesterOf(app, request);
    reply.header('cache-control', NO_CACHE);
    const documentId = documentIdOf(request, requester);
    return (await appearances.list(requester, documentId)) satisfies MapAppearancesResponseDto;
  });
}

// A malformed id finds nothing, exactly like an id of another table (critério 14).
function requesterOf(app: FastifyInstance, request: FastifyRequest): LibraryRequester {
  const userId = app.authGuards.userOf(request).id;
  const { campaignId } = request.params as Readonly<Record<string, unknown>>;
  const parsed = campaignIdParamsDto.safeParse({ campaignId });
  if (parsed.success) return { userId, campaignId: parsed.data.campaignId };
  throw new CampaignNotFoundError({ campaignId: String(campaignId), userId });
}

function mapIdOf(request: FastifyRequest, requester: LibraryRequester): string {
  const { mapId } = request.params as Readonly<Record<string, unknown>>;
  const parsed = libraryMapParamsDto.shape.mapId.safeParse(mapId);
  if (parsed.success) return parsed.data;
  throw new LibraryMapNotFoundError(requester.campaignId, String(mapId), requester.userId);
}

function regionIdOf(request: FastifyRequest, mapId: string): string {
  const { regionId } = request.params as Readonly<Record<string, unknown>>;
  const parsed = mapRegionParamsDto.shape.regionId.safeParse(regionId);
  if (parsed.success) return parsed.data;
  throw new MapRegionNotFoundError(mapId, String(regionId));
}

function documentIdOf(request: FastifyRequest, requester: LibraryRequester): string {
  const { documentId } = request.params as Readonly<Record<string, unknown>>;
  const parsed = documentParamsDto.shape.documentId.safeParse(documentId);
  if (parsed.success) return parsed.data;
  throw new DocumentNotFoundError(requester.campaignId, String(documentId));
}

function campaignReplyOf(error: CampaignError): MapErrorReply {
  if (error.code === 'FORBIDDEN') {
    const message = 'Your role at this table does not allow it';
    return { status: 403, body: { code: error.code, message } };
  }
  return { status: 404, body: { code: error.code, message: 'Campaign not found' } };
}

function domainReplyOf(error: unknown): MapErrorReply | null {
  if (error instanceof LibraryMapError) {
    const body = { code: error.code, message: PUBLIC_MESSAGE[error.code] };
    return { status: STATUS_BY_CODE[error.code], body };
  }
  if (error instanceof AssetError)
    return { status: 404, body: { code: error.code, message: 'Image not found' } };
  if (error instanceof DocumentError)
    return { status: 404, body: { code: error.code, message: 'Document not found' } };
  if (error instanceof LibraryError)
    return { status: 404, body: { code: error.code, message: 'Folder not found' } };
  return error instanceof CampaignError ? campaignReplyOf(error) : null;
}

async function replyWithMapError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const domain = domainReplyOf(error);
  if (domain) return reply.code(domain.status).send(domain.body);
  if (error instanceof ZodError) return reply.code(400).send(invalidBodyError(error));
  if (error.statusCode !== undefined && error.statusCode < 500) {
    const body = { code: error.code, message: error.message } satisfies ApiErrorDto;
    return reply.code(error.statusCode).send(body);
  }
  request.log.error({ err: error }, 'unexpected error in the library maps module');
  const body = { code: 'INTERNAL_ERROR', message: 'Unexpected server error' };
  return reply.code(500).send(body satisfies ApiErrorDto);
}
