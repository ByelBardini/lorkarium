import {
  createLibrarySceneRequestDto,
  createSceneFolderRequestDto,
  librarySceneParamsDto,
  sceneFolderParamsDto,
  updateLibrarySceneRequestDto,
  updateSceneFolderRequestDto,
  type ApiErrorDto,
  type LibraryDto,
  type LibrarySceneDto,
  type SceneFolderDto,
} from '@lorkarium/contracts';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { invalidBodyError } from '../../lib/invalid-body';
import { CampaignError, CampaignNotFoundError } from '../campaigns/campaigns.error';
import { SceneError, SceneNotFoundError } from '../scenes/scenes.error';
import { FolderNotFoundError, LibraryError, type LibraryErrorCode } from './library.error';
import type { LibraryRequester, LibraryService } from './library.service';

const LIBRARY_URL = '/campaigns/:campaignId/scenes';
const LIBRARY_SCENE_URL = `${LIBRARY_URL}/:sceneId`;
const SCENE_COPIES_URL = `${LIBRARY_SCENE_URL}/copies`;
const FOLDERS_URL = '/campaigns/:campaignId/scene-folders';
const FOLDER_URL = `${FOLDERS_URL}/:folderId`;

type LibraryReply = Readonly<{ status: number; body: ApiErrorDto }>;

const STATUS_BY_CODE: Readonly<Record<LibraryErrorCode, number>> = {
  FOLDER_NOT_FOUND: 404,
  FOLDER_CYCLE: 409,
  FOLDER_TOO_DEEP: 422,
  SCENE_IS_ACTIVE: 409,
};

// Public text only: the internal message cites ids and stays in the log.
const PUBLIC_MESSAGE: Readonly<Record<LibraryErrorCode, string>> = {
  FOLDER_NOT_FOUND: 'Folder not found',
  FOLDER_CYCLE: 'A folder cannot go inside itself',
  FOLDER_TOO_DEEP: 'Folders go at most 5 levels deep',
  SCENE_IS_ACTIVE: 'The group is on this grid; take it elsewhere first',
};

/** HTTP edge of the scene library, nested in the table (§2.6); every route needs a session and
 *  acts as the session's user.
 *
 *  Example: `app.register(libraryRoutes(service), { prefix: '/api' })` */
export function libraryRoutes(service: LibraryService): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    app.setErrorHandler(replyWithApiError);
    registerSceneRoutes(app, service);
    registerFolderRoutes(app, service);
  };
}

function registerSceneRoutes(app: FastifyInstance, service: LibraryService): void {
  const { requireAuth } = app.authGuards;
  app.get(LIBRARY_URL, { preHandler: requireAuth }, async (request) => {
    return (await service.list(requesterOf(app, request))) satisfies LibraryDto;
  });
  app.post(LIBRARY_URL, { preHandler: requireAuth }, async (request, reply) => {
    const input = createLibrarySceneRequestDto.parse(request.body);
    const scene = await service.createScene(requesterOf(app, request), input);
    return reply.code(201).send(scene satisfies LibrarySceneDto);
  });
  app.patch(LIBRARY_SCENE_URL, { preHandler: requireAuth }, async (request) => {
    const requester = requesterOf(app, request);
    const changes = updateLibrarySceneRequestDto.parse(request.body);
    const sceneId = sceneIdOf(request, requester);
    return (await service.updateScene(requester, sceneId, changes)) satisfies LibrarySceneDto;
  });
  app.delete(LIBRARY_SCENE_URL, { preHandler: requireAuth }, async (request, reply) => {
    const requester = requesterOf(app, request);
    await service.deleteScene(requester, sceneIdOf(request, requester));
    return reply.code(204).send();
  });
  app.post(SCENE_COPIES_URL, { preHandler: requireAuth }, async (request, reply) => {
    const requester = requesterOf(app, request);
    const copy = await service.duplicate(requester, sceneIdOf(request, requester));
    return reply.code(201).send(copy satisfies LibrarySceneDto);
  });
}

function registerFolderRoutes(app: FastifyInstance, service: LibraryService): void {
  const { requireAuth } = app.authGuards;
  app.post(FOLDERS_URL, { preHandler: requireAuth }, async (request, reply) => {
    const input = createSceneFolderRequestDto.parse(request.body);
    const folder = await service.createFolder(requesterOf(app, request), input);
    return reply.code(201).send(folder satisfies SceneFolderDto);
  });
  app.patch(FOLDER_URL, { preHandler: requireAuth }, async (request) => {
    const requester = requesterOf(app, request);
    const changes = updateSceneFolderRequestDto.parse(request.body);
    const folderId = folderIdOf(request, requester);
    return (await service.updateFolder(requester, folderId, changes)) satisfies SceneFolderDto;
  });
  app.delete(FOLDER_URL, { preHandler: requireAuth }, async (request, reply) => {
    const requester = requesterOf(app, request);
    await service.deleteFolder(requester, folderIdOf(request, requester));
    return reply.code(204).send();
  });
}

// A malformed id finds nothing, exactly like an id of another table (critério 14).
function requesterOf(app: FastifyInstance, request: FastifyRequest): LibraryRequester {
  const userId = app.authGuards.userOf(request).id;
  const { campaignId } = request.params as Readonly<Record<string, unknown>>;
  const parsed = librarySceneParamsDto.shape.campaignId.safeParse(campaignId);
  if (parsed.success) return { userId, campaignId: parsed.data };
  throw new CampaignNotFoundError({ campaignId: String(campaignId), userId });
}

function sceneIdOf(request: FastifyRequest, requester: LibraryRequester): string {
  const { sceneId } = request.params as Readonly<Record<string, unknown>>;
  const parsed = librarySceneParamsDto.shape.sceneId.safeParse(sceneId);
  if (parsed.success) return parsed.data;
  throw new SceneNotFoundError(requester.campaignId, String(sceneId), requester.userId);
}

function folderIdOf(request: FastifyRequest, requester: LibraryRequester): string {
  const { folderId } = request.params as Readonly<Record<string, unknown>>;
  const parsed = sceneFolderParamsDto.shape.folderId.safeParse(folderId);
  if (parsed.success) return parsed.data;
  throw new FolderNotFoundError(requester.campaignId, String(folderId));
}

function domainReplyOf(error: unknown): LibraryReply | null {
  if (error instanceof LibraryError) {
    const body = { code: error.code, message: PUBLIC_MESSAGE[error.code] };
    return { status: STATUS_BY_CODE[error.code], body };
  }
  if (error instanceof SceneError) {
    return { status: 404, body: { code: error.code, message: 'Grid not found' } };
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
  request.log.error({ err: error }, 'unexpected error in the library module');
  return reply
    .code(500)
    .send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' } satisfies ApiErrorDto);
}
