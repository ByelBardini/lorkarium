import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { CombatDao } from '../../src/modules/combat/combat.dao';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { TokensDao } from '../../src/modules/tokens/tokens.dao';
import { tokens } from '../../src/modules/tokens/tokens.po';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const UNIQUE_VIOLATION = '23505';

describe('CombatDao on Postgres', () => {
  let connection: DatabaseConnection;
  let combat: CombatDao;
  let sceneId: string;
  let tokenIds: string[];

  beforeAll(async () => {
    connection = await openTestDatabase();
    combat = new CombatDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const ownerId = (await new UsersDao(connection.db).insert(newUserPo())).id;
    const campaignId = (await new CampaignsDao(connection.db).insert(newCampaignPo({ ownerId })))
      .id;
    sceneId = (await new ScenesDao(connection.db).insert({ campaignId })).id;
    const tokensDao = new TokensDao(connection.db);
    tokenIds = [];
    for (const name of ['Kael', 'Lyra', 'Goblin']) {
      const token = {
        sceneId,
        name,
        initials: name.slice(0, 2),
        side: 'ally',
        width: 1,
        height: 1,
        col: 0,
        row: 0,
      } as const;
      tokenIds.push((await tokensDao.insert({ token, bars: [], controllerIds: [] })).token.id);
    }
  });

  afterAll(() => connection.close());

  it('start saves the combat at round 1 and the combatants in the order they entered', async () => {
    const started = await combat.start(sceneId, tokenIds);
    expect(started.combat).toMatchObject({ sceneId, round: 1, currentCombatantId: null });
    expect(
      started.combatants.map(({ tokenId, tieOrder, initiative }) => [
        tokenId,
        tieOrder,
        initiative,
      ]),
    ).toEqual([
      [tokenIds[0], 0, null],
      [tokenIds[1], 1, null],
      [tokenIds[2], 2, null],
    ]);
  });

  it('findOfScene finds the combat of the scene', async () => {
    const started = await combat.start(sceneId, tokenIds);
    expect(await combat.findOfScene(sceneId)).toMatchObject({ combat: { id: started.combat.id } });
  });

  it('a second combat on the same scene violates the unique scene', async () => {
    await combat.start(sceneId, tokenIds);
    await expect(combat.start(sceneId, tokenIds)).rejects.toMatchObject({
      cause: { code: UNIQUE_VIOLATION },
    });
  });

  it('addCombatants appends after the last and skips who is already in', async () => {
    const started = await combat.start(sceneId, tokenIds.slice(0, 1));
    await combat.addCombatants(started.combat.id, [tokenIds[0] ?? '', tokenIds[1] ?? '']);
    const found = await combat.findOfScene(sceneId);
    expect(found?.combatants.map(({ tieOrder }) => tieOrder)).toEqual([0, 1]);
  });

  it('setInitiative, setTieOrders and setTurn save what the turn needs', async () => {
    const started = await combat.start(sceneId, tokenIds);
    const [kael, lyra] = started.combatants;
    if (!kael || !lyra) throw new Error('combatants missing');
    await combat.setInitiative(kael.id, 18);
    await combat.setTieOrders([
      { combatantId: kael.id, tieOrder: 1 },
      { combatantId: lyra.id, tieOrder: 0 },
    ]);
    await combat.setTurn(started.combat.id, 3, lyra.id);
    const found = await combat.findOfScene(sceneId);
    expect(found?.combat).toMatchObject({ round: 3, currentCombatantId: lyra.id });
    expect(found?.combatants.find(({ id }) => id === kael.id)).toMatchObject({
      initiative: 18,
      tieOrder: 1,
    });
  });

  it('deleting a token deletes its combatant (cascade), and end deletes the combat', async () => {
    const started = await combat.start(sceneId, tokenIds);
    await connection.db.delete(tokens).where(eq(tokens.id, tokenIds[0] ?? ''));
    expect((await combat.findOfScene(sceneId))?.combatants).toHaveLength(2);
    await combat.end(started.combat.id);
    expect(await combat.findOfScene(sceneId)).toBeUndefined();
  });
});
