import { drizzle } from 'drizzle-orm/node-postgres';

export type Database = ReturnType<typeof drizzle>;

/** The Drizzle client the app builds once and hands to every plugin.
 *
 *  Example: `createDatabase(env.DATABASE_URL).select().from(campaigns)` */
export function createDatabase(url: string): Database {
  return drizzle(url);
}

export const db: Database = createDatabase('postgres://fixture');
