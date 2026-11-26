import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { openTestDatabase } from '../support/test-database';

// Postgres indexes the referenced side of a foreign key, never the referencing one: without an
// index whose leading columns are the FK columns, every delete of the parent scans the child table.
// A column only lands here when its FK never fires in normal use; each one says why.
const ASSET_GOES_WITH_ITS_TABLE = 'an asset row is only deleted by its campaign cascade';
const ACCOUNT_DELETION = 'fires only when an admin deletes an account';
const ROUND_CYCLE_PHASE =
  'a phase leaves only when the master edits its cycle; a combat holds a few cycle rows';
const CAMPAIGN_PREFIX = 'an index led by campaign_id narrows it to one table, a few dozen rows';
const ACCEPTED_WITHOUT_INDEX: Record<string, string> = {
  'account_sanctions.appeal_decided_by': ACCOUNT_DELETION,
  'account_sanctions.issued_by': ACCOUNT_DELETION,
  'account_sanctions.report_id':
    'measures are few (a handful per month): the purge of a closed report scans a tiny table',
  'assets.owner_id': ACCOUNT_DELETION,
  'campaigns.banner_asset_id': ASSET_GOES_WITH_ITS_TABLE,
  'campaigns.cover_asset_id': ASSET_GOES_WITH_ITS_TABLE,
  'campaigns.photo_asset_id': ASSET_GOES_WITH_ITS_TABLE,
  'campaigns.owner_id': ACCOUNT_DELETION,
  'character_controllers.user_id': ACCOUNT_DELETION,
  'characters.aura_image_asset_id': ASSET_GOES_WITH_ITS_TABLE,
  'characters.campaign_id,main_sheet_id': CAMPAIGN_PREFIX,
  'characters.image_asset_id': ASSET_GOES_WITH_ITS_TABLE,
  'characters.user_id': ACCOUNT_DELETION,
  'condition_definitions.image_asset_id': ASSET_GOES_WITH_ITS_TABLE,
  'combat_round_cycles.chosen_phase_id': ROUND_CYCLE_PHASE,
  'combat_round_cycles.current_phase_id': ROUND_CYCLE_PHASE,
  'round_cycle_phases.image_asset_id': ASSET_GOES_WITH_ITS_TABLE,
  'drawings.author_id': ACCOUNT_DELETION,
  'effect_areas.author_id': ACCOUNT_DELETION,
  'invitations.invited_by': ACCOUNT_DELETION,
  'library_document_assets.campaign_id,document_id,tab_id':
    'the primary key leads by (campaign_id, document_id): the images of one document',
  'library_documents.created_by': ACCOUNT_DELETION,
  'library_documents.preview_asset_id': ASSET_GOES_WITH_ITS_TABLE,
  'library_image_presentations.campaign_id,image_id':
    'one row per campaign: the primary key on campaign_id answers it',
  'library_images.campaign_id,asset_id': 'the unique asset_id answers it',
  'library_maps.campaign_id,asset_id': 'the unique asset_id answers it',
  'mail_broadcast_deliveries.user_id':
    'fires only when an admin deletes an account: a scan of the notices of 5 years, tens of thousands of rows',
  'mail_broadcasts.created_by': ACCOUNT_DELETION,
  'scene_folders.campaign_id,parent_id': CAMPAIGN_PREFIX,
  'scenes.background_asset_id': ASSET_GOES_WITH_ITS_TABLE,
  'scenes.campaign_id,folder_id': CAMPAIGN_PREFIX,
  'sheet_templates.created_by': ACCOUNT_DELETION,
  'token_controllers.user_id': ACCOUNT_DELETION,
  'token_forms.image_asset_id': ASSET_GOES_WITH_ITS_TABLE,
  'tokens.aura_image_asset_id': ASSET_GOES_WITH_ITS_TABLE,
  'tokens.created_by': ACCOUNT_DELETION,
  'tokens.image_asset_id': ASSET_GOES_WITH_ITS_TABLE,
  'two_factor_challenges.user_id': ACCOUNT_DELETION,
  'user_reports.resolved_by': ACCOUNT_DELETION,
};

const UNINDEXED_FOREIGN_KEYS = sql`
  SELECT c.conrelid::regclass::text || '.' || string_agg(a.attname, ',' ORDER BY k.ord) AS fk
  FROM pg_constraint c
  CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
  WHERE c.contype = 'f'
    AND c.connamespace = 'public'::regnamespace
    AND NOT EXISTS (
      SELECT 1 FROM pg_index i
      WHERE i.indrelid = c.conrelid
        AND (string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)] @> c.conkey
    )
  GROUP BY c.conrelid, c.conname
  ORDER BY fk`;

describe('the foreign keys of the migrated schema', () => {
  let connection: DatabaseConnection;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  async function unindexedForeignKeys(): Promise<string[]> {
    const result = await connection.db.execute<{ fk: string }>(UNINDEXED_FOREIGN_KEYS);
    return result.rows.map((row) => row.fk).sort();
  }

  it('every foreign key has an index led by its columns, or a written reason not to', async () => {
    const unindexed = await unindexedForeignKeys();

    expect(unindexed).toEqual(Object.keys(ACCEPTED_WITHOUT_INDEX).sort());
  });
});
