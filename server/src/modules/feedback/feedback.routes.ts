import rateLimit from '@fastify/rate-limit';
import {
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_MIME_TYPES,
  feedbackAttachmentParamsDto,
  feedbackParamsDto,
  feedbackRequestDto,
  listFeedbackQueryDto,
  publishFeedbackRequestDto,
  type ApiErrorDto,
  type FeedbackPageDto,
  type PublishFeedbackResponseDto,
  type ScreenshotResponseDto,
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
import { perUserRateLimit } from '../../lib/per-user-rate-limit';
import type { FeedbackAttachmentsService } from './feedback-attachments.service';
import {
  FeedbackAttachmentMediaTypeError,
  FeedbackAttachmentTooLargeError,
  FeedbackError,
  FeedbackRateLimitedError,
  type FeedbackErrorCode,
} from './feedback.error';
import type { FeedbackService } from './feedback.service';

// A handful an hour covers a bad session; the queue is read by a person.
const ENTRIES_PER_HOUR = 5;
// Up to 5 screenshots per entry, sent one by one: 20 a minute lets a sender retry a few.
const ATTACHMENT_SENDS_PER_MINUTE = 20;
const ATTACHMENT_SEND_URL = '/feedback/attachments';
// A screenshot may show what the sender did not mean to publish: no copy on the admin's disk.
const ATTACHMENT_CACHE_CONTROL = 'private, no-store';

const STATUS_BY_CODE: Readonly<Record<FeedbackErrorCode, number>> = {
  FEEDBACK_FORBIDDEN: 403,
  FEEDBACK_OPEN_LIMIT: 409,
  FEEDBACK_NOT_FOUND: 404,
  ATTACHMENT_NOT_FOUND: 404,
  ATTACHMENT_TOO_LARGE: 413,
  UNSUPPORTED_IMAGE: 422,
  ISSUE_TRACKER_UNAVAILABLE: 502,
  ISSUE_TRACKER_NOT_CONFIGURED: 503,
  RATE_LIMITED: 429,
};

const PUBLIC_MESSAGE: Readonly<Record<FeedbackErrorCode, string>> = {
  FEEDBACK_FORBIDDEN: 'A suspended account sends no feedback',
  FEEDBACK_OPEN_LIMIT: 'You already have 10 entries waiting for review',
  FEEDBACK_NOT_FOUND: 'Feedback not found or already closed',
  ATTACHMENT_NOT_FOUND: 'Screenshot not found',
  ATTACHMENT_TOO_LARGE: 'The screenshot is larger than 5 MB',
  UNSUPPORTED_IMAGE: 'The file is not a PNG, JPEG or WebP image',
  ISSUE_TRACKER_UNAVAILABLE: 'GitHub did not answer; the entry stays in the queue',
  ISSUE_TRACKER_NOT_CONFIGURED: 'The GitHub integration is not set up on this server',
  RATE_LIMITED: 'Too many feedback requests in a row',
};

export type FeedbackRouteServices = Readonly<{
  feedback: FeedbackService;
  attachments: FeedbackAttachmentsService;
}>;

/** HTTP edge of the feedback: the sender and the admin always come from the session.
 *
 *  Example: `app.register(feedbackRoutes({ feedback, attachments }), { prefix: '/api' })` */
export function feedbackRoutes(
  services: FeedbackRouteServices,
): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(rateLimit, { global: false, errorResponseBuilder: rateLimitedError });
    app.addContentTypeParser(
      [...SCREENSHOT_MIME_TYPES],
      { parseAs: 'buffer' },
      (_request, body, done) => done(null, body),
    );
    app.setErrorHandler(replyWithApiError);
    registerSubmit(app, services.feedback);
    registerAttachmentSend(app, services.attachments);
    registerAdminQueue(app, services.feedback);
    registerAttachmentRead(app, services.attachments);
  };
}

function registerSubmit(app: FastifyInstance, service: FeedbackService): void {
  const { requireAuth, userOf } = app.authGuards;
  const limit = app.rateLimit(perUserRateLimit(ENTRIES_PER_HOUR, '1 hour', userOf));
  app.post('/feedback', { preHandler: [requireAuth, limit] }, async (request, reply) => {
    await service.submit(userOf(request).id, feedbackRequestDto.parse(request.body));
    return reply.code(201).send();
  });
}

