import rateLimit from '@fastify/rate-limit';
import {
  createSavedRollRequestDto,
  savedRollFolderParamsDto,
  savedRollFolderRequestDto,
  savedRollParamsDto,
  updateSavedRollRequestDto,
  type ApiErrorDto,
  type SavedRollDto,
  type SavedRollFolderDto,
  type SavedRollsResponseDto,
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
import { CampaignError, CampaignNotFoundError } from '../campaigns/campaigns.error';
import { InvalidDiceExpressionError } from '../dice/dice.error';
import type { SavedRollFoldersService } from './saved-roll-folders.service';
import {
  SavedRollFolderNotFoundError,
  SavedRollNotFoundError,
  SavedRollsError,
  SavedRollsRateLimitedError,
  type SavedRollsErrorCode,
} from './saved-rolls.error';
import type { SavedRollOwner } from './saved-rolls.mapper';
import type { SavedRollsService } from './saved-rolls.service';

const SAVED_ROLLS_URL = '/campaigns/:campaignId/saved-rolls';
const SAVED_ROLL_URL = `${SAVED_ROLLS_URL}/:savedRollId`;
const FOLDERS_URL = '/campaigns/:campaignId/saved-roll-folders';
const FOLDER_URL = `${FOLDERS_URL}/:folderId`;
/** Creates, edits and deletes of one user, summed over the write routes of rolls and folders. */
const SAVED_ROLL_WRITES_PER_MINUTE = 30;

type SavedRollsReply = Readonly<{ status: number; body: ApiErrorDto }>;

const STATUS_BY_CODE: Readonly<Record<SavedRollsErrorCode, number>> = {
  SAVED_ROLL_NOT_FOUND: 404,
  SAVED_ROLL_NAME_TAKEN: 409,
  SAVED_ROLLS_LIMIT: 422,
  SAVED_ROLL_FOLDER_NOT_FOUND: 404,
  SAVED_ROLL_FOLDER_NAME_TAKEN: 409,
  SAVED_ROLL_FOLDERS_LIMIT: 422,
  RATE_LIMITED: 429,
};

// Public text only: the internal message cites ids and stays in the log. The dice expression
// (`InvalidDiceExpressionError`, of the dice module) is the exception: it is the person's own
// text, and the reason tells which piece to fix.
const PUBLIC_MESSAGE: Readonly<Record<SavedRollsErrorCode, string>> = {
  SAVED_ROLL_NOT_FOUND: 'Saved roll not found',
  SAVED_ROLL_NAME_TAKEN: 'You already have a saved roll with this name',
  SAVED_ROLLS_LIMIT: 'You already keep 50 saved rolls at this table',
  SAVED_ROLL_FOLDER_NOT_FOUND: 'Saved roll folder not found',
  SAVED_ROLL_FOLDER_NAME_TAKEN: 'You already have a folder with this name',
  SAVED_ROLL_FOLDERS_LIMIT: 'You already keep 50 folders at this table',
  RATE_LIMITED: 'Too many changes in a row',
};

/** HTTP edge of the saved rolls, nested in the table (§2.6); every route needs a session and
 *  acts as the session's user, who is always the owner (never the body's).
 *
 *  Example: `app.register(savedRollsRoutes(service, folders), { prefix: '/api' })` */
export function savedRollsRoutes(
  service: SavedRollsService,
  folders: SavedRollFoldersService,
): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(rateLimit, { global: false, errorResponseBuilder: rateLimitedError });
    app.setErrorHandler(replyWithApiError);
    const { requireAuth, userOf } = app.authGuards;
    // One limiter (one store) for every write route, keyed by the signed-in user.
    const writes = app.rateLimit(
      perUserRateLimit(SAVED_ROLL_WRITES_PER_MINUTE, '1 minute', userOf),
    );
    const writeGuards: preHandlerAsyncHookHandler[] = [requireAuth, writes];
    registerSavedRollRoutes(app, service, writeGuards);
    registerFolderRoutes(app, folders, writeGuards);
  };
}

