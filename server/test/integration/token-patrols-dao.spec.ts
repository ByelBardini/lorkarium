import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import type { TokenPatrolPo } from '../../src/modules/tokens/token-patrols.po';
import { TokensDao, type NewTokenRow, type TokenRow } from '../../src/modules/tokens/tokens.dao';
import { sql } from 'drizzle-orm';
import { runInTransaction } from '../../src/database/transaction';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const STARTED = new Date('2026-11-08T12:00:00.000Z');

describe('TokenPatrolsDao on Postgres', () => {
  let connection: DatabaseConnection;
  let tokens: TokensDao;
  let vharnScene: string;
  let torreScene: string;
  let quelmScene: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
    tokens = new TokensDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const anaId = (await new UsersDao(connection.db).insert(newUserPo())).id;
    const campaigns = new CampaignsDao(connection.db);
    const vharn = await campaigns.insert(newCampaignPo({ ownerId: anaId }));
    const quelm = await campaigns.insert(
      newCampaignPo({ ownerId: anaId, name: 'Quelm', joinCode: 'QELM2345' }),
    );
    const scenes = new ScenesDao(connection.db);
    vharnScene = (await scenes.insert({ campaignId: vharn.id })).id;
    torreScene = (await scenes.insert({ campaignId: vharn.id, name: 'Torre' })).id;
    quelmScene = (await scenes.insert({ campaignId: quelm.id })).id;
  });

  afterAll(() => connection.close());

  function tokenOf(name: string, sceneId = vharnScene): NewTokenRow {
    const box = { width: 1, height: 1, col: 4, row: 4 };
    const token = { sceneId, name, initials: 'XX', side: 'enemy' as const, ...box };
    return { token, bars: [], controllerIds: [] };
  }

  function patrolOf(tokenId: string, overrides: Partial<TokenPatrolPo> = {}): TokenPatrolPo {
    const path: [number, number][] = [
      [4, 4],
      [8, 4],
    ];
    const base = { tokenId, path, repeat: 'loop' as const, speed: '1.50', turns: true };
    return { ...base, step: 0, startedAt: null, ...overrides };
  }

  async function kaelWithRoute(): Promise<TokenRow> {
    const kael = await tokens.insert(tokenOf('Kael'));
    await tokens.patrols.save(vharnScene, patrolOf(kael.token.id));
    return kael;
  }

  async function patrolIn(sceneId: string, tokenId: string): Promise<TokenPatrolPo | null> {
    return (await tokens.findInScene(sceneId, tokenId))?.patrol ?? null;
  }

  it('the saved route of Kael comes back with the token, paused at step 0', async () => {
    const kael = await kaelWithRoute();

    const listed = await tokens.listOfScene(vharnScene);

    const expected = {
      path: [
        [4, 4],
        [8, 4],
      ],
      repeat: 'loop',
      speed: '1.50',
      turns: true,
    };
    expect(listed[0]?.patrol).toEqual({
      tokenId: kael.token.id,
      ...expected,
      step: 0,
      startedAt: null,
    });
    expect(await patrolIn(vharnScene, kael.token.id)).toEqual(listed[0]?.patrol);
  });

  it('a token without a route reads patrol null', async () => {
    const lyra = await tokens.insert(tokenOf('Lyra'));

    expect((await tokens.findInScene(vharnScene, lyra.token.id))?.patrol).toBeNull();
  });

  it('saving again replaces the route and the timeline', async () => {
    const kael = await kaelWithRoute();

    const path: [number, number][] = [
      [4, 4],
      [4, 8.5],
    ];
    await tokens.patrols.save(
      vharnScene,
      patrolOf(kael.token.id, {
        path,
        repeat: 'bounce',
        speed: '4.00',
        step: 3,
        startedAt: STARTED,
      }),
    );

    const saved = await patrolIn(vharnScene, kael.token.id);
    expect(saved).toMatchObject({ path, repeat: 'bounce', speed: '4.00', step: 3 });
    expect(saved?.startedAt?.toISOString()).toBe('2026-11-08T12:00:00.000Z');
  });

  it('start writes started_at and countRunningOfScene counts only the running ones', async () => {
    const kael = await kaelWithRoute();
    const lyra = await tokens.insert(tokenOf('Lyra'));
    await tokens.patrols.save(vharnScene, patrolOf(lyra.token.id));

    await tokens.patrols.start(vharnScene, [kael.token.id], STARTED);

    expect((await patrolIn(vharnScene, kael.token.id))?.startedAt?.toISOString()).toBe(
      '2026-11-08T12:00:00.000Z',
    );
    expect((await patrolIn(vharnScene, lyra.token.id))?.startedAt).toBeNull();
    expect(await tokens.patrols.countRunningOfScene(vharnScene)).toBe(1);
  });

  it('pause writes the pose on the token and the step with started_at null on the patrol', async () => {
    const kael = await kaelWithRoute();
    await tokens.patrols.start(vharnScene, [kael.token.id], STARTED);

    await runInTransaction(connection.db, (tx) =>
      new TokensDao(tx).patrols.pause(vharnScene, [
        { tokenId: kael.token.id, col: 6.5, row: 4, facing: 90, step: 2 },
      ]),
    );

    const found = await tokens.findInScene(vharnScene, kael.token.id);
    expect(found?.token).toMatchObject({ col: 6.5, row: 4, facing: 90 });
    expect(found?.patrol).toMatchObject({ step: 2, startedAt: null });
  });

  it('runningOf brings the running patrols of the asked tokens with where each is stored', async () => {
    const kael = await kaelWithRoute();
    const lyra = await tokens.insert(tokenOf('Lyra'));
    await tokens.patrols.save(vharnScene, patrolOf(lyra.token.id));
    await tokens.patrols.start(vharnScene, [kael.token.id], STARTED);

    const running = await tokens.patrols.runningOf(vharnScene, [kael.token.id, lyra.token.id]);

    expect(running.map(({ token }) => token)).toEqual([
      { id: kael.token.id, col: 4, row: 4, facing: 0, width: 1, height: 1, hidden: false },
    ]);
    expect(running[0]?.patrol?.startedAt?.toISOString()).toBe('2026-11-08T12:00:00.000Z');
  });

  it('removing the route leaves the token without a patrol', async () => {
    const kael = await kaelWithRoute();

    await tokens.patrols.remove(vharnScene, kael.token.id);

    expect(await patrolIn(vharnScene, kael.token.id)).toBeNull();
  });

  it('deleting the token deletes its patrol (cascade)', async () => {
    const kael = await kaelWithRoute();

    await tokens.delete(kael.token.id);

    const left = await connection.db.execute(sql`select count(*)::int as total from token_patrols`);
    expect(left.rows[0]).toEqual({ total: 0 });
  });

  it('copyScene copies the patrol paused, with the same step', async () => {
    const kael = await kaelWithRoute();
    await tokens.patrols.save(vharnScene, patrolOf(kael.token.id, { step: 3, startedAt: STARTED }));

    const copies = await runInTransaction(connection.db, (tx) =>
      new TokensDao(tx).copyScene(vharnScene, torreScene),
    );

    const copyId = copies.get(kael.token.id) ?? '';
    expect(await patrolIn(torreScene, copyId)).toMatchObject({
      tokenId: copyId,
      step: 3,
      startedAt: null,
    });
    expect((await patrolIn(vharnScene, kael.token.id))?.startedAt).not.toBeNull();
  });

  it.each([
    ['a speed of 0', { speed: '0.00' }],
    ['a step of -1', { step: -1 }],
  ])('the CHECK refuses %s', async (_case, overrides: Partial<TokenPatrolPo>) => {
    const kael = await tokens.insert(tokenOf('Kael'));

    await expect(
      tokens.patrols.save(vharnScene, patrolOf(kael.token.id, overrides)),
    ).rejects.toThrow();
  });

  describe('isolation by scene', () => {
    it('save with the scene of another table writes no patrol', async () => {
      const ogro = await tokens.insert(tokenOf('Ogro', quelmScene));

      await tokens.patrols.save(vharnScene, patrolOf(ogro.token.id));

      expect(await patrolIn(quelmScene, ogro.token.id)).toBeNull();
    });

    it('start and pause with a token of the Torre or of the Quelm change nothing', async () => {
      const torre = await tokens.insert(tokenOf('Guarda', torreScene));
      const quelm = await tokens.insert(tokenOf('Ogro', quelmScene));
      await tokens.patrols.save(torreScene, patrolOf(torre.token.id, { step: 1 }));
      await tokens.patrols.save(quelmScene, patrolOf(quelm.token.id, { startedAt: STARTED }));
      const ids = [torre.token.id, quelm.token.id];

      await tokens.patrols.start(vharnScene, ids, STARTED);
      await runInTransaction(connection.db, (tx) =>
        new TokensDao(tx).patrols.pause(
          vharnScene,
          ids.map((tokenId) => ({ tokenId, col: 9, row: 9, facing: 180, step: 5 })),
        ),
      );

      expect(await patrolIn(torreScene, torre.token.id)).toMatchObject({
        step: 1,
        startedAt: null,
      });
      const ogro = await tokens.findInScene(quelmScene, quelm.token.id);
      expect(ogro?.token).toMatchObject({ col: 4, row: 4, facing: 0 });
      expect(ogro?.patrol).toMatchObject({ step: 0 });
      expect(ogro?.patrol?.startedAt).not.toBeNull();
    });

    it('countRunningOfScene of the Vharn does not count the Quelm', async () => {
      const ogro = await tokens.insert(tokenOf('Ogro', quelmScene));
      await tokens.patrols.save(quelmScene, patrolOf(ogro.token.id, { startedAt: STARTED }));

      expect(await tokens.patrols.countRunningOfScene(vharnScene)).toBe(0);
      expect(await tokens.patrols.countRunningOfScene(quelmScene)).toBe(1);
    });

    it('runningOf of the Vharn skips a running patrol of the Quelm', async () => {
      const ogro = await tokens.insert(tokenOf('Ogro', quelmScene));
      await tokens.patrols.save(quelmScene, patrolOf(ogro.token.id, { startedAt: STARTED }));

      expect(await tokens.patrols.runningOf(vharnScene, [ogro.token.id])).toEqual([]);
    });
  });
});
