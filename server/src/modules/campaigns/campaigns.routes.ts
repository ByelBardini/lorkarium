import rateLimit from '@fastify/rate-limit';
import {
  campaignIdParamsDto,
  createCampaignRequestDto,
  joinCampaignRequestDto,
  updateCampaignRequestDto,
  type ApiErrorDto,
  type CampaignResponseDto,
  type JoinCampaignResponseDto,
  type ListCampaignsResponseDto,
} from '@lorkarium/contracts';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { invalidBodyError } from '../../lib/invalid-body';
import type { CampaignJoinService } from './campaign-join.service';
import type { CampaignSettingsService } from './campaign-settings.service';
import {
  CampaignError,
  CampaignJoinRateLimitedError,
  InvalidCampaignIdError,
  type CampaignErrorCode,
} from './campaigns.error';
import type { CampaignsService } from './campaigns.service';

// Spec §8.4: keyed by the signed-in user, so guessing codes costs one account per 10 tries a minute.
const JOIN_ATTEMPTS_PER_MINUTE = 10;

const STATUS_BY_CODE: Readonly<Record<CampaignErrorCode, number>> = {
  CAMPAIGN_NOT_FOUND: 404,
  CAMPAIGN_PASSWORD_REQUIRED: 403,
  CAMPAIGN_PASSWORD_INVALID: 403,
  CAMPAIGN_CODE_EXHAUSTED: 500,
  RATE_LIMITED: 429,
  INVALID_PARAMS: 400,
  FORBIDDEN: 403,
  CAMPAIGN_NOT_OPEN: 403,
  INVALID_BODY: 400,
};

// Public text only: the internal message cites ids and codes and stays in the log.
const PUBLIC_MESSAGE: Readonly<Record<CampaignErrorCode, string>> = {
  CAMPAIGN_NOT_FOUND: 'Campaign not found',
  CAMPAIGN_PASSWORD_REQUIRED: 'This campaign asks for a password',
  CAMPAIGN_PASSWORD_INVALID: 'The campaign password is incorrect',
  CAMPAIGN_CODE_EXHAUSTED: 'Unexpected server error',
  RATE_LIMITED: 'Too many join attempts',
  INVALID_PARAMS: 'The campaign id must be a uuid',
  FORBIDDEN: 'Your role at this table does not allow it',
  CAMPAIGN_NOT_OPEN: 'Open the campaign table to change its settings',
  INVALID_BODY: 'cover: the image must be a cover sent to this campaign',
};

export type CampaignsRoutesServices = Readonly<{
  campaigns: CampaignsService;
  join: CampaignJoinService;
  settings: CampaignSettingsService;
}>;

/** HTTP edge of campaigns; every route needs a session and acts as the session's user.
 *
 *  Example: `app.register(campaignsRoutes({ campaigns, join }), { prefix: '/api' })` */
export function campaignsRoutes(
  services: CampaignsRoutesServices,
): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(rateLimit, { global: false, errorResponseBuilder: rateLimitedError });
    app.setErrorHandler(replyWithApiError);
    registerCampaignRoutes(app, services.campaigns);
    registerJoinRoutes(app, services.join);
    registerSettingsRoutes(app, services.settings);
  };
}

function registerCampaignRoutes(app: FastifyInstance, service: CampaignsService): void {
  const { requireAuth, userOf } = app.authGuards;
  app.get('/campaigns', { preHandler: requireAuth }, async (request) => {
    const campaigns = await service.listMine(userOf(request).id);
    return { campaigns } satisfies ListCampaignsResponseDto;
  });
  app.post('/campaigns', { preHandler: requireAuth }, async (request, reply) => {
    const input = createCampaignRequestDto.parse(request.body);
    const campaign = await service.create(userOf(request).id, input);
    return reply.code(201).send({ campaign } satisfies CampaignResponseDto);
  });
  app.get('/campaigns/:campaignId', { preHandler: requireAuth }, async (request) => {
    const campaign = await service.detail(userOf(request).id, campaignIdOf(request));
    return { campaign } satisfies CampaignResponseDto;
  });
}

