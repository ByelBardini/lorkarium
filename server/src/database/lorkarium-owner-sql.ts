import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

// The @ of the Dono do Lorkarium (OWNER_USERNAME) rides on every connection as a custom setting:
// each query that reads an account for its plan answers whether it is the Dono, without the
// value threaded through every service that locks a table.
const OWNER_USERNAME_SETTING = 'lorkarium.owner_username';

// The @ goes into the startup option as is, so it may never carry a space or a quote.
const USERNAME_FORMAT = /^[a-z0-9._]+$/;

/** Whether the account of `username` is the Dono do Lorkarium: the column against the setting of
 *  the connection; false on a connection without it (OWNER_USERNAME empty).
 *
 *  Example: `select({ role: users.role, lorkariumOwner: lorkariumOwnerSql(users.username) })` */
export function lorkariumOwnerSql(username: AnyPgColumn): SQL<boolean> {
  return sql<boolean>`coalesce(${username} = current_setting('${sql.raw(OWNER_USERNAME_SETTING)}', true), false)`;
}

/** The `pg` startup `options` that set the Dono's @ on a new connection; none without an @.
 *
 *  Example: `ownerUsernameStartupOptions('byel') // '-c lorkarium.owner_username=byel'` */
export function ownerUsernameStartupOptions(ownerUsername: string | null): string | undefined {
  if (ownerUsername === null) return undefined;
  if (!USERNAME_FORMAT.test(ownerUsername)) {
    throw new Error(
      `owner username ${JSON.stringify(ownerUsername)}: expected only a-z 0-9 . _ (an @ without the @)`,
    );
  }
  return `-c ${OWNER_USERNAME_SETTING}=${ownerUsername}`;
}
