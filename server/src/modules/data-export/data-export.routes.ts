import type { ApiErrorDto } from '@lorkarium/contracts';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  DataExportError,
  DataExportTooSoonError,
  type DataExportErrorCode,
} from './data-export.error';
import type { DataExportService } from './data-export.service';

const DATA_EXPORT_URL = '/account/export';

const STATUS_BY_CODE: Readonly<Record<DataExportErrorCode, number>> = { EXPORT_TOO_SOON: 429 };

const PUBLIC_MESSAGE: Readonly<Record<DataExportErrorCode, string>> = {
  EXPORT_TOO_SOON: 'The data of this account were exported less than a day ago',
};

/** HTTP edge of the data export: the ZIP of the session's own account, streamed as it is made.
 *
 *  Example: `app.register(dataExportRoutes(service), { prefix: '/api' })` */
export function dataExportRoutes(
  service: DataExportService,
): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    app.setErrorHandler(replyWithApiError);
    const { requireAuth, userOf } = app.authGuards;
    app.get(DATA_EXPORT_URL, { preHandler: requireAuth }, async (request, reply) => {
      const { fileName, body } = await service.export(userOf(request).id);
      body.on('error', (error) => request.log.error({ err: error }, 'data export broke midway'));
      return reply
        .header('Content-Type', 'application/zip')
        .header('Content-Disposition', `attachment; filename="${fileName}"`)
        .header('Cache-Control', 'no-store')
        .send(body);
    });
  };
}

function dataExportErrorBody(error: DataExportError): ApiErrorDto {
  const retry =
    error instanceof DataExportTooSoonError ? { retryAfterSeconds: error.retryAfterSeconds } : {};
  return { code: error.code, message: PUBLIC_MESSAGE[error.code], ...retry };
}

async function replyWithApiError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  if (error instanceof DataExportTooSoonError) {
    reply.header('Retry-After', String(error.retryAfterSeconds));
  }
  if (error instanceof DataExportError) {
    return reply.code(STATUS_BY_CODE[error.code]).send(dataExportErrorBody(error));
  }
  if (error.statusCode !== undefined && error.statusCode < 500) {
    return reply
      .code(error.statusCode)
      .send({ code: error.code, message: error.message } satisfies ApiErrorDto);
  }
  request.log.error({ err: error }, 'unexpected error in the data export module');
  return reply
    .code(500)
    .send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' } satisfies ApiErrorDto);
}
