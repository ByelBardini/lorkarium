import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { tokens } from './tokens.po';

// What the patrol does at its last point: back to the first (`loop`) or the way back (`bounce`).
export const tokenPatrolRepeat = pgEnum('token_patrol_repeat', ['loop', 'bounce']);

// How the token shows between two cells: only the drawing, the timeline is the same in both.
export const tokenPatrolGait = pgEnum('token_patrol_gait', ['glide', 'step']);

// The route a token walks by itself, 1:1 with it (apart from `tokens`, which keeps ~40 columns).
// Nothing in the server moves a token with time: every screen derives the cell of now from
// `started_at` (the server clock) and `step` (the cell of the cycle it left from).
export const tokenPatrols = pgTable(
  'token_patrols',
  {
    tokenId: uuid('token_id')
      .primaryKey()
      .references(() => tokens.id, { onDelete: 'cascade' }),
    // Token origins `[col, row][]`, in steps of 1/64 of a cell, like `tokens.col`/`row` (2 to 32 points).
    path: jsonb('path').$type<[number, number][]>().notNull(),
    repeat: tokenPatrolRepeat('repeat').notNull(),
    // Cells per second, 0.25 to 4 in steps of 0.25 (game-core `tokenPatrol`).
    speed: numeric('speed', { precision: 4, scale: 2 }).notNull(),
    turns: boolean('turns').notNull().default(true),
    gait: tokenPatrolGait('gait').notNull().default('glide'),
    step: integer('step').notNull().default(0),
    // Null = paused; while it runs, `tokens.col`/`row` are where the walk back starts.
    startedAt: timestamp('started_at', { withTimezone: true }),
  },
  (table) => [
    check('token_patrols_speed', sql`${table.speed} BETWEEN 0.25 AND 4`),
    check('token_patrols_step', sql`${table.step} >= 0`),
  ],
);

export type TokenPatrolPo = typeof tokenPatrols.$inferSelect;
export type TokenPatrolRepeatPo = TokenPatrolPo['repeat'];
