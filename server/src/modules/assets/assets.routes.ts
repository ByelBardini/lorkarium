import rateLimit from '@fastify/rate-limit';
import {
  ASSET_MAX_BYTES,
  ASSET_MIME_TYPES,
  assetIdParamsDto,
  campaignIdParamsDto,
  importAssetRequestDto,
  uploadAssetQueryDto,
  type ApiErrorDto,
  type AssetResponseDto,
} from '@lorkarium/contracts';
import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  onRequestAsyncHookHandler,
} from 'fastify';
import { ZodError } from 'zod';
import { invalidBodyError } from '../../lib/invalid-body';
import { CampaignError, CampaignNotFoundError } from '../campaigns/campaigns.error';
import {
  AssetError,
  AssetNotFoundError,
  AssetRateLimitedError,
  type AssetErrorCode,
} from './assets.error';
import type { AssetsService } from './assets.service';

// Spec §8.4: keyed by the signed-in user; each send decodes an image, so it is the costly route.
const SENDS_PER_MINUTE = 20;
// The content of an id never changes, so the browser may keep it for a year.
const ASSET_CACHE_CONTROL = 'private, max-age=31536000, immutable';
const UPLOAD_URL = '/campaigns/:campaignId/assets';
const FORBIDDEN_MESSAGE = 'Your role at this table does not allow it';

const STATUS_BY_CODE: Readonly<Record<AssetErrorCode, number>> = {
  ASSET_NOT_FOUND: 404,
  UNSUPPORTED_IMAGE: 422,
  ASSET_TOO_LARGE: 413,
  LINK_BLOCKED: 422,
  LINK_UNREACHABLE: 422,
  LINK_NOT_IMAGE: 422,
  RATE_LIMITED: 429,
};

// Public text only: the internal message cites links, addresses and ids and stays in the log.
const PUBLIC_MESSAGE: Readonly<Record<AssetErrorCode, string>> = {
  ASSET_NOT_FOUND: 'Image not found',
  UNSUPPORTED_IMAGE: 'The file is not a PNG, JPEG or WebP image (GIF only for an aura)',
  ASSET_TOO_LARGE: 'The image is larger than 20 MB',
  LINK_BLOCKED: 'This link cannot be used',
  LINK_UNREACHABLE: 'The link could not be downloaded',
  LINK_NOT_IMAGE: 'The link does not lead to an image',
  RATE_LIMITED: 'Too many images sent',
};

/** HTTP edge of assets: send a file (raw body), import a link and read an image back, all for
 *  the session's user and only within their campaigns.
 *
 *  Example: `app.register(assetsRoutes(service), { prefix: '/api' })` */
export function assetsRoutes(service: AssetsService): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(rateLimit, { global: false, errorResponseBuilder: rateLimitedError });
    app.addContentTypeParser([...ASSET_MIME_TYPES], { parseAs: 'buffer' }, (_req, body, done) =>
      done(null, body),
    );
    app.setErrorHandler(replyWithApiError);
    registerSendRoutes(app, service);
    registerReadRoute(app, service);
  };
}

function registerSendRoutes(app: FastifyInstance, service: AssetsService): void {
  const { requireAuth, userOf } = app.authGuards;
  // onRequest: who is not signed in is refused before a 20 MiB body is read.
  const guard = requireAuth as onRequestAsyncHookHandler;
  const rateLimitConfig = sendRateLimit((request) => userOf(request).id);
  const options = { onRequest: guard, config: { rateLimit: rateLimitConfig } };
  app.post(UPLOAD_URL, { ...options, bodyLimit: ASSET_MAX_BYTES }, async (request, reply) => {
    const { purpose } = uploadAssetQueryDto.parse(request.query);
    const bytes = new Uint8Array(request.body as Buffer);
    const asset = await service.upload(userOf(request).id, campaignIdOf(request), {
      bytes,
      purpose,
    });
    return reply.code(201).send({ asset } satisfies AssetResponseDto);
  });
  app.post(`${UPLOAD_URL}/import`, options, async (request, reply) => {
    const link = importAssetRequestDto.parse(request.body);
    const asset = await service.importLink(userOf(request).id, campaignIdOf(request), link);
    return reply.code(201).send({ asset } satisfies AssetResponseDto);
  });
}

