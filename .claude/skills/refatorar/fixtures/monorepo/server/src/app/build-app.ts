import Fastify from 'fastify';
import { databaseUrl } from '../config/env';
import { sessionRoutes } from '../modules/sessions/sessions.routes';

/** The Fastify instance with every module registered.
 *
 *  Example: `await buildApp().listen({ port: 3333 })` */
export function buildApp(): ReturnType<typeof Fastify> {
  const app = Fastify({ logger: true });
  app.decorate('databaseUrl', databaseUrl);
  app.register(sessionRoutes);
  return app;
}
