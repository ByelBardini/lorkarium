// Propositalmente errado: plugin que ninguém registra no app e que não liga
// nem a rota nem o gateway do módulo.
import type { FastifyInstance } from 'fastify';

export async function sessionsPlugin(app: FastifyInstance): Promise<void> {
  app.log.info('sessions plugin without edges');
}
