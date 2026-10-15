import { eq } from 'drizzle-orm';
import type { Database } from '../../database/database';
import { users, type NewUserPo, type UserPo } from './users.po';

export class UsersDao {
  constructor(private readonly db: Database) {}

  async findByEmail(email: string): Promise<UserPo | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email));
    return row;
  }

  async findById(userId: string): Promise<UserPo | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, userId));
    return row;
  }

  async insert(user: NewUserPo): Promise<UserPo> {
    const [row] = await this.db.insert(users).values(user).returning();
    if (!row) throw new Error(`insert into users returned no row for e-mail ${user.email}`);
    return row;
  }
}
