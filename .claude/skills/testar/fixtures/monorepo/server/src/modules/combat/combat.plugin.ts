import type { FastifyInstance } from 'fastify';

export async function combatPlugin(app: FastifyInstance): Promise<void> {
  app.get('/combats', async () => []);
}
