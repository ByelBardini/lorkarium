import rateLimit from '@fastify/rate-limit';
import {
  createSavedTokenRequestDto,
  savedTokenFolderParamsDto,
  savedTokenFolderRequestDto,
  savedTokenParamsDto,
  updateSavedTokenRequestDto,
  type ApiErrorDto,
  type SavedTokenDto,
  type SavedTokenFolderDto,
  type SavedTokensResponseDto,
} from '@lorkarium/contracts';
import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerAsyncHookHandler,
} from 'fastify';
import { ZodError } from 'zod';
import { invalidBodyError } from '../../lib/invalid-body';
import { perUserRateLimit } from '../../lib/per-user-rate-limit';
import { AssetNotFoundError } from '../assets/assets.error';
import { CampaignError, CampaignNotFoundError } from '../campaigns/campaigns.error';
import { withPlanLimitReply } from '../plans/plan-limit-response';
import type { SavedTokenFoldersService } from './saved-token-folders.service';
import type { SavedTokenOwner } from './saved-tokens.dao';
import {
  SavedTokenFolderNotFoundError,
  SavedTokenFoldersLimitError,
  SavedTokenNotFoundError,
  SavedTokensError,
  SavedTokensLimitError,
  SavedTokensRateLimitedError,
  type SavedTokensErrorCode,
} from './saved-tokens.error';
import type { SavedTokensService } from './saved-tokens.service';

const SAVED_TOKENS_URL = '/campaigns/:campaignId/saved-tokens';
const SAVED_TOKEN_URL = `${SAVED_TOKENS_URL}/:savedTokenId`;
const FOLDERS_URL = '/campaigns/:campaignId/saved-token-folders';
const FOLDER_URL = `${FOLDERS_URL}/:folderId`;
/** Creates, edits and deletes of one user, summed over the write routes of tokens and folders. */
const SAVED_TOKEN_WRITES_PER_MINUTE = 30;

type SavedTokensReply = Readonly<{ status: number; body: ApiErrorDto }>;

const STATUS_BY_CODE: Readonly<Record<SavedTokensErrorCode, number>> = {
  SAVED_TOKEN_NOT_FOUND: 404,
  SAVED_TOKENS_LIMIT: 422,
  SAVED_TOKEN_FOLDER_NOT_FOUND: 404,
  SAVED_TOKEN_FOLDER_NAME_TAKEN: 409,
  SAVED_TOKEN_FOLDERS_LIMIT: 422,
  RATE_LIMITED: 429,
};

// Public text only: the internal message cites ids and stays in the log. The two ceilings say the
// error's own limit (`limitMessageOf`); their entries here are the fallback.
const PUBLIC_MESSAGE: Readonly<Record<SavedTokensErrorCode, string>> = {
  SAVED_TOKEN_NOT_FOUND: 'Saved token not found',
  SAVED_TOKENS_LIMIT: 'You already keep the most saved tokens this table allows',
  SAVED_TOKEN_FOLDER_NOT_FOUND: 'Saved token folder not found',
  SAVED_TOKEN_FOLDER_NAME_TAKEN: 'You already have a folder with this name',
  SAVED_TOKEN_FOLDERS_LIMIT: 'You already keep the most folders this table allows',
  RATE_LIMITED: 'Too many changes in a row',
};

/** HTTP edge of the saved tokens, nested in the table (§2.6); every route needs a session and
 *  acts as the session's user, who is always the owner (never the body's).
 *
 *  Example: `app.register(savedTokensRoutes(service, folders), { prefix: '/api' })` */
export function savedTokensRoutes(
  service: SavedTokensService,
  folders: SavedTokenFoldersService,
): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(rateLimit, { global: false, errorResponseBuilder: rateLimitedError });
    app.setErrorHandler(withPlanLimitReply(replyWithApiError));
    const { requireAuth, userOf } = app.authGuards;
    // One limiter (one store) for every write route, keyed by the signed-in user.
    const writes = app.rateLimit(
      perUserRateLimit(SAVED_TOKEN_WRITES_PER_MINUTE, '1 minute', userOf),
    );
    const writeGuards: preHandlerAsyncHookHandler[] = [requireAuth, writes];
    registerSavedTokenRoutes(app, service, writeGuards);
    registerFolderRoutes(app, folders, writeGuards);
  };
}

function registerSavedTokenRoutes(
  app: FastifyInstance,
  service: SavedTokensService,
  writeGuards: preHandlerAsyncHookHandler[],
): void {
  const { requireAuth } = app.authGuards;
  app.get(SAVED_TOKENS_URL, { preHandler: requireAuth }, async (request) => {
    return (await service.list(ownerOf(app, request))) satisfies SavedTokensResponseDto;
  });
  app.post(SAVED_TOKENS_URL, { preHandler: writeGuards }, async (request, reply) => {
    const input = createSavedTokenRequestDto.parse(request.body);
    const saved = await service.create(ownerOf(app, request), input);
    return reply.code(201).send(saved satisfies SavedTokenDto);
  });
  app.patch(SAVED_TOKEN_URL, { preHandler: writeGuards }, async (request) => {
    const owner = ownerOf(app, request);
    const changes = updateSavedTokenRequestDto.parse(request.body);
    const savedTokenId = savedTokenIdOf(request, owner);
    return (await service.update(owner, savedTokenId, changes)) satisfies SavedTokenDto;
  });
  app.delete(SAVED_TOKEN_URL, { preHandler: writeGuards }, async (request, reply) => {
    const owner = ownerOf(app, request);
    await service.remove(owner, savedTokenIdOf(request, owner));
    return reply.code(204).send();
  });
}

