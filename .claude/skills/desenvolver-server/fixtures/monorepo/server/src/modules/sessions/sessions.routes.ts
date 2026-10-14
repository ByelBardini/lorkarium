// Propositalmente errado: borda sem DTO, identidade do payload, consulta na
// rota e fora de qualquer plugin.
import type { FastifyInstance } from 'fastify';

export async function sessionRoutes(app: FastifyInstance, db: { select(): unknown }): Promise<void> {
  app.post('/sessions/:id/join', async (request: { body: { userId: string } }) => {
    const userId = request.body.userId;
    return { userId, rows: db.select() };
  });
}
