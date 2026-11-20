import rateLimit from '@fastify/rate-limit';
import {
  USER_REPORT_ATTACHMENT_MAX_BYTES,
  USER_REPORT_ATTACHMENT_MIME_TYPES,
  listUserReportsQueryDto,
  profileCardParamsDto,
  resolveUserReportRequestDto,
  userReportAttachmentParamsDto,
  userReportParamsDto,
  userReportRequestDto,
  type ApiErrorDto,
  type UserReportAttachmentResponseDto,
  type UserReportResponseDto,
  type UserReportsPageDto,
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
import type { ReportAttachmentsService } from './report-attachments.service';
import {
  ReportAttachmentMediaTypeError,
  ReportAttachmentTooLargeError,
  ReportsError,
  ReportsRateLimitedError,
  type ReportsErrorCode,
} from './reports.error';
import type { ReportsService } from './reports.service';

// A report is rare: a handful a minute already covers a bad session, and the queue stays readable.
const REPORTS_PER_MINUTE = 5;
// Up to 5 screenshots per report, sent one by one: 20 a minute lets a reporter retry a few.
const ATTACHMENT_SENDS_PER_MINUTE = 20;
const ATTACHMENT_SEND_URL = '/reports/attachments';
// Evidence of a report: the backoffice browser never keeps a copy on disk.
const ATTACHMENT_CACHE_CONTROL = 'private, no-store';

const STATUS_BY_CODE: Readonly<Record<ReportsErrorCode, number>> = {
  REPORT_SELF: 400,
  REPORT_TARGET_NOT_FOUND: 404,
  REPORT_ALREADY_OPEN: 409,
  REPORT_NOT_FOUND: 404,
  REPORT_FORBIDDEN: 403,
  CAMPAIGN_NOT_SHARED: 400,
  ATTACHMENT_NOT_FOUND: 404,
  ATTACHMENT_TOO_LARGE: 413,
  UNSUPPORTED_IMAGE: 422,
  RATE_LIMITED: 429,
};

const PUBLIC_MESSAGE: Readonly<Record<ReportsErrorCode, string>> = {
  REPORT_SELF: 'You cannot report yourself',
  REPORT_TARGET_NOT_FOUND: 'Account not found',
  REPORT_ALREADY_OPEN: 'You already have an open report on this account',
  REPORT_NOT_FOUND: 'Report not found or already closed',
  REPORT_FORBIDDEN: 'Only an admin closes a report',
  CAMPAIGN_NOT_SHARED: 'The table is not one you both sit at',
  ATTACHMENT_NOT_FOUND: 'Screenshot not found',
  ATTACHMENT_TOO_LARGE: 'The screenshot is larger than 5 MB',
  UNSUPPORTED_IMAGE: 'The file is not a PNG, JPEG or WebP image',
  RATE_LIMITED: 'Too many reports in a row',
};

export type ReportsRouteServices = Readonly<{
  reports: ReportsService;
  attachments: ReportAttachmentsService;
}>;

/** HTTP edge of the reports: the reporter and the admin always come from the session.
 *
 *  Example: `app.register(reportsRoutes({ reports, attachments }), { prefix: '/api' })` */
export function reportsRoutes(
  services: ReportsRouteServices,
): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(rateLimit, { global: false, errorResponseBuilder: rateLimitedError });
    app.addContentTypeParser(
      [...USER_REPORT_ATTACHMENT_MIME_TYPES],
      { parseAs: 'buffer' },
      (_request, body, done) => done(null, body),
    );
    app.setErrorHandler(replyWithApiError);
    registerReportRoute(app, services.reports);
    registerAttachmentSend(app, services.attachments);
    registerAdminReportRoutes(app, services.reports);
    registerAttachmentRead(app, services.attachments);
  };
}

function registerReportRoute(app: FastifyInstance, service: ReportsService): void {
  const { requireAuth, userOf } = app.authGuards;
  const limit = app.rateLimit(perUserRateLimit(REPORTS_PER_MINUTE, '1 minute', userOf));
  const options = { preHandler: [requireAuth, limit] };
  app.post('/users/:userId/reports', options, async (request, reply) => {
    const { userId } = profileCardParamsDto.parse(request.params);
    const body = userReportRequestDto.parse(request.body);
    await service.report(userOf(request).id, userId, body);
    return reply.code(201).send();
  });
}

