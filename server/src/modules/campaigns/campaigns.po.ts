import {
  boolean,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { assets } from '../assets/assets.po';
import { users } from '../auth/users.po';
import { scenes } from '../scenes/scenes.po';

export const campaignVisibility = pgEnum('campaign_visibility', ['public', 'private']);

export const campaignStatus = pgEnum('campaign_status', [
  'building',
  'recruiting',
  'ongoing',
  'finished',
]);

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  system: text('system'),
  status: campaignStatus('status').notNull().default('building'),
  description: text('description'),
  visibility: campaignVisibility('visibility').notNull().default('private'),
  // Canonical form (no hyphen, uppercase); the client formats it for display.
  joinCode: text('join_code').notNull().unique(),
  // Argon2id hash; `null` = the campaign asks for no password.
  passwordHash: text('password_hash'),
  // One scene per campaign for now; several scenes only change which one this points to.
  activeSceneId: uuid('active_scene_id').references((): AnyPgColumn => scenes.id, {
    onDelete: 'set null',
  }),
  // A drawn cover is the pair; both null = never chosen (the mapper draws `defaultCoverOf`).
  coverDrawing: smallint('cover_drawing'),
  coverTone: smallint('cover_tone'),
  // An image cover wins over the drawn one; a deleted asset falls back to the drawing.
  coverAssetId: uuid('cover_asset_id').references((): AnyPgColumn => assets.id, {
    onDelete: 'set null',
  }),
  // Only the values of the contract's `contentWarningDto`; the mapper reads them back through it.
  contentWarnings: text('content_warnings').array().notNull().default([]),
  tags: text('tags').array().notNull().default([]),
  // Table settings read on every token command: turning one off counts from the next command on.
  playersCreateTokens: boolean('players_create_tokens').notNull().default(false),
  playersDeleteTokens: boolean('players_delete_tokens').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CampaignPo = typeof campaigns.$inferSelect;
export type NewCampaignPo = typeof campaigns.$inferInsert;
