import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Global account role; game master/player/spectator are per-campaign roles (spec §6).
export const userRole = pgEnum('user_role', ['user', 'admin']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // Stored already lowercased (the DTO normalizes), so the unique index is case-insensitive in practice.
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull().default('user'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserPo = typeof users.$inferSelect;
export type NewUserPo = typeof users.$inferInsert;
