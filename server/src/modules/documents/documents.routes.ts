import rateLimit from '@fastify/rate-limit';
import {
  ASSET_MAX_BYTES,
  ASSET_MIME_TYPES,
  createDocumentRequestDto,
  createDocumentTabRequestDto,
  deleteDocumentRequestDto,
  deleteDocumentTabRequestDto,
  documentParamsDto,
  documentTabParamsDto,
  reorderDocumentTabsRequestDto,
  updateDocumentTabContentRequestDto,
  updateDocumentTabRequestDto,
  importDocumentImageRequestDto,
  documentImageFromLibraryRequestDto,
  updateDocumentContentRequestDto,
  updateDocumentRequestDto,
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
import { AssetError } from '../assets/assets.error';
import { LibraryError } from '../library/library.error';
import { LibraryImageNotFoundError } from '../library/library-image.error';
import type { LibraryRequester } from '../library/library.service';
import {
  DocumentError,
  DocumentNotFoundError,
  DocumentTabNotFoundError,
  type DocumentErrorCode,
} from './documents.error';
import type { DocumentsService } from './documents.service';
import type { DocumentTabsService } from './document-tabs.service';
import type { DocumentImagesService, DocumentTabTarget } from './document-images.service';

const DOCUMENTS = '/campaigns/:campaignId/documents';
const DOCUMENT = `${DOCUMENTS}/:documentId`;
const TABS = `${DOCUMENT}/tabs`;
const TAB = `${TABS}/:tabId`;
const DOCUMENT_ERROR_STATUS: Partial<Record<DocumentErrorCode, number>> = {
  DOCUMENT_VERSION_CONFLICT: 409,
  DOCUMENT_ACTION_REUSED: 409,
  DOCUMENT_TAB_LAST: 409,
  DOCUMENT_TAB_LIMIT: 422,
};
export type DocumentServices = Readonly<{
  documents: DocumentsService;
  tabs: DocumentTabsService;
  images: DocumentImagesService;
}>;
/** The document, tab and tab-image routes under `/campaigns/:campaignId/documents`.
 *
 *  Example: `await app.register(documentsRoutes({ documents, tabs, images }), { prefix: '/api' })` */
export function documentsRoutes(
  services: DocumentServices,
): (app: FastifyInstance) => Promise<void> {
  return async (app) => {
    app.setErrorHandler(documentErrorReply);
    app.addHook('onSend', async (_request, reply, payload) => {
      reply.header('cache-control', 'private, no-store');
      return payload;
    });
    await app.register(rateLimit, { global: false });
    app.addContentTypeParser([...ASSET_MIME_TYPES], { parseAs: 'buffer' }, (_request, body, done) =>
      done(null, body),
    );
    registerDocumentRoutes(app, services.documents);
    registerTabRoutes(app, services.tabs);
    registerTabContentRoutes(app, services.tabs);
    registerImageRoutes(app, services.images);
  };
}
function registerDocumentRoutes(app: FastifyInstance, service: DocumentsService): void {
  const options = { preHandler: app.authGuards.requireAuth, bodyLimit: 1024 * 1024 };
  app.get(DOCUMENT, options, async (request, reply) => {
    reply.header('cache-control', 'private, no-store');
    return { document: await service.get(requesterOf(app, request), documentIdOf(request)) };
  });
  app.post(DOCUMENTS, options, async (request, reply) =>
    reply
      .code(201)
      .send(
        await service.create(
          requesterOf(app, request),
          createDocumentRequestDto.parse(request.body),
        ),
      ),
  );
  app.patch(`${DOCUMENT}/content`, options, (request) =>
    service.updateContent(
      requesterOf(app, request),
      documentIdOf(request),
      updateDocumentContentRequestDto.parse(request.body),
    ),
  );
  app.patch(DOCUMENT, options, (request) =>
    service.update(
      requesterOf(app, request),
      documentIdOf(request),
      updateDocumentRequestDto.parse(request.body),
    ),
  );
  app.delete(DOCUMENT, options, async (request, reply) => {
    await service.delete(
      requesterOf(app, request),
      documentIdOf(request),
      deleteDocumentRequestDto.parse(request.body),
    );
    return reply.code(204).send();
  });
}
function registerTabRoutes(app: FastifyInstance, tabs: DocumentTabsService): void {
  const options = { preHandler: app.authGuards.requireAuth, bodyLimit: 1024 * 1024 };
  app.post(TABS, options, async (request, reply) =>
    reply
      .code(201)
      .send(
        await tabs.create(
          requesterOf(app, request),
          documentIdOf(request),
          createDocumentTabRequestDto.parse(request.body),
        ),
      ),
  );
  app.patch(`${TABS}/order`, options, (request) =>
    tabs.reorder(
      requesterOf(app, request),
      documentIdOf(request),
      reorderDocumentTabsRequestDto.parse(request.body),
    ),
  );
  app.patch(TAB, options, (request) => {
    const { documentId, tabId } = tabTargetOf(request);
    const input = updateDocumentTabRequestDto.parse(request.body);
    return tabs.update(requesterOf(app, request), documentId, tabId, input);
  });
  app.delete(TAB, options, (request) => {
    const { documentId, tabId } = tabTargetOf(request);
    const input = deleteDocumentTabRequestDto.parse(request.body);
    return tabs.delete(requesterOf(app, request), documentId, tabId, input);
  });
}
function registerTabContentRoutes(app: FastifyInstance, tabs: DocumentTabsService): void {
  const options = { preHandler: app.authGuards.requireAuth, bodyLimit: 1024 * 1024 };
  app.get(TAB, options, async (request) => {
    const { documentId, tabId } = tabTargetOf(request);
    return { tab: await tabs.get(requesterOf(app, request), documentId, tabId) };
  });
  app.patch(`${TAB}/content`, options, (request) => {
    const { documentId, tabId } = tabTargetOf(request);
    const input = updateDocumentTabContentRequestDto.parse(request.body);
    return tabs.updateContent(requesterOf(app, request), documentId, tabId, input);
  });
}
function registerImageRoutes(app: FastifyInstance, images: DocumentImagesService): void {
  const onRequest = app.authGuards.requireAuth as onRequestAsyncHookHandler;
  const options = {
    onRequest,
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
        hook: 'preParsing' as const,
        keyGenerator: (request: FastifyRequest) => app.authGuards.userOf(request).id,
      },
    },
  };
  app.post(`${TAB}/images`, { ...options, bodyLimit: ASSET_MAX_BYTES }, async (request, reply) => {
    const asset = await images.upload(
      requesterOf(app, request),
      tabTargetOf(request),
      new Uint8Array(request.body as Buffer),
    );
    return reply.code(201).send({ asset });
  });
  app.post(`${TAB}/images/import`, options, async (request, reply) => {
    const { url } = importDocumentImageRequestDto.parse(request.body);
    return reply.code(201).send({
      asset: await images.importLink(requesterOf(app, request), tabTargetOf(request), url),
    });
  });
  app.post(`${TAB}/images/from-library`, options, async (request, reply) => {
    const { imageId } = documentImageFromLibraryRequestDto.parse(request.body);
    return reply.code(201).send({
      asset: await images.fromLibrary(requesterOf(app, request), tabTargetOf(request), imageId),
    });
  });
}
function requesterOf(app: FastifyInstance, request: FastifyRequest): LibraryRequester {
  const userId = app.authGuards.userOf(request).id;
  const { campaignId } = request.params as Record<string, unknown>;
  const parsed = documentParamsDto.shape.campaignId.safeParse(campaignId);
  if (!parsed.success) throw new CampaignNotFoundError({ campaignId: String(campaignId), userId });
  return { campaignId: parsed.data, userId };
}
function documentIdOf(request: FastifyRequest): string {
  const { documentId, campaignId } = request.params as Record<string, unknown>;
  const parsed = documentParamsDto.shape.documentId.safeParse(documentId);
  if (!parsed.success) throw new DocumentNotFoundError(String(campaignId), String(documentId));
  return parsed.data;
}
function tabTargetOf(request: FastifyRequest): DocumentTabTarget {
  const documentId = documentIdOf(request);
  const { tabId } = request.params as Record<string, unknown>;
  const parsed = documentTabParamsDto.shape.tabId.safeParse(tabId);
  if (!parsed.success) throw new DocumentTabNotFoundError(documentId, String(tabId));
  return { documentId, tabId: parsed.data };
}
async function documentErrorReply(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  if (error instanceof ZodError) return reply.code(400).send(invalidBodyError(error));
  if (error instanceof DocumentError)
    return reply.code(DOCUMENT_ERROR_STATUS[error.code] ?? 404).send({
      code: error.code,
      message: documentErrorMessage(error.code),
    });
  if (error instanceof CampaignError)
    return reply.code(error.code === 'FORBIDDEN' ? 403 : 404).send({
      code: error.code,
      message:
        error.code === 'FORBIDDEN' ? 'Your role does not allow this action' : 'Campaign not found',
    });
  if (error instanceof LibraryError || error instanceof LibraryImageNotFoundError)
    return reply.code(404).send({ code: error.code, message: 'Library item not found' });
  if (error instanceof AssetError)
    return reply
      .code(
        error.code === 'ASSET_NOT_FOUND'
          ? 404
          : error.code === 'ASSET_TOO_LARGE'
            ? 413
            : error.code === 'RATE_LIMITED'
              ? 429
              : 422,
      )
      .send({ code: error.code, message: 'Image could not be used' });
  if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE')
    return reply.code(413).send({ code: 'ASSET_TOO_LARGE', message: 'Image too large' });
  if (error.statusCode && error.statusCode < 500)
    return reply.code(error.statusCode).send({ code: error.code, message: error.message });
  request.log.error({ err: error }, 'unexpected error in documents');
  return reply.code(500).send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' });
}
function documentErrorMessage(code: DocumentErrorCode): string {
  if (code === 'DOCUMENT_VERSION_CONFLICT') return 'Document version conflict';
  if (code === 'DOCUMENT_TAB_LIMIT') return 'Document tab limit reached';
  if (code === 'DOCUMENT_TAB_LAST') return 'A document keeps at least one tab';
  return 'Document not available';
}
