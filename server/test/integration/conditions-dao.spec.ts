import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { DEFAULT_CONDITIONS } from '../../src/modules/conditions/condition-rules.bo';
import { ConditionsDao } from '../../src/modules/conditions/conditions.dao';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { TokensDao } from '../../src/modules/tokens/tokens.dao';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { CountingQueryLog } from '../support/query-count';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const UNIQUE_VIOLATION = '23505';

describe('ConditionsDao on Postgres', () => {
  let connection: DatabaseConnection;
  let conditions: ConditionsDao;
  let vharnId: string;
  let quelmId: string;
  let lyraId: string;
  let tokensDao: TokensDao;
  let scenesDao: ScenesDao;
  const queries = new CountingQueryLog();

  beforeAll(async () => {
    connection = await openTestDatabase({ queryLog: queries });
    conditions = new ConditionsDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const ownerId = (await new UsersDao(connection.db).insert(newUserPo())).id;
    const campaigns = new CampaignsDao(connection.db);
    vharnId = (await campaigns.insert(newCampaignPo({ ownerId }))).id;
    quelmId = (
      await campaigns.insert(newCampaignPo({ ownerId, name: 'Quelm', joinCode: 'QELM2345' }))
    ).id;
    scenesDao = new ScenesDao(connection.db);
    tokensDao = new TokensDao(connection.db);
    const sceneId = (await scenesDao.insert({ campaignId: vharnId })).id;
    lyraId = await tokenIn(sceneId, 'Lyra');
    await conditions.insertDefinitions(vharnId, DEFAULT_CONDITIONS);
    await conditions.insertDefinitions(quelmId, DEFAULT_CONDITIONS);
  });

  afterAll(() => connection.close());

  async function definitionNamed(name: string, campaignId = vharnId): Promise<string> {
    const found = (await conditions.listDefinitions(campaignId)).find((d) => d.name === name);
    if (!found) throw new Error(`no definition named ${name}`);
    return found.id;
  }

  async function tokenIn(sceneId: string, name: string): Promise<string> {
    const token = {
      sceneId,
      name,
      initials: name.slice(0, 2).toUpperCase(),
      side: 'ally',
      width: 1,
      height: 1,
      col: 0,
      row: 0,
    } as const;
    return (await tokensDao.insert({ token, bars: [], controllerIds: [] })).token.id;
  }

  const FOREVER = { remainingRounds: null, appliedRound: null } as const;

  const ENVENENADO_DESCRIBED = {
    name: 'Envenenado',
    tone: 'harm',
    icon: 'skull',
    look: null,
    color: null,
    description: 'Desvantagem em ataques.',
    maxStacks: null,
  } as const;

  it('the initial list has the 11 conditions, benefits and harms, by name', async () => {
    const listed = await conditions.listDefinitions(vharnId);
    expect(listed).toHaveLength(11);
    expect(listed.filter(({ tone }) => tone === 'benefit').map(({ name }) => name)).toEqual([
      'Abençoado',
      'Concentrando',
      'Invisível',
    ]);
  });

  it('a new table starts with Paralisado and Atordoado incapacitating and Invisível translucent', async () => {
    const listed = await conditions.listDefinitions(vharnId);
    expect(listed.filter(({ tone }) => tone === 'incapacitating').map(({ name }) => name)).toEqual([
      'Atordoado',
      'Paralisado',
    ]);
    expect(listed.find(({ name }) => name === 'Invisível')).toMatchObject({
      tone: 'benefit',
      look: 'invisible',
    });
    expect(listed.filter(({ look }) => look !== null).map(({ name }) => name)).toEqual([
      'Invisível',
    ]);
  });

  it('insertDefinition saves the incapacitating tone and the look, and only this table lists it', async () => {
    const saved = await conditions.insertDefinition(vharnId, {
      name: 'Inconsciente',
      tone: 'incapacitating',
      icon: 'moon',
      look: 'unconscious',
      color: null,
      description: '',
      maxStacks: null,
    });
    expect(saved).toMatchObject({ tone: 'incapacitating', look: 'unconscious' });
    expect(await conditions.findDefinitionByName(vharnId, 'inconsciente')).toMatchObject({
      look: 'unconscious',
    });
    expect((await conditions.listDefinitions(quelmId)).map(({ name }) => name)).not.toContain(
      'Inconsciente',
    );
  });

  it('listOfTokens brings the look of the definition', async () => {
    await conditions.apply(lyraId, await definitionNamed('Invisível'), {
      remainingRounds: null,
      appliedRound: null,
    });
    expect(await conditions.listOfTokens([lyraId])).toEqual([
      expect.objectContaining({ name: 'Invisível', tone: 'benefit', look: 'invisible' }),
    ]);
  });

  it('a definition of another table is not found in this one', async () => {
    const envenenado = await definitionNamed('Envenenado');
    expect(await conditions.findDefinitionInCampaign(vharnId, envenenado)).toMatchObject({
      name: 'Envenenado',
    });
    expect(await conditions.findDefinitionInCampaign(quelmId, envenenado)).toBeUndefined();
  });

  it('defining "envenenado" when "Envenenado" exists violates the unique index, whatever the case', async () => {
    const duplicate = conditions.insertDefinition(vharnId, {
      name: 'envenenado',
      tone: 'harm',
      icon: 'skull',
      look: null,
      color: null,
      description: '',
      maxStacks: null,
    });
    await expect(duplicate).rejects.toMatchObject({ cause: { code: UNIQUE_VIOLATION } });
    expect(await conditions.findDefinitionByName(vharnId, 'ENVENENADO')).toMatchObject({
      name: 'Envenenado',
    });
  });

  it('apply saves the active condition with its name and tone, and applying again replaces the duration and the round', async () => {
    const envenenado = await definitionNamed('Envenenado');
    await conditions.apply(lyraId, envenenado, { remainingRounds: 2, appliedRound: null });
    const again = await conditions.apply(lyraId, envenenado, {
      remainingRounds: 5,
      appliedRound: 3,
    });
    expect(again).toMatchObject({
      tokenId: lyraId,
      name: 'Envenenado',
      tone: 'harm',
      icon: 'flask-conical',
      remainingRounds: 5,
      appliedRound: 3,
    });
    expect(await conditions.listOfTokens([lyraId])).toHaveLength(1);
  });

  it('remove takes the condition off the token, and only from that token', async () => {
    const applied = await conditions.apply(lyraId, await definitionNamed('Caído'), {
      remainingRounds: null,
      appliedRound: null,
    });
    expect(await conditions.remove('00000000-0000-4000-8000-000000000000', applied.id)).toBe(false);
    expect(await conditions.remove(lyraId, applied.id)).toBe(true);
    expect(await conditions.listOfTokens([lyraId])).toEqual([]);
  });

  it('decrementRemaining and deleteActive keep the countdown of the turns', async () => {
    const atordoado = await conditions.apply(lyraId, await definitionNamed('Atordoado'), {
      remainingRounds: 1,
      appliedRound: null,
    });
    const envenenado = await conditions.apply(lyraId, await definitionNamed('Envenenado'), {
      remainingRounds: 3,
      appliedRound: null,
    });
    await conditions.decrementRemaining([envenenado.id]);
    await conditions.deleteActive([atordoado.id]);
    expect(await conditions.listOfTokens([lyraId])).toEqual([
      expect.objectContaining({ name: 'Envenenado', remainingRounds: 2 }),
    ]);
  });

  it('decrementRemaining takes one round off every listed condition in 1 UPDATE and leaves the rest', async () => {
    const timed = { remainingRounds: 3, appliedRound: null };
    const caido = await conditions.apply(lyraId, await definitionNamed('Caído'), timed);
    const cego = await conditions.apply(lyraId, await definitionNamed('Cego'), timed);
    const kept = await conditions.apply(lyraId, await definitionNamed('Envenenado'), timed);
    queries.reset();

    await conditions.decrementRemaining([caido.id, cego.id]);

    expect(queries.count).toBe(1);
    const left = new Map(
      (await conditions.listOfTokens([lyraId])).map((c) => [c.id, c.remainingRounds]),
    );
    expect([left.get(caido.id), left.get(cego.id), left.get(kept.id)]).toEqual([2, 2, 3]);
  });

  it('insertDefinitions answers the rows saved, with the description, and nothing for an empty list', async () => {
    const saved = await conditions.insertDefinitions(vharnId, [
      { ...ENVENENADO_DESCRIBED, name: 'Sangrando' },
    ]);

    expect(saved).toEqual([
      expect.objectContaining({
        campaignId: vharnId,
        name: 'Sangrando',
        description: 'Desvantagem em ataques.',
      }),
    ]);
    expect(await conditions.insertDefinitions(vharnId, [])).toEqual([]);
  });

  it('updateDefinition replaces the fields, and the active condition reads the new icon and description', async () => {
    const envenenado = await definitionNamed('Envenenado');
    await conditions.apply(lyraId, envenenado, FOREVER);

    const updated = await conditions.updateDefinition(vharnId, envenenado, ENVENENADO_DESCRIBED);

    expect(updated).toMatchObject({ id: envenenado, ...ENVENENADO_DESCRIBED });
    expect(await conditions.listOfTokens([lyraId])).toEqual([
      expect.objectContaining({ icon: 'skull', description: 'Desvantagem em ataques.' }),
    ]);
  });

  it('updateDefinition with Quelm’s id under Vharn is undefined and Quelm’s condition is untouched', async () => {
    const quelmEnvenenado = await definitionNamed('Envenenado', quelmId);

    const updated = await conditions.updateDefinition(vharnId, quelmEnvenenado, {
      ...ENVENENADO_DESCRIBED,
      name: 'Sumido',
    });

    expect(updated).toBeUndefined();
    expect(await conditions.findDefinitionInCampaign(quelmId, quelmEnvenenado)).toMatchObject({
      name: 'Envenenado',
      description: '',
    });
  });

  it('renaming into "cego" when "Cego" exists violates the unique index', async () => {
    const envenenado = await definitionNamed('Envenenado');

    const renamed = conditions.updateDefinition(vharnId, envenenado, {
      ...ENVENENADO_DESCRIBED,
      name: 'cego',
    });

    await expect(renamed).rejects.toMatchObject({ cause: { code: UNIQUE_VIOLATION } });
  });

  it('deleteDefinition answers true and the cascade takes the condition off the token', async () => {
    const cego = await definitionNamed('Cego');
    await conditions.apply(lyraId, cego, FOREVER);
    await conditions.apply(lyraId, await definitionNamed('Caído'), FOREVER);

    expect(await conditions.deleteDefinition(vharnId, cego)).toBe(true);

    expect(await conditions.findDefinitionInCampaign(vharnId, cego)).toBeUndefined();
    expect((await conditions.listOfTokens([lyraId])).map(({ name }) => name)).toEqual(['Caído']);
  });

  it('deleteDefinition with Quelm’s id under Vharn is false and Quelm keeps it', async () => {
    const quelmCego = await definitionNamed('Cego', quelmId);

    expect(await conditions.deleteDefinition(vharnId, quelmCego)).toBe(false);

    expect(await conditions.findDefinitionInCampaign(quelmId, quelmCego)).toMatchObject({
      name: 'Cego',
    });
  });

  it('countActiveOf counts the tokens holding it on every grid and the cast, once each', async () => {
    const cego = await definitionNamed('Cego');
    const torre = (await scenesDao.insert({ campaignId: vharnId, name: 'Torre' })).id;
    const cast = (await scenesDao.insert({ campaignId: vharnId, kind: 'cast' })).id;
    const goblin = await tokenIn(torre, 'Goblin');
    const kael = await tokenIn(cast, 'Kael');
    const spared = await tokenIn(torre, 'Bram');
    for (const tokenId of [lyraId, goblin, kael]) await conditions.apply(tokenId, cego, FOREVER);
    await conditions.apply(spared, await definitionNamed('Caído'), FOREVER);

    expect(await conditions.countActiveOf(vharnId, cego)).toBe(3);
  });

  it('countActiveOf of a condition nobody holds is 0', async () => {
    expect(await conditions.countActiveOf(vharnId, await definitionNamed('Cego'))).toBe(0);
  });

  it('countActiveOf under Quelm does not count the tokens of Vharn', async () => {
    const cego = await definitionNamed('Cego');
    await conditions.apply(lyraId, cego, FOREVER);

    expect(await conditions.countActiveOf(quelmId, cego)).toBe(0);
  });

  describe('stacks', () => {
    let sangrando: string;

    beforeEach(async () => {
      const definition = { ...ENVENENADO_DESCRIBED, name: 'Sangrando', maxStacks: 5 };
      sangrando = (await conditions.insertDefinition(vharnId, definition)).id;
    });

    it('apply without stacks saves 1, and applying again with 3 replaces them on the same row', async () => {
      const first = await conditions.apply(lyraId, sangrando, FOREVER);

      const again = await conditions.apply(lyraId, sangrando, FOREVER, 3);

      expect(first).toMatchObject({ stacks: 1, maxStacks: 5 });
      expect(again).toMatchObject({ id: first.id, stacks: 3, maxStacks: 5 });
      expect(await conditions.listOfTokens([lyraId])).toHaveLength(1);
    });

    it('stacksOf maps each holder to its stacks in 1 query and leaves out who does not hold it', async () => {
      const torre = (await scenesDao.insert({ campaignId: vharnId, name: 'Torre' })).id;
      const goblin = await tokenIn(torre, 'Goblin');
      const spared = await tokenIn(torre, 'Bram');
      await conditions.apply(lyraId, sangrando, FOREVER, 4);
      await conditions.apply(goblin, sangrando, FOREVER, 2);
      await conditions.apply(spared, await definitionNamed('Cego'), FOREVER);
      queries.reset();

      const held = await conditions.stacksOf([lyraId, goblin, spared], sangrando);

      expect(queries.count).toBe(1);
      expect([...held.entries()].sort()).toEqual(
        [
          [lyraId, 4],
          [goblin, 2],
        ].sort(),
      );
    });

    it('stacksOf of no token answers an empty map without a query', async () => {
      queries.reset();

      expect((await conditions.stacksOf([], sangrando)).size).toBe(0);
      expect(queries.count).toBe(0);
    });

    it('findActiveOnToken finds the condition only on its own token', async () => {
      const goblin = await tokenIn((await scenesDao.insert({ campaignId: vharnId })).id, 'Goblin');
      const applied = await conditions.apply(lyraId, sangrando, FOREVER, 2);

      expect(await conditions.findActiveOnToken(lyraId, applied.id)).toMatchObject({
        stacks: 2,
        maxStacks: 5,
      });
      expect(await conditions.findActiveOnToken(goblin, applied.id)).toBeUndefined();
    });

    it('setStacks changes only the stacks of that token: rounds and applied round stay', async () => {
      const applied = await conditions.apply(lyraId, sangrando, {
        remainingRounds: 3,
        appliedRound: 2,
      });

      const changed = await conditions.setStacks(lyraId, applied.id, 4);

      expect(changed).toMatchObject({
        id: applied.id,
        stacks: 4,
        remainingRounds: 3,
        appliedRound: 2,
      });
    });

    it('setStacks with the id under another token is undefined and the stacks stay', async () => {
      const goblin = await tokenIn((await scenesDao.insert({ campaignId: vharnId })).id, 'Goblin');
      const applied = await conditions.apply(lyraId, sangrando, FOREVER, 2);

      expect(await conditions.setStacks(goblin, applied.id, 4)).toBeUndefined();
      expect(await conditions.findActiveOnToken(lyraId, applied.id)).toMatchObject({ stacks: 2 });
    });

    it('capStacks brings down only the holders of that condition above the ceiling', async () => {
      const goblin = await tokenIn((await scenesDao.insert({ campaignId: vharnId })).id, 'Goblin');
      const queimando = (
        await conditions.insertDefinition(vharnId, {
          ...ENVENENADO_DESCRIBED,
          name: 'Queimando',
          maxStacks: 5,
        })
      ).id;
      await conditions.apply(lyraId, sangrando, FOREVER, 4);
      await conditions.apply(goblin, sangrando, FOREVER, 1);
      await conditions.apply(lyraId, queimando, FOREVER, 5);

      await conditions.capStacks(sangrando, 2);

      const stacksOf = async (tokenId: string, conditionId: string) =>
        (await conditions.stacksOf([tokenId], conditionId)).get(tokenId);
      expect([
        await stacksOf(lyraId, sangrando),
        await stacksOf(goblin, sangrando),
        await stacksOf(lyraId, queimando),
      ]).toEqual([2, 1, 5]);
    });
  });
});
