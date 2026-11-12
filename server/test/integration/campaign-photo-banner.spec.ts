import {
  apiErrorDto,
  campaignResponseDto,
  listCampaignsResponseDto,
  listPublicCampaignsResponseDto,
  sessionCampaignUpdatedDto,
} from '@lorkarium/contracts';
import { sql } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import { createDatabase, type DatabaseConnection } from '../../src/database/database';
import { runMigrations, runMigrationsThrough } from '../../src/database/migrate';
import { AssetsDao } from '../../src/modules/assets/assets.dao';
import type { AssetPurpose } from '../../src/modules/assets/asset-upload.bo';
import { newAssetPo } from '../support/assets-factories';
import { atTable, eventPayload } from '../support/live-table';
import { databaseUrlNamed, insertUserAtOldMigration } from '../support/migrations-up-to';
import {
  recordEventsOf,
  type EventRecorder,
  type RealtimeClient,
} from '../support/realtime-client';
import { signUpAndLogin } from '../support/sign-in';
import { createTable, joinByCode, type Table } from '../support/tables';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

describe('the photo and the banner in the campaign settings', () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null };
  const clients: RealtimeClient[] = [];
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let ana: string;
  let bia: string;
  let vharn: Table;
  let quelm: Table;
  let anaEvents: EventRecorder;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    app = await buildApp({ env, db: connection.db });
    const baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
    const anaUser = await signUpAndLogin(app, connection.db, 'Ana');
    const biaUser = await signUpAndLogin(app, connection.db, 'Bia');
    const caioUser = await signUpAndLogin(app, connection.db, 'Caio');
    ana = anaUser.token;
    bia = biaUser.token;
    vharn = await createTable(app, anaUser, 'Os Sinos de Vharn');
    quelm = await createTable(app, caioUser, 'Quelm');
    await joinByCode(app, biaUser, vharn);
    anaEvents = recordEventsOf(await atTable(baseUrl, clients, anaUser, vharn));
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.close();
    await app.close();
  });

  function call(
    method: 'GET' | 'PATCH',
    url: string,
    token: string,
    payload?: object,
  ): Promise<LightMyRequestResponse> {
    return app.inject({ method, url: `/api${url}`, cookies: { lk_session: token }, payload });
  }

  async function assetOf(table: Table, purpose: AssetPurpose): Promise<string> {
    const row = await new AssetsDao(connection.db).insert(
      newAssetPo({ campaignId: table.id, purpose }),
    );
    return row.id;
  }

  function errorOf(response: LightMyRequestResponse): Readonly<{ status: number; code: string }> {
    return { status: response.statusCode, code: apiErrorDto.parse(response.json()).code };
  }

  it('the master sets a photo of the table and the detail reads it back', async () => {
    const photoAssetId = await assetOf(vharn, 'campaign_photo');

    const response = await call('PATCH', `/campaigns/${vharn.id}`, ana, { photoAssetId });

    expect(response.statusCode).toBe(200);
    const detail = await call('GET', `/campaigns/${vharn.id}`, ana);
    expect(campaignResponseDto.parse(detail.json()).campaign).toMatchObject({
      photoAssetId,
      bannerAssetId: null,
    });
  });

  it('a banner of another table is 400 INVALID_BODY and nothing is written', async () => {
    const bannerAssetId = await assetOf(quelm, 'campaign_banner');

    const response = await call('PATCH', `/campaigns/${vharn.id}`, ana, { bannerAssetId });

    expect(errorOf(response)).toEqual({ status: 400, code: 'INVALID_BODY' });
    const detail = await call('GET', `/campaigns/${vharn.id}`, ana);
    expect(campaignResponseDto.parse(detail.json()).campaign.bannerAssetId).toBeNull();
  });

  it('a cover asset set as the photo is 400 INVALID_BODY', async () => {
    const photoAssetId = await assetOf(vharn, 'cover');

    const response = await call('PATCH', `/campaigns/${vharn.id}`, ana, { photoAssetId });

    expect(errorOf(response)).toEqual({ status: 400, code: 'INVALID_BODY' });
  });

  it('a player setting the photo is 403 FORBIDDEN', async () => {
    const photoAssetId = await assetOf(vharn, 'campaign_photo');

    const response = await call('PATCH', `/campaigns/${vharn.id}`, bia, { photoAssetId });

    expect(errorOf(response)).toEqual({ status: 403, code: 'FORBIDDEN' });
  });

  it('null takes the photo away and keeps the banner', async () => {
    const photoAssetId = await assetOf(vharn, 'campaign_photo');
    const bannerAssetId = await assetOf(vharn, 'campaign_banner');
    await call('PATCH', `/campaigns/${vharn.id}`, ana, { photoAssetId, bannerAssetId });

    const response = await call('PATCH', `/campaigns/${vharn.id}`, ana, { photoAssetId: null });

    expect(campaignResponseDto.parse(response.json()).campaign).toMatchObject({
      photoAssetId: null,
      bannerAssetId,
    });
  });

  it('the list, the explore list and session:campaignUpdated carry both images', async () => {
    const photoAssetId = await assetOf(vharn, 'campaign_photo');
    const bannerAssetId = await assetOf(vharn, 'campaign_banner');
    const body = { photoAssetId, bannerAssetId, visibility: 'public' };
    await call('PATCH', `/campaigns/${vharn.id}`, ana, body);
    const images = { photoAssetId, bannerAssetId };

    const listed = listCampaignsResponseDto.parse((await call('GET', '/campaigns', bia)).json());
    const explore = await call('GET', '/campaigns/public', bia);
    const card = listPublicCampaignsResponseDto
      .parse(explore.json())
      .campaigns.find((campaign) => campaign.id === vharn.id);
    const event = await eventPayload(anaEvents, 'session:campaignUpdated');
    const updated = sessionCampaignUpdatedDto.parse(event).campaign;

    expect(listed.campaigns[0]).toMatchObject(images);
    expect(card).toMatchObject(images);
    expect(updated).toMatchObject(images);
  });
});

