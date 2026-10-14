// Propositalmente errado: DAO que devolve DTO e chama o service.
import type { JoinSessionDto } from '@fixture/contracts';
import type { Database } from '../../database/database';
import { SessionsService } from './sessions.service';

export class SessionsDao {
  constructor(private readonly db: Database) {}

  async lastJoin(): Promise<JoinSessionDto | undefined> {
    void SessionsService;
    const rows = await this.db.select().from({} as never);
    return rows[0] as JoinSessionDto | undefined;
  }
}
