import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { campaignMembers } from '../campaigns/campaign-members.po';
import { tokens } from '../tokens/tokens.po';

// The party board card of a member: of the table, not of the scene, so it survives a scene or a
// main token change. The composite key to campaign_members takes the card along when the member
// leaves the table.
export const memberCards = pgTable(
  'member_cards',
  {
    campaignId: uuid('campaign_id').notNull(),
    userId: uuid('user_id').notNull(),
    characterName: text('character_name'),
    armorClass: smallint('armor_class'),
    difficultyClass: smallint('difficulty_class'),
    noteOne: text('note_one'),
    noteTwo: text('note_two'),
    // The anchor token of the member's character, in the table's cast; one card per anchor.
    anchorTokenId: uuid('anchor_token_id')
      .unique('member_cards_anchor_token_id_unique')
      .references(() => tokens.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.userId] }),
    foreignKey({
      name: 'member_cards_member_fk',
      columns: [table.campaignId, table.userId],
      foreignColumns: [campaignMembers.campaignId, campaignMembers.userId],
    }).onDelete('cascade'),
    check('member_cards_character_name_length', sql`char_length(${table.characterName}) <= 40`),
    check('member_cards_note_one_length', sql`char_length(${table.noteOne}) <= 80`),
    check('member_cards_note_two_length', sql`char_length(${table.noteTwo}) <= 80`),
    check('member_cards_armor_class_range', sql`${table.armorClass} BETWEEN 0 AND 999`),
    check('member_cards_difficulty_class_range', sql`${table.difficultyClass} BETWEEN 0 AND 999`),
  ],
);

export type MemberCardPo = typeof memberCards.$inferSelect;

/** The card fields one save writes: an absent key stays, `null` clears. */
export type MemberCardChangesPo = Partial<
  Pick<
    MemberCardPo,
    'characterName' | 'armorClass' | 'difficultyClass' | 'noteOne' | 'noteTwo' | 'anchorTokenId'
  >
>;