function registerJoinRoutes(app: FastifyInstance, service: CampaignJoinService): void {
  const { requireAuth, userOf } = app.authGuards;
  const rateLimitConfig = joinRateLimit((request) => userOf(request).id);
  const joinOptions = { preHandler: requireAuth, config: { rateLimit: rateLimitConfig } };
  app.post('/campaigns/join', joinOptions, async (request) => {
    const input = joinCampaignRequestDto.parse(request.body);
    const campaign = await service.join(userOf(request).id, input);
    return { campaign } satisfies JoinCampaignResponseDto;
  });
  app.post('/campaigns/:campaignId/enter', { preHandler: requireAuth }, async (request, reply) => {
    await service.enter(userOf(request).id, campaignIdOf(request));
    return reply.code(204).send();
  });
}

// Master only, with the table open: someone outside the table gets 404 CAMPAIGN_NOT_FOUND, a
// player 403 FORBIDDEN, the master without a live connection to it 403 CAMPAIGN_NOT_OPEN.
function registerSettingsRoutes(app: FastifyInstance, service: CampaignSettingsService): void {
  const { requireAuth, userOf } = app.authGuards;
  app.patch('/campaigns/:campaignId', { preHandler: requireAuth }, async (request) => {
    const campaignId = campaignIdOf(request);
    const input = updateCampaignRequestDto.parse(request.body);
    const campaign = await service.update(userOf(request).id, campaignId, input);
    return { campaign } satisfies CampaignResponseDto;
  });
  app.post('/campaigns/:campaignId/join-code', { preHandler: requireAuth }, async (request) => {
    const campaign = await service.regenerateJoinCode(userOf(request).id, campaignIdOf(request));
    return { campaign } satisfies CampaignResponseDto;
  });
  app.delete('/campaigns/:campaignId', { preHandler: requireAuth }, async (request, reply) => {
    await service.delete(userOf(request).id, campaignIdOf(request));
    return reply.code(204).send();
  });
}

function campaignIdOf(request: FastifyRequest): string {
  const parsed = campaignIdParamsDto.safeParse(request.params);
  if (parsed.success) return parsed.data.campaignId;
  throw new InvalidCampaignIdError(JSON.stringify(request.params));
}

function joinRateLimit(userIdOf: (request: FastifyRequest) => string): object {
  return {
    max: JOIN_ATTEMPTS_PER_MINUTE,
    timeWindow: '1 minute',
    // preHandler: added after the auth guard, so the key is the signed-in user.
    hook: 'preHandler',
    keyGenerator: userIdOf,
  };
}

function rateLimitedError(
  _request: FastifyRequest,
  context: { ttl: number },
): CampaignJoinRateLimitedError {
  return new CampaignJoinRateLimitedError(Math.max(1, Math.ceil(context.ttl / 1000)));
}

function toApiError(error: CampaignError): ApiErrorDto {
  const retry =
    error instanceof CampaignJoinRateLimitedError
      ? { retryAfterSeconds: error.retryAfterSeconds }
      : {};
  return { code: error.code, message: PUBLIC_MESSAGE[error.code], ...retry };
}

async function replyWithApiError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  if (error instanceof CampaignError && STATUS_BY_CODE[error.code] < 500) {
    return reply.code(STATUS_BY_CODE[error.code]).send(toApiError(error));
  }
  if (error instanceof ZodError) return reply.code(400).send(invalidBodyError(error));
  if (error.statusCode !== undefined && error.statusCode < 500) {
    return reply
      .code(error.statusCode)
      .send({ code: error.code, message: error.message } satisfies ApiErrorDto);
  }
  request.log.error({ err: error }, 'unexpected error in the campaigns module');
  return reply
    .code(500)
    .send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' } satisfies ApiErrorDto);
}
