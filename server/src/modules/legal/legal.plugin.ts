import type { FastifyInstance } from 'fastify';
import { legalRoutes } from './legal.routes';

/** Wires the legal links module: only the HTTP edge, over the landing address of the env.
 *
 *  Example: `app.register(legalPlugin, { prefix: '/api', sitePublicUrl: env.sitePublicUrl })` */
export async function legalPlugin(
  app: FastifyInstance,
  options: { sitePublicUrl: string },
): Promise<void> {
  await app.register(legalRoutes(options.sitePublicUrl));
}
