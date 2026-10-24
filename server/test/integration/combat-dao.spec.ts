import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { CombatDao, type CombatRow } from '../../src/modules/combat/combat.dao';
import { combatantTokens } from '../../src/modules/combat/combat.po';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { TokensDao } from '../../src/modules/tokens/tokens.dao';
import { tokens } from '../../src/modules/tokens/tokens.po';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const UNIQUE_VIOLATION = '23505';

type Scene = Readonly<{ sceneId: string; tokenIds: Record<string, string> }>;

async function sceneWith(
  db: DatabaseConnection['db'],
  joinCode: string,
  names: readonly string[],
): Promise<Scene> {
  const email = `${names.join('-').toLowerCase()}@mesa.com`;
  const ownerId = (await new UsersDao(db).insert(newUserPo({ email }))).id;
  const campaignId = (await new CampaignsDao(db).insert(newCampaignPo({ ownerId, joinCode }))).id;
  const sceneId = (await new ScenesDao(db).insert({ campaignId })).id;
  const tokensDao = new TokensDao(db);
  const tokenIds: Record<string, string> = {};
  for (const name of names) {
    const token = {
      sceneId,
      name,
      initials: name.slice(0, 2),
      side: 'enemy',
      width: 1,
      height: 1,
      col: 0,
      row: 0,
    } as const;
    tokenIds[name] = (await tokensDao.insert({ token, bars: [], controllerIds: [] })).token.id;
  }
  return { sceneId, tokenIds };
}

function entryNamed(row: CombatRow | undefined, name: string | null, tieOrder?: number) {
  const found = row?.combatants.find(
    (c) => c.name === name && (tieOrder === undefined || c.tieOrder === tieOrder),
  );
  if (!found) throw new Error(`entry ${name} is not in the combat; got ${JSON.stringify(row)}`);
  return found;
}

