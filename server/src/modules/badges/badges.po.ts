import { BADGE_DESCRIPTION_MAX_LENGTH, BADGE_NAME_MAX_LENGTH } from '@lorkarium/contracts';
import { sql, type SQL } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from '../auth/users.po';

function lengthBetweenSql(column: AnyPgColumn, max: number): SQL {
  return sql`char_length(${column}) between 1 and ${sql.raw(String(max))}`;
}

// The catalog the backoffice keeps. The position unique is DEFERRABLE INITIALLY DEFERRED in 0114
// (edited by hand: drizzle-kit cannot declare it), so one UPDATE can swap positions in a reorder.
export const badges = pgTable(
  'badges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    // The object `badges/<image_id>` in the bucket; a new id at every send. null = not sent yet.
    imageId: uuid('image_id'),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('badges_name_unique').on(sql`lower(${table.name})`),
    unique('badges_image_id_unique').on(table.imageId),
    unique('badges_position_unique').on(table.position),
    check('badges_name_length', lengthBetweenSql(table.name, BADGE_NAME_MAX_LENGTH)),
    check(
      'badges_description_length',
      lengthBetweenSql(table.description, BADGE_DESCRIPTION_MAX_LENGTH),
    ),
    check('badges_position_nonnegative', sql`${table.position} >= 0`),
  ],
);

// Which account holds which badge; both sides cascade (a deleted badge or account takes its grants).
export const userBadges = pgTable(
  'user_badges',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    badgeId: uuid('badge_id')
      .notNull()
      .references(() => badges.id, { onDelete: 'cascade' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.badgeId] }),
    index('user_badges_badge_idx').on(table.badgeId),
  ],
);

export type BadgePo = typeof badges.$inferSelect;
export type NewBadgePo = typeof badges.$inferInsert;
export type UserBadgePo = typeof userBadges.$inferSelect;
