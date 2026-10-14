import { eq } from 'drizzle-orm';

export class SessionsDao {
  private readonly db: unknown;
  private readonly unusedCache = new Map<string, number>();

  constructor(db: unknown) {
    this.db = db;
  }

  findById(id: string): { id: string; db: unknown; filter: unknown } {
    return { id, db: this.db, filter: eq };
  }
}