function registerFolderRoutes(
  app: FastifyInstance,
  service: SavedTokenFoldersService,
  writeGuards: preHandlerAsyncHookHandler[],
): void {
  const { requireAuth } = app.authGuards;
  app.get(FOLDERS_URL, { preHandler: requireAuth }, async (request) => {
    return { folders: await service.list(ownerOf(app, request)) };
  });
  app.post(FOLDERS_URL, { preHandler: writeGuards }, async (request, reply) => {
    const { name } = savedTokenFolderRequestDto.parse(request.body);
    const folder = await service.create(ownerOf(app, request), name);
    return reply.code(201).send(folder satisfies SavedTokenFolderDto);
  });
  app.patch(FOLDER_URL, { preHandler: writeGuards }, async (request) => {
    const owner = ownerOf(app, request);
    const { name } = savedTokenFolderRequestDto.parse(request.body);
    const folderId = folderIdOf(request, owner);
    return (await service.rename(owner, folderId, name)) satisfies SavedTokenFolderDto;
  });
  app.delete(FOLDER_URL, { preHandler: writeGuards }, async (request, reply) => {
    const owner = ownerOf(app, request);
    await service.remove(owner, folderIdOf(request, owner));
    return reply.code(204).send();
  });
}

// A malformed id finds nothing, exactly like an id of another table (critério 14).
function ownerOf(app: FastifyInstance, request: FastifyRequest): SavedTokenOwner {
  const userId = app.authGuards.userOf(request).id;
  const { campaignId } = request.params as Readonly<Record<string, unknown>>;
  const parsed = savedTokenParamsDto.shape.campaignId.safeParse(campaignId);
  if (parsed.success) return { userId, campaignId: parsed.data };
  throw new CampaignNotFoundError({ campaignId: String(campaignId), userId });
}

function savedTokenIdOf(request: FastifyRequest, owner: SavedTokenOwner): string {
  const { savedTokenId } = request.params as Readonly<Record<string, unknown>>;
  const parsed = savedTokenParamsDto.shape.savedTokenId.safeParse(savedTokenId);
  if (parsed.success) return parsed.data;
  throw new SavedTokenNotFoundError(owner.campaignId, owner.userId, String(savedTokenId));
}

function folderIdOf(request: FastifyRequest, owner: SavedTokenOwner): string {
  const { folderId } = request.params as Readonly<Record<string, unknown>>;
  const parsed = savedTokenFolderParamsDto.shape.folderId.safeParse(folderId);
  if (parsed.success) return parsed.data;
  throw new SavedTokenFolderNotFoundError(owner.campaignId, owner.userId, String(folderId));
}

function rateLimitedError(
  _request: FastifyRequest,
  context: { ttl: number },
): SavedTokensRateLimitedError {
  return new SavedTokensRateLimitedError(Math.max(1, Math.ceil(context.ttl / 1000)));
}

function savedTokensErrorBody(error: SavedTokensError): ApiErrorDto {
  if (error instanceof SavedTokensRateLimitedError) {
    const { code, retryAfterSeconds } = error;
    return { code, message: PUBLIC_MESSAGE.RATE_LIMITED, retryAfterSeconds };
  }
  return { code: error.code, message: limitMessageOf(error) ?? PUBLIC_MESSAGE[error.code] };
}

function limitMessageOf(error: SavedTokensError): string | null {
  if (error instanceof SavedTokensLimitError) {
    return `You already keep ${error.limit} saved tokens at this table`;
  }
  if (error instanceof SavedTokenFoldersLimitError) {
    return `You already keep ${error.limit} folders at this table`;
  }
  return null;
}

function domainReplyOf(error: unknown): SavedTokensReply | null {
  if (error instanceof SavedTokensError) {
    return { status: STATUS_BY_CODE[error.code], body: savedTokensErrorBody(error) };
  }
  if (error instanceof AssetNotFoundError) {
    return { status: 404, body: { code: error.code, message: 'Image not found' } };
  }
  if (error instanceof CampaignError && error.code === 'CAMPAIGN_NOT_FOUND') {
    return { status: 404, body: { code: error.code, message: 'Campaign not found' } };
  }
  if (error instanceof CampaignError && error.code === 'FORBIDDEN') {
    const message = 'Your role at this table does not allow it';
    return { status: 403, body: { code: error.code, message } };
  }
  return null;
}

async function replyWithApiError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const domain = domainReplyOf(error);
  if (domain) return reply.code(domain.status).send(domain.body);
  if (error instanceof ZodError) return reply.code(400).send(invalidBodyError(error));
  if (error.statusCode !== undefined && error.statusCode < 500) {
    return reply
      .code(error.statusCode)
      .send({ code: error.code, message: error.message } satisfies ApiErrorDto);
  }
  request.log.error({ err: error }, 'unexpected error in the saved tokens module');
  return reply
    .code(500)
    .send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' } satisfies ApiErrorDto);
}