function registerReadRoute(app: FastifyInstance, service: AssetsService): void {
  const { requireAuth, userOf } = app.authGuards;
  app.get('/assets/:assetId', { preHandler: requireAuth }, async (request, reply) => {
    const opened = await service.open(userOf(request).id, assetIdOf(request));
    return reply
      .header('content-type', opened.mimeType)
      .header('content-length', opened.size)
      .header('cache-control', ASSET_CACHE_CONTROL)
      .header('x-content-type-options', 'nosniff')
      .send(opened.body);
  });
}

// A malformed id finds nothing, exactly like an id of another campaign (criterion 14).
function campaignIdOf(request: FastifyRequest): string {
  const parsed = campaignIdParamsDto.safeParse(request.params);
  if (parsed.success) return parsed.data.campaignId;
  throw new CampaignNotFoundError({ campaignId: JSON.stringify(request.params), userId: '?' });
}

function assetIdOf(request: FastifyRequest): string {
  const parsed = assetIdParamsDto.safeParse(request.params);
  if (parsed.success) return parsed.data.assetId;
  throw new AssetNotFoundError(JSON.stringify(request.params));
}

function sendRateLimit(userIdOf: (request: FastifyRequest) => string): object {
  return {
    max: SENDS_PER_MINUTE,
    timeWindow: '1 minute',
    // preParsing: after the onRequest guard (so the key is the user), before the body is read.
    hook: 'preParsing',
    keyGenerator: userIdOf,
  };
}

function rateLimitedError(
  _request: FastifyRequest,
  context: { ttl: number },
): AssetRateLimitedError {
  return new AssetRateLimitedError(Math.max(1, Math.ceil(context.ttl / 1000)));
}

function assetErrorReply(error: AssetError): ApiErrorDto {
  const retry =
    error instanceof AssetRateLimitedError ? { retryAfterSeconds: error.retryAfterSeconds } : {};
  return { code: error.code, message: PUBLIC_MESSAGE[error.code], ...retry };
}

// Fastify refuses a body before any handler runs: those refusals get the asset codes.
function fastifyBodyError(error: FastifyError, request: FastifyRequest): AssetError | null {
  if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    return new AssetError('ASSET_TOO_LARGE', `body above ${ASSET_MAX_BYTES} bytes`);
  }
  const isUpload = request.routeOptions.url === `/api${UPLOAD_URL}`;
  if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' && isUpload) {
    return new AssetError('UNSUPPORTED_IMAGE', `content type ${request.headers['content-type']}`);
  }
  return null;
}

async function replyWithApiError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const bodyError = fastifyBodyError(error, request);
  if (bodyError !== null) {
    const status = bodyError.code === 'UNSUPPORTED_IMAGE' ? 415 : STATUS_BY_CODE[bodyError.code];
    return reply.code(status).send(assetErrorReply(bodyError));
  }
  if (error instanceof AssetError) {
    return reply.code(STATUS_BY_CODE[error.code]).send(assetErrorReply(error));
  }
  if (error instanceof CampaignError && error.code === 'CAMPAIGN_NOT_FOUND') {
    return reply.code(404).send({ code: error.code, message: 'Campaign not found' });
  }
  // A spectator sees the table's images but may not send one.
  if (error instanceof CampaignError && error.code === 'FORBIDDEN') {
    return reply.code(403).send({ code: error.code, message: FORBIDDEN_MESSAGE });
  }
  if (error instanceof ZodError) return reply.code(400).send(invalidBodyError(error));
  if (error.statusCode !== undefined && error.statusCode < 500) {
    return reply
      .code(error.statusCode)
      .send({ code: error.code, message: error.message } satisfies ApiErrorDto);
  }
  request.log.error({ err: error }, 'unexpected error in the assets module');
  return reply
    .code(500)
    .send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' } satisfies ApiErrorDto);
}
