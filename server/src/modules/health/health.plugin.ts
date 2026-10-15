import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { HealthDao } from './health.dao';
import { healthRoutes } from './health.routes';
import { HealthService } from './health.service';

/** Wires the health module: builds DAO and service, registers the HTTP edge.
 *
 *  Example: `app.register(healthPlugin, { prefix: '/api', db })` */
export async function healthPlugin(app: FastifyInstance, options: { db: Database }): Promise<void> {
  const service = new HealthService(new HealthDao(options.db));
  await app.register(healthRoutes(service));
}