// onRequest: who has no session is refused before a 5 MiB body is read; the limit runs on
// preParsing, after the guard (the key is the user) and before the body.
function registerAttachmentSend(app: FastifyInstance, service: FeedbackAttachmentsService): void {
  const { requireAuth, userOf } = app.authGuards;
  const keyGenerator = (request: FastifyRequest): string => userOf(request).id;
  const options = {
    onRequest: requireAuth as onRequestAsyncHookHandler,
    bodyLimit: SCREENSHOT_MAX_BYTES,
    config: {
      rateLimit: {
        max: ATTACHMENT_SENDS_PER_MINUTE,
        timeWindow: '1 minute',
        hook: 'preParsing' as const,
        keyGenerator,
      },
    },
  };
  app.post(ATTACHMENT_SEND_URL, options, async (request, reply) => {
    const attachment = await service.upload(userOf(request).id, imageBytesOf(request));
    return reply.code(201).send({ attachment } satisfies ScreenshotResponseDto);
  });
}

function registerAdminQueue(app: FastifyInstance, service: FeedbackService): void {
  const admin = { preHandler: app.authGuards.requireRole('admin') };
  app.get('/admin/feedback', admin, async (request) => {
    return (await service.list(
      listFeedbackQueryDto.parse(request.query),
    )) satisfies FeedbackPageDto;
  });
  app.post('/admin/feedback/:feedbackId/publish', admin, async (request) => {
    const { feedbackId } = feedbackParamsDto.parse(request.params);
    const body = publishFeedbackRequestDto.parse(request.body);
    return (await service.publish(feedbackId, body)) satisfies PublishFeedbackResponseDto;
  });
  app.post('/admin/feedback/:feedbackId/archive', admin, async (request, reply) => {
    const { feedbackId } = feedbackParamsDto.parse(request.params);
    await service.archive(feedbackId);
    return reply.code(204).send();
  });
}

// Only the admin reads a screenshot back: not even the one who sent it.
function registerAttachmentRead(app: FastifyInstance, service: FeedbackAttachmentsService): void {
  const admin = { preHandler: app.authGuards.requireRole('admin') };
  const url = '/admin/feedback/:feedbackId/attachments/:attachmentId';
  app.get(url, admin, async (request, reply) => {
    const parsed = feedbackAttachmentParamsDto.safeParse(request.params);
    if (!parsed.success) {
      throw new FeedbackError(
        'ATTACHMENT_NOT_FOUND',
        `malformed ${JSON.stringify(request.params)}`,
      );
    }
    const stored = await service.open(parsed.data.feedbackId, parsed.data.attachmentId);
    return reply
      .header('content-type', stored.mimeType)
      .header('content-length', stored.size)
      .header('cache-control', ATTACHMENT_CACHE_CONTROL)
      .header('x-content-type-options', 'nosniff')
      .send(stored.body);
  });
}

// JSON and text keep their parsers: such a body on the screenshot route is a 415.
function imageBytesOf(request: FastifyRequest): Uint8Array {
  if (Buffer.isBuffer(request.body)) return new Uint8Array(request.body);
  throw new FeedbackAttachmentMediaTypeError(String(request.headers['content-type']));
}

function rateLimitedError(
  _request: FastifyRequest,
  context: { ttl: number },
): FeedbackRateLimitedError {
  return new FeedbackRateLimitedError(Math.max(1, Math.ceil(context.ttl / 1000)));
}

// Fastify refuses a body before any handler runs; on the screenshot route those are its codes.
// Compared by suffix, so the prefix the module is registered under does not matter.
function fastifyBodyError(error: FastifyError, request: FastifyRequest): FeedbackError | null {
  if (!request.routeOptions.url?.endsWith(ATTACHMENT_SEND_URL)) return null;
  if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    return new FeedbackAttachmentTooLargeError(SCREENSHOT_MAX_BYTES, null);
  }
  if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
    return new FeedbackAttachmentMediaTypeError(String(request.headers['content-type']));
  }
  return null;
}

function feedbackErrorBody(error: FeedbackError): ApiErrorDto {
  const retry =
    error instanceof FeedbackRateLimitedError ? { retryAfterSeconds: error.retryAfterSeconds } : {};
  return { code: error.code, message: PUBLIC_MESSAGE[error.code], ...retry };
}

function statusOf(error: FeedbackError): number {
  return error instanceof FeedbackAttachmentMediaTypeError ? 415 : STATUS_BY_CODE[error.code];
}

async function replyWithApiError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const known = fastifyBodyError(error, request) ?? (error instanceof FeedbackError ? error : null);
  if (known !== null) {
    const level = statusOf(known) >= 500 ? 'warn' : 'info';
    request.log[level]({ code: known.code, detail: known.message }, 'feedback request refused');
    return reply.code(statusOf(known)).send(feedbackErrorBody(known));
  }
  if (error instanceof ZodError) return reply.code(400).send(invalidBodyError(error));
  if (error.statusCode !== undefined && error.statusCode < 500) {
    return reply
      .code(error.statusCode)
      .send({ code: error.code, message: error.message } satisfies ApiErrorDto);
  }
  request.log.error({ err: error }, 'unexpected error in the feedback module');
  return reply
    .code(500)
    .send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' } satisfies ApiErrorDto);
}