// onRequest: who has no session is refused before a 5 MiB body is read; the limit runs on
// preParsing, after the guard (the key is the user) and before the body.
function registerAttachmentSend(app: FastifyInstance, service: ReportAttachmentsService): void {
  const { requireAuth, userOf } = app.authGuards;
  const keyGenerator = (request: FastifyRequest): string => userOf(request).id;
  const options = {
    onRequest: requireAuth as onRequestAsyncHookHandler,
    bodyLimit: USER_REPORT_ATTACHMENT_MAX_BYTES,
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
    return reply.code(201).send({ attachment } satisfies UserReportAttachmentResponseDto);
  });
}

function registerAdminReportRoutes(app: FastifyInstance, service: ReportsService): void {
  const { requireRole, userOf } = app.authGuards;
  const admin = { preHandler: requireRole('admin') };
  app.get('/admin/reports', admin, async (request) => {
    const query = listUserReportsQueryDto.parse(request.query);
    return (await service.list(query)) satisfies UserReportsPageDto;
  });
  app.patch('/admin/reports/:reportId', admin, async (request) => {
    const { reportId } = userReportParamsDto.parse(request.params);
    const body = resolveUserReportRequestDto.parse(request.body);
    const report = await service.resolve(userOf(request), reportId, body);
    return { report } satisfies UserReportResponseDto;
  });
}

// Only the admin reads a screenshot back: not even the one who sent it.
function registerAttachmentRead(app: FastifyInstance, service: ReportAttachmentsService): void {
  const admin = { preHandler: app.authGuards.requireRole('admin') };
  const url = '/admin/reports/:reportId/attachments/:attachmentId';
  app.get(url, admin, async (request, reply) => {
    const parsed = userReportAttachmentParamsDto.safeParse(request.params);
    if (!parsed.success) {
      throw new ReportsError('ATTACHMENT_NOT_FOUND', `malformed ${JSON.stringify(request.params)}`);
    }
    const stored = await service.open(parsed.data.reportId, parsed.data.attachmentId);
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
  throw new ReportAttachmentMediaTypeError(String(request.headers['content-type']));
}

function rateLimitedError(
  _request: FastifyRequest,
  context: { ttl: number },
): ReportsRateLimitedError {
  return new ReportsRateLimitedError(Math.max(1, Math.ceil(context.ttl / 1000)));
}

// Fastify refuses a body before any handler runs; on the screenshot route those are its codes.
// Compared by suffix, so the prefix the module is registered under does not matter.
function fastifyBodyError(error: FastifyError, request: FastifyRequest): ReportsError | null {
  if (!request.routeOptions.url?.endsWith(ATTACHMENT_SEND_URL)) return null;
  if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    return new ReportAttachmentTooLargeError(USER_REPORT_ATTACHMENT_MAX_BYTES, null);
  }
  if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
    return new ReportAttachmentMediaTypeError(String(request.headers['content-type']));
  }
  return null;
}

function reportsErrorBody(error: ReportsError): ApiErrorDto {
  const retry =
    error instanceof ReportsRateLimitedError ? { retryAfterSeconds: error.retryAfterSeconds } : {};
  return { code: error.code, message: PUBLIC_MESSAGE[error.code], ...retry };
}

function statusOf(error: ReportsError): number {
  return error instanceof ReportAttachmentMediaTypeError ? 415 : STATUS_BY_CODE[error.code];
}

async function replyWithApiError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const known = fastifyBodyError(error, request) ?? (error instanceof ReportsError ? error : null);
  if (known !== null) {
    request.log.info({ code: known.code, detail: known.message }, 'reports request refused');
    return reply.code(statusOf(known)).send(reportsErrorBody(known));
  }
  if (error instanceof ZodError) return reply.code(400).send(invalidBodyError(error));
  if (error.statusCode !== undefined && error.statusCode < 500) {
    return reply
      .code(error.statusCode)
      .send({ code: error.code, message: error.message } satisfies ApiErrorDto);
  }
  request.log.error({ err: error }, 'unexpected error in the reports module');
  return reply
    .code(500)
    .send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' } satisfies ApiErrorDto);
}