describe('CombatDao on Postgres', () => {
  let connection: DatabaseConnection;
  let combat: CombatDao;
  let vharn: Scene;
  let goblin: string;
  let lobo: string;
  let kael: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
    combat = new CombatDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    vharn = await sceneWith(connection.db, 'VHRN7K2Q', ['Goblin', 'Lobo', 'Kael']);
    ({ Goblin: goblin = '', Lobo: lobo = '', Kael: kael = '' } = vharn.tokenIds);
  });

  afterAll(() => connection.close());

  it('the migration gives combatants an index on combat_id (combatants_combat_idx)', async () => {
    const found = await connection.db.execute(
      sql`select indexdef from pg_indexes where tablename = 'combatants' and indexname = 'combatants_combat_idx'`,
    );
    expect(found.rows).toEqual([{ indexdef: expect.stringContaining('(combat_id)') }]);
  });

  const startVharn = () =>
    combat.start(vharn.sceneId, [
      { name: 'Inimigos', tokenIds: [goblin, lobo], initiative: null },
      { name: null, tokenIds: [kael], initiative: null },
      { name: 'Covil', tokenIds: [], initiative: null },
    ]);

  it('start saves the combat at round 1 and the entries, with their names and tokens, in the order they entered', async () => {
    const started = await startVharn();

    expect(started.combat).toMatchObject({ round: 1, currentCombatantId: null });
    const found = await combat.findOfScene(vharn.sceneId);
    expect(
      found?.combatants.map(({ name, tokenIds, tieOrder, initiative }) => [
        name,
        [...tokenIds].sort(),
        tieOrder,
        initiative,
      ]),
    ).toEqual([
      ['Inimigos', [goblin, lobo].sort(), 0, null],
      [null, [kael], 1, null],
      ['Covil', [], 2, null],
    ]);
  });

  it('a second combat on the same scene violates the unique scene', async () => {
    await startVharn();

    await expect(combat.start(vharn.sceneId, [])).rejects.toMatchObject({
      cause: { code: UNIQUE_VIOLATION },
    });
  });

  it('addCombatants appends the entries after the last one and returns the ids it created', async () => {
    const started = await combat.start(vharn.sceneId, [
      { name: null, tokenIds: [kael], initiative: null },
    ]);
    await combat.addCombatants(started.combat.id, [
      { name: 'Covil', tokenIds: [], initiative: null },
    ]);

    const created = await combat.addCombatants(started.combat.id, [
      { name: 'Inimigos', tokenIds: [goblin], initiative: null },
      { name: 'Armadilha', tokenIds: [], initiative: null },
    ]);

    const found = await combat.findOfScene(vharn.sceneId);
    expect(created).toEqual([entryNamed(found, 'Inimigos').id, entryNamed(found, 'Armadilha').id]);
    expect(found?.combatants.map(({ tieOrder }) => tieOrder)).toEqual([0, 1, 2, 3]);
  });

  it('linkTokens moves a token from its entry into another one, where it is the only link', async () => {
    await startVharn();
    const kaelEntry = entryNamed(await combat.findOfScene(vharn.sceneId), null);

    await combat.linkTokens(kaelEntry.id, [goblin]);

    const found = await combat.findOfScene(vharn.sceneId);
    expect([...entryNamed(found, null).tokenIds].sort()).toEqual([goblin, kael].sort());
    expect(entryNamed(found, 'Inimigos').tokenIds).toEqual([lobo]);
  });

  it('linkTokens to the entry the token is already in changes nothing', async () => {
    await startVharn();
    const enemies = entryNamed(await combat.findOfScene(vharn.sceneId), 'Inimigos');

    await combat.linkTokens(enemies.id, [goblin]);

    const found = await combat.findOfScene(vharn.sceneId);
    expect([...entryNamed(found, 'Inimigos').tokenIds].sort()).toEqual([goblin, lobo].sort());
  });

  it('unlinkTokens takes the token out and the entry stays', async () => {
    await startVharn();

    await combat.unlinkTokens([lobo]);

    const found = await combat.findOfScene(vharn.sceneId);
    expect(entryNamed(found, 'Inimigos').tokenIds).toEqual([goblin]);
  });

  it('removeCombatants deletes the entries with their links and leaves another combat untouched', async () => {
    const started = await startVharn();
    const quelm = await sceneWith(connection.db, 'QLMX4P9R', ['Ogro']);
    await combat.start(quelm.sceneId, [
      { name: null, tokenIds: [quelm.tokenIds.Ogro ?? ''], initiative: null },
    ]);
    const enemies = entryNamed(await combat.findOfScene(vharn.sceneId), 'Inimigos');
    const ogro = entryNamed(await combat.findOfScene(quelm.sceneId), null);

    await combat.removeCombatants(started.combat.id, [enemies.id, ogro.id]);

    const found = await combat.findOfScene(vharn.sceneId);
    expect(found?.combatants.map(({ name }) => name)).toEqual([null, 'Covil']);
    const links = await connection.db
      .select()
      .from(combatantTokens)
      .where(eq(combatantTokens.tokenId, goblin));
    expect(links).toEqual([]);
    expect((await combat.findOfScene(quelm.sceneId))?.combatants).toHaveLength(1);
  });

  it('rename gives the entry the name', async () => {
    await startVharn();
    const enemies = entryNamed(await combat.findOfScene(vharn.sceneId), 'Inimigos');

    await combat.rename(enemies.id, 'Goblins');

    expect(entryNamed(await combat.findOfScene(vharn.sceneId), 'Goblins').id).toBe(enemies.id);
  });

  it('setInitiative, setTieOrders and setTurn save what the turn needs', async () => {
    const started = await startVharn();
    const [enemies, kaelEntry] = started.combatants;
    if (!enemies || !kaelEntry) throw new Error('entries missing');

    await combat.setInitiative(enemies.id, 18);
    await combat.setTieOrders([
      { combatantId: enemies.id, tieOrder: 1 },
      { combatantId: kaelEntry.id, tieOrder: 0 },
    ]);
    await combat.setTurn(started.combat.id, 3, kaelEntry.id);

    const found = await combat.findOfScene(vharn.sceneId);
    expect(found?.combat).toMatchObject({ round: 3, currentCombatantId: kaelEntry.id });
    expect(found?.combatants.find(({ id }) => id === enemies.id)).toMatchObject({
      initiative: 18,
      tieOrder: 1,
    });
  });

  it('deleting a token deletes its link and keeps the entry (taking it out is the service job)', async () => {
    await startVharn();

    await connection.db.delete(tokens).where(eq(tokens.id, kael));

    const found = await combat.findOfScene(vharn.sceneId);
    expect(found?.combatants).toHaveLength(3);
    expect(entryNamed(found, null).tokenIds).toEqual([]);
  });

  it('end deletes the combat, its entries and their links', async () => {
    const started = await startVharn();

    await combat.end(started.combat.id);

    expect(await combat.findOfScene(vharn.sceneId)).toBeUndefined();
    expect(await connection.db.select().from(combatantTokens)).toEqual([]);
  });

  it('findOfScene of another table brings none of the entries of this one', async () => {
    await startVharn();
    const quelm = await sceneWith(connection.db, 'QLMX4P9R', ['Ogro']);
    const ogro = quelm.tokenIds.Ogro ?? '';
    await combat.start(quelm.sceneId, [{ name: null, tokenIds: [ogro], initiative: null }]);

    const found = await combat.findOfScene(quelm.sceneId);

    expect(found?.combatants.map(({ tokenIds }) => tokenIds)).toEqual([[ogro]]);
  });

  it('a second link of the same token by a plain insert is refused by the primary key', async () => {
    await startVharn();
    const kaelEntry = entryNamed(await combat.findOfScene(vharn.sceneId), null);

    await expect(
      connection.db.insert(combatantTokens).values({ tokenId: goblin, combatantId: kaelEntry.id }),
    ).rejects.toMatchObject({ cause: { code: UNIQUE_VIOLATION } });
  });
});
