// Propositalmente errado: BO que consulta, espera I/O, lê o relógio e importa
// para cima (DAO, rota) e para a borda (DTO).
import type { JoinSessionDto } from '@fixture/contracts';
import { SessionsDao } from './sessions.dao';
import { sessionRoutes } from './sessions.routes';

export class SessionBo {
  constructor(private readonly db: { select(): unknown }) {}

  async canJoin(input: JoinSessionDto): Promise<boolean> {
    const rows = this.db.select();
    void SessionsDao;
    void sessionRoutes;
    return Boolean(rows) && Date.now() > 0 && input.sessionId !== '';
  }
}