function registerSavedRollRoutes(
  app: FastifyInstance,
  service: SavedRollsService,
  writeGuards: preHandlerAsyncHookHandler[],
): void {
  const { requireAuth } = app.authGuards;
  app.get(SAVED_ROLLS_URL, { preHandler: requireAuth }, async (request) => {
    return (await service.list(ownerOf(app, request))) satisfies SavedRollsResponseDto;
  });
  app.post(SAVED_ROLLS_URL, { preHandler: writeGuards }, async (request, reply) => {
    const input = createSavedRollRequestDto.parse(request.body);
    const roll = await service.create(ownerOf(app, request), input);
    return reply.code(201).send(roll satisfies SavedRollDto);
  });
  app.patch(SAVED_ROLL_URL, { preHandler: writeGuards }, async (request) => {
    const owner = ownerOf(app, request);
    const changes = updateSavedRollRequestDto.parse(request.body);
    const savedRollId = savedRollIdOf(request, owner);
    return (await service.update(owner, savedRollId, changes)) satisfies SavedRollDto;
  });
  app.delete(SAVED_ROLL_URL, { preHandler: writeGuards }, async (request, reply) => {
    const owner = ownerOf(app, request);
    await service.remove(owner, savedRollIdOf(request, owner));
    return reply.code(204).send();
  });
}

function registerFolderRoutes(
  app: FastifyInstance,
  service: SavedRollFoldersService,
  writeGuards: preHandlerAsyncHookHandler[],
): void {
  const { requireAuth } = app.authGuards;
  app.get(FOLDERS_URL, { preHandler: requireAuth }, async (request) => {
    return { folders: await service.list(ownerOf(app, request)) };
  });
  app.post(FOLDERS_URL, { preHandler: writeGuards }, async (request, reply) => {
    const { name } = savedRollFolderRequestDto.parse(request.body);
    const folder = await service.create(ownerOf(app, request), name);
    return reply.code(201).send(folder satisfies SavedRollFolderDto);
  });
  app.patch(FOLDER_URL, { preHandler: writeGuards }, async (request) => {
    const owner = ownerOf(app, request);
    const { name } = savedRollFolderRequestDto.parse(request.body);
    const folderId = folderIdOf(request, owner);
    return (await service.rename(owner, folderId, name)) satisfies SavedRollFolderDto;
  });
  app.delete(FOLDER_URL, { preHandler: writeGuards }, async (request, reply) => {
    const owner = ownerOf(app, request);
    await service.remove(owner, folderIdOf(request, owner));
    return reply.code(204).send();
  });
}

// A malformed id finds nothing, exactly like an id of another table (critério 14).
function ownerOf(app: FastifyInstance, request: FastifyRequest): SavedRollOwner {
  const userId = app.authGuards.userOf(request).id;
  const { campaignId } = request.params as Readonly<Record<string, unknown>>;
  const parsed = savedRollParamsDto.shape.campaignId.safeParse(campaignId);
  if (parsed.success) return { userId, campaignId: parsed.data };
  throw new CampaignNotFoundError({ campaignId: String(campaignId), userId });
}

function savedRollIdOf(request: FastifyRequest, owner: SavedRollOwner): string {
  const { savedRollId } = request.params as Readonly<Record<string, unknown>>;
  const parsed = savedRollParamsDto.shape.savedRollId.safeParse(savedRollId);
  if (parsed.success) return parsed.data;
  throw new SavedRollNotFoundError(owner.campaignId, owner.userId, String(savedRollId));
}

function folderIdOf(request: FastifyRequest, owner: SavedRollOwner): string {
  const { folderId } = request.params as Readonly<Record<string, unknown>>;
  const parsed = savedRollFolderParamsDto.shape.folderId.safeParse(folderId);
  if (parsed.success) return parsed.data;
  throw new SavedRollFolderNotFoundError(owner.campaignId, owner.userId, String(folderId));
}

function rateLimitedError(
  _request: FastifyRequest,
  context: { ttl: number },
): SavedRollsRateLimitedError {
  return new SavedRollsRateLimitedError(Math.max(1, Math.ceil(context.ttl / 1000)));
}

function savedRollsErrorBody(error: SavedRollsError): ApiErrorDto {
  if (error instanceof SavedRollsRateLimitedError) {
    const { code, retryAfterSeconds } = error;
    return { code, message: PUBLIC_MESSAGE.RATE_LIMITED, retryAfterSeconds };
  }
  return { code: error.code, message: PUBLIC_MESSAGE[error.code] };
}

function domainReplyOf(error: unknown): SavedRollsReply | null {
  if (error instanceof InvalidDiceExpressionError) {
    return { status: 400, body: { code: error.code, message: error.message } };
  }
  if (error instanceof SavedRollsError) {
    return { status: STATUS_BY_CODE[error.code], body: savedRollsErrorBody(error) };
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
  request.log.error({ err: error }, 'unexpected error in the saved rolls module');
  return reply
    .code(500)
    .send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' } satisfies ApiErrorDto);
}
