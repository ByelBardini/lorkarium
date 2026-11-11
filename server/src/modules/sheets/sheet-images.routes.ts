import rateLimit from '@fastify/rate-limit';
import {
  ASSET_MAX_BYTES,
  ASSET_MIME_TYPES,
  sheetParamsDto,
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
import { AssetError, AssetRateLimitedError } from '../assets/assets.error';
import { CampaignError, CampaignNotFoundError } from '../campaigns/campaigns.error';
import type { LibraryRequester } from '../library/library.service';
import type { SheetImagesService } from './sheet-images.service';
import { SheetError, SheetNotFoundError } from './sheets.error';

const IMAGES_URL = '/campaigns/:campaignId/sheets/:sheetId/images';
// Spec §8.4: each send decodes an image; the same budget as the generic asset routes.
const SENDS_PER_MINUTE = 20;

// Public text only: the internal message cites ids and sizes and stays in the log.
const ASSET_REPLY: Readonly<Partial<Record<AssetError['code'], Readonly<[number, string]>>>> = {
  UNSUPPORTED_IMAGE: [422, 'The file is not a PNG, JPEG, WebP or GIF image'],
  ASSET_TOO_LARGE: [413, 'The image is larger than 20 MB'],
  RATE_LIMITED: [429, 'Too many images sent'],
};

/** `POST /campaigns/:campaignId/sheets/:sheetId/images`: the raw file in the body, sent by who
 *  edits the sheet. Who may not is refused before the 20 MiB body is read.
 *
 *  Example: `await app.register(sheetImagesRoutes(images), { prefix: '/api' })` */
export function sheetImagesRoutes(
  images: SheetImagesService,
): (app: FastifyInstance) => Promise<void> {
  return async (app) => {
    app.setErrorHandler(sheetImageErrorReply);
    app.addHook('onSend', async (_request, reply, payload) => {
      reply.header('cache-control', 'private, no-store');
      return payload;
    });
    await app.register(rateLimit, { global: false, errorResponseBuilder: rateLimitedError });
    app.addContentTypeParser([...ASSET_MIME_TYPES], { parseAs: 'buffer' }, (_req, body, done) =>
      done(null, body),
    );
    registerUploadRoute(app, images);
  };
}

function registerUploadRoute(app: FastifyInstance, images: SheetImagesService): void {
  const { requireAuth, userOf } = app.authGuards;
  const authorize: onRequestAsyncHookHandler = async (request) => {
    const requester = requesterOf(app, request);
    await images.authorizeSender(requester, sheetIdOf(request, requester));
  };
  const rateLimitConfig = {
    max: SENDS_PER_MINUTE,
    timeWindow: '1 minute',
    hook: 'preParsing' as const,
    keyGenerator: (request: FastifyRequest) => userOf(request).id,
  };
  const onRequest = [requireAuth as onRequestAsyncHookHandler, authorize];
  const options = { onRequest, bodyLimit: ASSET_MAX_BYTES, config: { rateLimit: rateLimitConfig } };
  app.post(IMAGES_URL, options, async (request, reply) => {
    const requester = requesterOf(app, request);
    const bytes = new Uint8Array(request.body as Buffer);
    const asset = await images.upload(requester, sheetIdOf(request, requester), bytes);
    return reply.code(201).send({ asset } satisfies AssetResponseDto);
  });
}

// A malformed id finds nothing, exactly like an id of another table (critério 14).
function requesterOf(app: FastifyInstance, request: FastifyRequest): LibraryRequester {
  const userId = app.authGuards.userOf(request).id;
  const { campaignId } = request.params as Readonly<Record<string, unknown>>;
  const parsed = sheetParamsDto.shape.campaignId.safeParse(campaignId);
  if (parsed.success) return { userId, campaignId: parsed.data };
  throw new CampaignNotFoundError({ campaignId: String(campaignId), userId });
}

function sheetIdOf(request: FastifyRequest, requester: LibraryRequester): string {
  const { sheetId } = request.params as Readonly<Record<string, unknown>>;
  const parsed = sheetParamsDto.shape.sheetId.safeParse(sheetId);
  if (parsed.success) return parsed.data;
  throw new SheetNotFoundError(requester.campaignId, `sheet ${String(sheetId)}`);
}

function rateLimitedError(
  _request: FastifyRequest,
  context: { ttl: number },
): AssetRateLimitedError {
  return new AssetRateLimitedError(Math.max(1, Math.ceil(context.ttl / 1000)));
}

function domainReplyOf(error: unknown): Readonly<{ status: number; body: ApiErrorDto }> | null {
  if (error instanceof SheetError)
    return { status: 404, body: { code: error.code, message: 'Sheet not found' } };
  if (error instanceof CampaignError && error.code === 'FORBIDDEN') {
    const message = 'Your role at this table does not allow it';
    return { status: 403, body: { code: error.code, message } };
  }
  if (error instanceof CampaignError)
    return { status: 404, body: { code: error.code, message: 'Campaign not found' } };
  if (!(error instanceof AssetError)) return null;
  const [status, message] = ASSET_REPLY[error.code] ?? [422, 'The image could not be used'];
  const retry =
    error instanceof AssetRateLimitedError ? { retryAfterSeconds: error.retryAfterSeconds } : {};
  return { status, body: { code: error.code, message, ...retry } };
}

// Fastify refuses a body before any handler runs: those refusals get the asset codes.
function bodyReplyOf(error: FastifyError): Readonly<{ status: number; body: ApiErrorDto }> | null {
  if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE')
    return {
      status: 413,
      body: { code: 'ASSET_TOO_LARGE', message: 'The image is larger than 20 MB' },
    };
  if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
    const message = 'The file is not a PNG, JPEG, WebP or GIF image';
    return { status: 415, body: { code: 'UNSUPPORTED_IMAGE', message } };
  }
  return null;
}

async function sheetImageErrorReply(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const known = domainReplyOf(error) ?? bodyReplyOf(error);
  if (known) return reply.code(known.status).send(known.body);
  if (error.statusCode !== undefined && error.statusCode < 500)
    return reply.code(error.statusCode).send({ code: error.code, message: error.message });
  request.log.error({ err: error }, 'unexpected error in the sheet images');
  return reply.code(500).send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' });
}
