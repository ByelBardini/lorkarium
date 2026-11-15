import rateLimit from '@fastify/rate-limit';
import {
  listUserReportsQueryDto,
  profileCardParamsDto,
  resolveUserReportRequestDto,
  userReportParamsDto,
  userReportRequestDto,
  type ApiErrorDto,
  type UserReportResponseDto,
  type UserReportsPageDto,
} from '@lorkarium/contracts';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { invalidBodyError } from '../../lib/invalid-body';
import { perUserRateLimit } from '../../lib/per-user-rate-limit';
import { ReportsError, ReportsRateLimitedError, type ReportsErrorCode } from './reports.error';
import type { ReportsService } from './reports.service';

// A report is rare: a handful a minute already covers a bad session, and the queue stays readable.
const REPORTS_PER_MINUTE = 5;

const STATUS_BY_CODE: Readonly<Record<ReportsErrorCode, number>> = {
  REPORT_SELF: 400,
  REPORT_TARGET_NOT_FOUND: 404,
  REPORT_ALREADY_OPEN: 409,
  REPORT_NOT_FOUND: 404,
  REPORT_FORBIDDEN: 403,
  RATE_LIMITED: 429,
};

const PUBLIC_MESSAGE: Readonly<Record<ReportsErrorCode, string>> = {
  REPORT_SELF: 'You cannot report yourself',
  REPORT_TARGET_NOT_FOUND: 'Account not found',
  REPORT_ALREADY_OPEN: 'You already have an open report on this account',
  REPORT_NOT_FOUND: 'Report not found or already closed',
  REPORT_FORBIDDEN: 'Only an admin closes a report',
  RATE_LIMITED: 'Too many reports in a row',
};

/** HTTP edge of the reports: the reporter and the admin always come from the session.
 *
 *  Example: `app.register(reportsRoutes(service), { prefix: '/api' })` */
export function reportsRoutes(service: ReportsService): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(rateLimit, { global: false, errorResponseBuilder: rateLimitedError });
    app.setErrorHandler(replyWithApiError);
    registerReportRoute(app, service);
    registerAdminReportRoutes(app, service);
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

function rateLimitedError(
  _request: FastifyRequest,
  context: { ttl: number },
): ReportsRateLimitedError {
  return new ReportsRateLimitedError(Math.max(1, Math.ceil(context.ttl / 1000)));
}

function reportsErrorBody(error: ReportsError): ApiErrorDto {
  const retry =
    error instanceof ReportsRateLimitedError ? { retryAfterSeconds: error.retryAfterSeconds } : {};
  return { code: error.code, message: PUBLIC_MESSAGE[error.code], ...retry };
}

async function replyWithApiError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  if (error instanceof ReportsError) {
    return reply.code(STATUS_BY_CODE[error.code]).send(reportsErrorBody(error));
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