const SCRATCH = 'lorkarium_campaign_photo_banner';
const LAST_MIGRATION_BEFORE = '0105_campaign_image_purposes';
const VHARN_ID = '10000000-0000-4000-8000-000000000106';
const COVER_ID = '20000000-0000-4000-8000-000000000106';

describe('migration 0106_campaign_photo_banner on a database with campaigns', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH));
    await runMigrationsThrough(scratch.db, LAST_MIGRATION_BEFORE);
    const ownerId = await insertUserAtOldMigration(scratch.db);
    await scratch.db.execute(sql`
      INSERT INTO campaigns (id, owner_id, name, join_code) VALUES (${VHARN_ID}, ${ownerId}, 'Vharn', 'VHRN7K2Q')`);
    await scratch.db.execute(sql`
      INSERT INTO assets (id, campaign_id, purpose, mime_type, size_bytes, width, height, storage_key)
      VALUES (${COVER_ID}, ${VHARN_ID}, 'cover', 'image/png', 10, 200, 100, ${`assets/${COVER_ID}`})`);
    await scratch.db.execute(sql`UPDATE campaigns SET cover_asset_id = ${COVER_ID}`);
    await runMigrations(scratch.db);
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH}`));
    await admin.close();
  });

  it('an existing table has neither photo nor banner and keeps its cover', async () => {
    const { rows } = await scratch.db.execute(
      sql`SELECT cover_asset_id, photo_asset_id, banner_asset_id FROM campaigns`,
    );

    expect(rows).toEqual([
      { cover_asset_id: COVER_ID, photo_asset_id: null, banner_asset_id: null },
    ]);
  });

  it('deleting the photo asset sets the column back to null', async () => {
    await scratch.db.execute(sql`UPDATE campaigns SET photo_asset_id = ${COVER_ID}`);

    await scratch.db.execute(sql`DELETE FROM assets WHERE id = ${COVER_ID}`);

    const { rows } = await scratch.db.execute(
      sql`SELECT cover_asset_id, photo_asset_id FROM campaigns`,
    );
    expect(rows).toEqual([{ cover_asset_id: null, photo_asset_id: null }]);
  });
});
