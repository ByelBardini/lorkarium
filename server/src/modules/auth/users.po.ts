import { sql } from 'drizzle-orm';
import { check, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Global account role; game master/player/spectator are per-campaign roles (spec §6).
export const userRole = pgEnum('user_role', ['user', 'admin']);

/** The 8 person colors by name (game-core `MEMBER_COLORS`, the same order; the mapper's types
 *  catch a drift). Null on the row = automatic, drawn from the id. */
export const memberColor = pgEnum('member_color', [
  'gold',
  'steel',
  'ember',
  'moss',
  'violet',
  'rose',
  'teal',
  'bone',
]);

export const BIO_MAX_LENGTH = 190;

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // The nickname: born equal to the username, free to change.
    name: text('name').notNull(),
    // The @: unique and immutable, already normalized (a-z 0-9 . _, 3 to 20).
    username: text('username').notNull().unique(),
    // The e-mail never rests in clear (LGPD): AES-256-GCM with the id as context, plus a blind
    // index (HMAC of the lowercased address) for the login lookup and the uniqueness.
    emailCipher: text('email_cipher').notNull(),
    emailIndex: text('email_index').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: userRole('role').notNull().default('user'),
    color: memberColor('color'),
    bio: text('bio'),
    avatarId: uuid('avatar_id'),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
    // Set by an admin (backoffice): no login and no session while it holds; null = active.
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    // Last login or session activity, in the same 5-minute steps as the session's touch: the
    // sessions themselves vanish on logout and expiry, so they are no history.
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('users_bio_length', sql`char_length(${table.bio}) <= ${sql.raw(String(BIO_MAX_LENGTH))}`),
  ],
);

export type UserPo = typeof users.$inferSelect;
export type NewUserPo = typeof users.$inferInsert;
/** The two columns that keep an e-mail at rest. */
export type SealedEmail = Pick<UserPo, 'emailCipher' | 'emailIndex'>;
