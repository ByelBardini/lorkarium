import Fastify from 'fastify';
import { db } from '../database/database';
import { SystemClock } from '../infrastructure/clock/system-clock';
import { campaignsPlugin } from '../modules/campaigns/campaigns.plugin';

/** The Fastify instance with every module plugin registered.
 *
 *  Example: `await buildApp().listen({ port: 3333 })` */
export function buildApp(): ReturnType<typeof Fastify> {
  const app = Fastify({ logger: true });
  app.register(campaignsPlugin, { db, clock: new SystemClock() });
  return app;
}
