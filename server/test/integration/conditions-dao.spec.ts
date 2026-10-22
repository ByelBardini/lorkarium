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
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const UNIQUE_VIOLATION = '23505';

describe('ConditionsDao on Postgres', () => {
  let connection: DatabaseConnection;
  let conditions: ConditionsDao;
  let vharnId: string;
  let quelmId: string;
  let lyraId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
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
    const sceneId = (await new ScenesDao(connection.db).insert({ campaignId: vharnId })).id;
    const token = {
      sceneId,
      name: 'Lyra',
      initials: 'LY',
      side: 'ally',
      width: 1,
      height: 1,
      col: 0,
      row: 0,
    } as const;
    lyraId = (await new TokensDao(connection.db).insert({ token, bars: [], controllerIds: [] }))
      .token.id;
    await conditions.insertDefinitions(vharnId, DEFAULT_CONDITIONS);
  });

  afterAll(() => connection.close());

  async function definitionNamed(name: string): Promise<string> {
    const found = (await conditions.listDefinitions(vharnId)).find((d) => d.name === name);
    if (!found) throw new Error(`no definition named ${name}`);
    return found.id;
  }

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

  it('setRemaining and deleteActive keep the countdown of the turns', async () => {
    const atordoado = await conditions.apply(lyraId, await definitionNamed('Atordoado'), {
      remainingRounds: 1,
      appliedRound: null,
    });
    const envenenado = await conditions.apply(lyraId, await definitionNamed('Envenenado'), {
      remainingRounds: 3,
      appliedRound: null,
    });
    await conditions.setRemaining(envenenado.id, 2);
    await conditions.deleteActive([atordoado.id]);
    expect(await conditions.listOfTokens([lyraId])).toEqual([
      expect.objectContaining({ name: 'Envenenado', remainingRounds: 2 }),
    ]);
  });
});
