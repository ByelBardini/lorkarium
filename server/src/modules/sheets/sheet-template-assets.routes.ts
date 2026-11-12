import rateLimit from '@fastify/rate-limit';
import {
  SHEET_TEMPLATE_ASSET_MIME_TYPES,
  SHEET_TEMPLATE_ASSETS_MAX_BYTES,
  sheetTemplateAssetMimeTypeDto,
  sheetTemplateParamsDto,
  type ApiErrorDto,
  type SheetTemplateAssetResponseDto,
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
import type { SheetTemplateAssetsService } from './sheet-template-assets.service';
import { withPlanLimitReply } from '../plans/plan-limit-response';

const ASSETS_URL = '/campaigns/:campaignId/sheet-template-assets';
// Spec §8.4: each send may decode an image; the same budget as the other asset routes.
const SENDS_PER_MINUTE = 20;
const NOT_AN_ASSET = 'The file is not a PNG, JPEG or WebP image nor a WOFF2 font';
const TOO_LARGE = 'The file is larger than a template allows (8 MB, a font 2 MB)';

type KnownReply = Readonly<{ status: number; body: ApiErrorDto }>;

// Public text only: the internal message cites sizes and bytes and stays in the log.
const ASSET_REPLY: Readonly<Partial<Record<AssetError['code'], Readonly<[number, string]>>>> = {
  UNSUPPORTED_IMAGE: [422, NOT_AN_ASSET],
  UNSUPPORTED_FONT: [422, 'The file is not a WOFF2 font'],
  ASSET_TOO_LARGE: [413, TOO_LARGE],
  RATE_LIMITED: [429, 'Too many files sent'],
};

/** `POST /campaigns/:campaignId/sheet-template-assets`: the raw font or image in the body, sent by
 *  a master; anyone else is refused before the body is read.
 *
 *  Example: `await app.register(sheetTemplateAssetsRoutes(templateAssets), { prefix: '/api' })` */
export function sheetTemplateAssetsRoutes(
  templateAssets: SheetTemplateAssetsService,
): (app: FastifyInstance) => Promise<void> {
  return async (app) => {
    app.setErrorHandler(withPlanLimitReply(templateAssetErrorReply));
    app.addHook('onSend', async (_request, reply, payload) => {
      reply.header('cache-control', 'private, no-store');
      return payload;
    });
    await app.register(rateLimit, { global: false, errorResponseBuilder: rateLimitedError });
    app.addContentTypeParser(
      [...SHEET_TEMPLATE_ASSET_MIME_TYPES],
      { parseAs: 'buffer' },
      (_req, body, done) => done(null, body),
    );
    registerUploadRoute(app, templateAssets);
  };
}

function registerUploadRoute(
  app: FastifyInstance,
  templateAssets: SheetTemplateAssetsService,
): void {
  const { requireAuth, userOf } = app.authGuards;
  const authorize: onRequestAsyncHookHandler = async (request) => {
    await templateAssets.authorizeSender(requesterOf(app, request));
  };
  const rateLimitConfig = {
    max: SENDS_PER_MINUTE,
    timeWindow: '1 minute',
    hook: 'preParsing' as const,
    keyGenerator: (request: FastifyRequest) => userOf(request).id,
  };
  const onRequest = [requireAuth as onRequestAsyncHookHandler, authorize];
  const bodyLimit = SHEET_TEMPLATE_ASSETS_MAX_BYTES;
  const options = { onRequest, bodyLimit, config: { rateLimit: rateLimitConfig } };
  app.post(ASSETS_URL, options, async (request, reply) => {
    // The parser only let one of the asset types in; a `; charset` after it changes nothing.
    const type = String(request.headers['content-type'] ?? '')
      .split(';')[0]
      ?.trim();
    const mimeType = sheetTemplateAssetMimeTypeDto.parse(type);
    const bytes = new Uint8Array(request.body as Buffer);
    const asset = await templateAssets.upload(requesterOf(app, request), bytes, mimeType);
    return reply.code(201).send({ asset } satisfies SheetTemplateAssetResponseDto);
  });
}

// A malformed id finds nothing, exactly like an id of another table (critério 14).
function requesterOf(app: FastifyInstance, request: FastifyRequest): LibraryRequester {
  const userId = app.authGuards.userOf(request).id;
  const { campaignId } = request.params as Readonly<Record<string, unknown>>;
  const parsed = sheetTemplateParamsDto.shape.campaignId.safeParse(campaignId);
  if (parsed.success) return { userId, campaignId: parsed.data };
  throw new CampaignNotFoundError({ campaignId: String(campaignId), userId });
}

function rateLimitedError(
  _request: FastifyRequest,
  context: { ttl: number },
): AssetRateLimitedError {
  return new AssetRateLimitedError(Math.max(1, Math.ceil(context.ttl / 1000)));
}

function domainReplyOf(error: unknown): KnownReply | null {
  if (error instanceof CampaignError && error.code === 'FORBIDDEN') {
    const message = 'Your role at this table does not allow it';
    return { status: 403, body: { code: error.code, message } };
  }
  if (error instanceof CampaignError)
    return { status: 404, body: { code: error.code, message: 'Campaign not found' } };
  if (!(error instanceof AssetError)) return null;
  const [status, message] = ASSET_REPLY[error.code] ?? [422, 'The file could not be used'];
  const retry =
    error instanceof AssetRateLimitedError ? { retryAfterSeconds: error.retryAfterSeconds } : {};
  return { status, body: { code: error.code, message, ...retry } };
}

// Fastify refuses a body before any handler runs: those refusals get the asset codes.
function bodyReplyOf(error: FastifyError): KnownReply | null {
  if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE')
    return { status: 413, body: { code: 'ASSET_TOO_LARGE', message: TOO_LARGE } };
  if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE')
    return { status: 415, body: { code: 'UNSUPPORTED_IMAGE', message: NOT_AN_ASSET } };
  return null;
}

async function templateAssetErrorReply(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const known = domainReplyOf(error) ?? bodyReplyOf(error);
  if (known) return reply.code(known.status).send(known.body);
  if (error.statusCode !== undefined && error.statusCode < 500)
    return reply.code(error.statusCode).send({ code: error.code, message: error.message });
  request.log.error({ err: error }, 'unexpected error in the sheet template assets');
  return reply.code(500).send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' });
}
