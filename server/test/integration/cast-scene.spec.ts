import { rm } from 'node:fs/promises';
import {
  campaignResponseDto,
  libraryDto,
  sceneActivateAckDto,
  type SceneActivateAckDto,
} from '@lorkarium/contracts';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';
import { createDatabase, type DatabaseConnection } from '../../src/database/database';
import { gridAck } from '../support/grids';
import { envelope, send } from '../support/live-table';
import {
  databaseUrlNamed,
  LAST_MIGRATION_WITH_PLAIN_EMAIL,
  migrationsUpTo,
} from '../support/migrations-up-to';
import type { RealtimeClient } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();

type Emit = (event: string, payload: object) => Promise<unknown>;

async function castOf(user: SignedInUser, table: Table): Promise<string> {
  const response = await live.http(user, { method: 'GET', url: `/api/campaigns/${table.id}` });
  return campaignResponseDto.parse(response.json()).campaign.castSceneId;
}

async function activate(client: RealtimeClient, sceneId: string): Promise<SceneActivateAckDto> {
  const timed = client.timeout(2000);
  const emit = timed.emitWithAck as Emit;
  const payload = { ...envelope(live.vharn.id), sceneId };
  return sceneActivateAckDto.parse(await emit.call(timed, 'scene:activate', payload));
}

describe('the cast of a table (the hidden scene of the anchors)', () => {
  it('a new table is born with its cast: the detail names it and it is not the group grid', async () => {
    const castId = await castOf(live.ana, live.vharn);
    const url = `/api/campaigns/${live.vharn.id}/scenes`;
    const library = libraryDto.parse((await live.http(live.ana, { method: 'GET', url })).json());

    expect(castId).toEqual(expect.any(String));
    expect(library.activeSceneId).not.toBe(castId);
    expect(library.scenes.map(({ id }) => id)).not.toContain(castId);
    expect(await castOf(live.bia, live.vharn)).toBe(castId);
  });

  it('the library refuses to edit, copy or delete the cast with SCENE_NOT_FOUND', async () => {
    const castId = await castOf(live.ana, live.vharn);
    const url = `/api/campaigns/${live.vharn.id}/scenes/${castId}`;

    const patch = await live.http(live.ana, {
      method: 'PATCH',
      url,
      payload: { name: 'Elenco 2' },
    });
    const copy = await live.http(live.ana, { method: 'POST', url: `${url}/copies` });
    const removal = await live.http(live.ana, { method: 'DELETE', url });

    for (const response of [patch, copy, removal]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'SCENE_NOT_FOUND' });
    }
  });

  it('Ana cannot take the group to the cast nor act on it: SCENE_NOT_FOUND', async () => {
    const castId = await castOf(live.ana, live.vharn);
    const ana = await live.atTable(live.ana, live.vharn);

    expect(await activate(ana, castId)).toMatchObject({
      ok: false,
      error: { code: 'SCENE_NOT_FOUND' },
    });
    const create = { ...tokenCommandFor(live.vharn, live.bia.id), sceneId: castId };
    expect(await send(ana, 'token:create', create)).toMatchObject({
      ok: false,
      error: { code: 'SCENE_NOT_FOUND' },
    });
    const watch = await gridAck(ana, 'scene:watch', live.vharn, castId);
    expect(watch).toMatchObject({ ok: false, error: { code: 'SCENE_NOT_FOUND' } });
  });

  it('every member syncs the cast: Ana, Bia and Caio get its (empty) snapshot', async () => {
    const castId = await castOf(live.ana, live.vharn);

    for (const user of [live.ana, live.bia, live.caio]) {
      const client = await live.atTable(user, live.vharn);
      const ack = await gridAck(client, 'board:sync', live.vharn, castId);
      expect(ack).toMatchObject({ ok: true, state: { scene: { id: castId }, tokens: [] } });
    }
  });

  it('the cast of Quelm is not found from Vharn, even by Caio who masters Quelm', async () => {
    const quelmCast = await castOf(live.caio, live.quelm);
    const caio = await live.atTable(live.caio, live.vharn);

    const ack = await gridAck(caio, 'board:sync', live.vharn, quelmCast);
    expect(ack).toMatchObject({ ok: false, error: { code: 'SCENE_NOT_FOUND' } });
  });
});

const SCRATCH_DATABASE = 'lorkarium_cast_migration';
const ANA = '6a1d2c3b-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
const VHARN = '3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10';
const QUELM = '4c2f0b63-7d5e-4a9b-8f3c-2b8d6e4a9f21';

describe('migration 0035_cast_scenes on a database with two tables', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;
  let partialFolder: string;
  // Not every migration: 0039 refuses the raw user seeded here, which never got a cipher.
  let laterFolder: string;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH_DATABASE}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH_DATABASE));
    partialFolder = await migrationsUpTo('0034_combatants_combat_idx');
    laterFolder = await migrationsUpTo(LAST_MIGRATION_WITH_PLAIN_EMAIL);
    await migrate(scratch.db, { migrationsFolder: partialFolder });
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.close();
    await rm(partialFolder, { recursive: true, force: true });
    await rm(laterFolder, { recursive: true, force: true });
  });

  it('each table that existed gets exactly one cast, and a second one is refused', async () => {
    await scratch.db.execute(sql`
      INSERT INTO users (id, name, email, password_hash) VALUES (${ANA}, 'Ana', 'ana@x.com', 'h')`);
    await scratch.db.execute(sql`
      INSERT INTO campaigns (id, owner_id, name, join_code)
      VALUES (${VHARN}, ${ANA}, 'Vharn', 'VHRN7K2Q'), (${QUELM}, ${ANA}, 'Quelm', 'QELM2345')`);
    await scratch.db.execute(sql`INSERT INTO scenes (campaign_id) VALUES (${VHARN}), (${QUELM})`);

    await migrate(scratch.db, { migrationsFolder: laterFolder });

    const { rows } = await scratch.db.execute<{ campaign_id: string; kind: string }>(
      sql`SELECT campaign_id, kind FROM scenes ORDER BY campaign_id, kind`,
    );
    expect(rows).toEqual([
      { campaign_id: VHARN, kind: 'grid' },
      { campaign_id: VHARN, kind: 'cast' },
      { campaign_id: QUELM, kind: 'grid' },
      { campaign_id: QUELM, kind: 'cast' },
    ]);
    const secondCast = scratch.db.execute(
      sql`INSERT INTO scenes (campaign_id, kind) VALUES (${VHARN}, 'cast')`,
    );
    await expect(secondCast).rejects.toMatchObject({ cause: { code: '23505' } });
  });
});
