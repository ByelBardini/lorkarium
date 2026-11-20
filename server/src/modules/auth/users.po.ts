import {
  MEMBER_COLOR_NAMES,
  USER_PLANS,
  type HexColorDto,
  type MemberColorDto,
} from '@lorkarium/contracts';
import {
  PROFILE_CONTACT_MAX_LENGTH,
  PROFILE_GAME_SYSTEMS_MAX_LENGTH,
  PROFILE_PLAY_SCHEDULE_MAX_LENGTH,
} from '@lorkarium/contracts';
import { sql, type AnyColumn } from 'drizzle-orm';
import { check, index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { paletteOrHexSql } from '../../database/palette-or-hex-sql';

// Global account role; game master/player/spectator are per-campaign roles (spec §6).
export const userRole = pgEnum('user_role', ['user', 'admin']);

// The master plan of the account; the table limits follow the owner's (see plans module).
export const userPlan = pgEnum('user_plan', USER_PLANS);

export const BIO_MAX_LENGTH = 190;

/** `char_length(column) <= max`, the ceiling of a free profile text kept by the table too. */
function maxLengthSql(column: AnyColumn, max: number) {
  return sql`char_length(${column}) <= ${sql.raw(String(max))}`;
}

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
    plan: userPlan('plan').notNull().default('free'),
    // The plan bought at the gateway, written only by the billing service (column grants); the
    // end already holds the grace days, so this side only compares it with now().
    paidPlan: userPlan('paid_plan'),
    paidPlanUntil: timestamp('paid_plan_until', { withTimezone: true }),
    // A name of the palette or a custom hex; null = automatic, drawn from the id.
    color: text('color').$type<MemberColorDto>(),
    bio: text('bio'),
    avatarId: uuid('avatar_id'),
    // The 3:1 banner of the profile card (paid plans); null = the profile color.
    bannerId: uuid('banner_id'),
    // The dice appearance (no FK: the texture is an object in the bucket, as the photo).
    // Null texture = the profile color; null number color = automatic contrast.
    diceTextureId: uuid('dice_texture_id'),
    diceNumberColor: text('dice_number_color').$type<HexColorDto>(),
    // The game preferences of the profile card, free texts (no badges); null = not told.
    gameSystems: text('game_systems'),
    playSchedule: text('play_schedule'),
    contact: text('contact'),
    // The dice counters of the card (the rolls stay ephemeral); added by `UPDATE … + n`.
    rollsCount: integer('rolls_count').notNull().default(0),
    natural20Count: integer('natural20_count').notNull().default(0),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
    // Set by an admin (backoffice): no login and no session while it holds; null = active.
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    // The end of a suspension with a deadline: past it the account is active again (the login
    // checks it, the hourly housekeeping clears both columns); null = until an admin lifts it.
    suspendedUntil: timestamp('suspended_until', { withTimezone: true }),
    // Last login or session activity, in the same 5-minute steps as the session's touch: the
    // sessions themselves vanish on logout and expiry, so they are no history.
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    // The clickwrap proof: when the box was ticked and which pair of legal texts it covered.
    // Null on accounts born before the box existed (seeds, invitations accepted until 0054).
    termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
    termsVersion: text('terms_version'),
    // The last export of the account's data (LGPD art. 18): one a day, the ZIP is heavy to build.
    dataExportedAt: timestamp('data_exported_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Every GET of a photo, a banner or a dice texture asks whether some account still points at it.
    index('users_avatar_idx')
      .on(table.avatarId)
      .where(sql`${table.avatarId} IS NOT NULL`),
    index('users_banner_idx')
      .on(table.bannerId)
      .where(sql`${table.bannerId} IS NOT NULL`),
    index('users_dice_texture_idx')
      .on(table.diceTextureId)
      .where(sql`${table.diceTextureId} IS NOT NULL`),
    check('users_bio_length', sql`char_length(${table.bio}) <= ${sql.raw(String(BIO_MAX_LENGTH))}`),
    check(
      'users_game_systems_length',
      maxLengthSql(table.gameSystems, PROFILE_GAME_SYSTEMS_MAX_LENGTH),
    ),
    check(
      'users_play_schedule_length',
      maxLengthSql(table.playSchedule, PROFILE_PLAY_SCHEDULE_MAX_LENGTH),
    ),
    check('users_contact_length', maxLengthSql(table.contact, PROFILE_CONTACT_MAX_LENGTH)),
    check('users_color_value', paletteOrHexSql(table.color, MEMBER_COLOR_NAMES)),
    check('users_dice_number_color_hex', sql`${table.diceNumberColor} ~ '^#[0-9a-f]{6}$'`),
    check(
      'users_paid_plan_pair',
      sql`(${table.paidPlan} IS NULL) = (${table.paidPlanUntil} IS NULL)`,
    ),
    check(
      'users_paid_plan_sold',
      sql`${table.paidPlan} IS NULL OR ${table.paidPlan} IN ('apoiador', 'narrador', 'lenda')`,
    ),
    check(
      'users_suspended_until_with_suspension',
      sql`${table.suspendedUntil} IS NULL OR ${table.suspendedAt} IS NOT NULL`,
    ),
    check(
      'users_terms_acceptance_pair',
      sql`(${table.termsAcceptedAt} IS NULL) = (${table.termsVersion} IS NULL)`,
    ),
  ],
);

export type UserPo = typeof users.$inferSelect;
export type NewUserPo = typeof users.$inferInsert;
/** What the plans module needs of an account to resolve its limits (`effectiveLimitsOf`):
 *  `lorkariumOwner` is no column, it is `lorkariumOwnerSql` read in the same select, and
 *  `activePaidPlan` is the paid plan only while `paid_plan_until` is ahead (`activePaidPlanSql`),
 *  both in `PLAN_ACCOUNT_COLUMNS`. Not named `paidPlan`: a whole `UserPo` (raw, maybe expired
 *  `paidPlan`) must never pass for an account whose paid plan is in force. */
export type UserPlanPo = Pick<UserPo, 'role' | 'plan'> &
  Readonly<{ activePaidPlan: UserPo['paidPlan']; lorkariumOwner: boolean }>;
/** The two columns that keep an e-mail at rest. */
export type SealedEmail = Pick<UserPo, 'emailCipher' | 'emailIndex'>;
