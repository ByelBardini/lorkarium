import { sql } from 'drizzle-orm';
import type { Database } from '../../database/database';

export class HealthDao {
  constructor(private readonly db: Database) {}

  /** Resolves when Postgres answers a trivial query; rejects with the driver error otherwise.
   *
   *  Example: `await new HealthDao(db).ping()` */
  async ping(): Promise<void> {
    await this.db.execute(sql`select 1`);
  }
}
