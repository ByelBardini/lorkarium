import type { ApiErrorDto, HealthResponseDto } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import type { HealthService } from './health.service';

export const HEALTH_TIMEOUT_MS = 2_000;

// Public by decision (CI plan, 2026-10-14): load balancers and the e2e probe call it without a session.
const DATABASE_UNAVAILABLE: ApiErrorDto = {
  code: 'DATABASE_UNAVAILABLE',
  message: 'The database did not answer the health check',
};

/** HTTP edge of the health check: 200 when the database answers, 503 otherwise.
 *
 *  Example: `app.register(healthRoutes(service))` */
export function healthRoutes(service: HealthService): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    app.get('/health', async (request, reply) => {
      const result = await service.checkHealth(HEALTH_TIMEOUT_MS);
      if (result.status === 'ok') return { status: 'ok' } satisfies HealthResponseDto;
      request.log.error({ err: result.cause }, 'health check failed: database unavailable');
      return reply.code(503).send(DATABASE_UNAVAILABLE);
    });
  };
}
