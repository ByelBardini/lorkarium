import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { runInTransaction } from '../../src/database/transaction';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignMembersDao } from '../../src/modules/campaigns/campaign-members.dao';
import { campaignMembers } from '../../src/modules/campaigns/campaign-members.po';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { DEFAULT_CONDITIONS } from '../../src/modules/conditions/condition-rules.bo';
import { ConditionsDao } from '../../src/modules/conditions/conditions.dao';
import { CharactersDao, type NewCharacterRow } from '../../src/modules/characters/characters.dao';
import type { CharacterBarInputPo } from '../../src/modules/characters/characters.po';
import { scenes } from '../../src/modules/scenes/scenes.po';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { CountingQueryLog } from '../support/query-count';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const PV: CharacterBarInputPo = {
  label: 'PV',
  current: 25,
  max: 30,
  color: 'ember',
  visibility: 'controllers',
};
const MANA: CharacterBarInputPo = {
  label: 'Mana',
  current: 4,
  max: 10,
  color: 'steel',
  visibility: 'everyone',
};

describe('CharactersDao on Postgres', () => {
  let connection: DatabaseConnection;
  let dao: CharactersDao;
  let vharnId: string;
  let quelmId: string;
  let biaId: string;
  let caioId: string;
  const queries = new CountingQueryLog();

  function newCharacter(
    campaignId: string,
    userId: string | null,
    name: string,
    more: Partial<NewCharacterRow> = {},
  ): NewCharacterRow {
    const character = {
      campaignId,
      userId,
      name,
      initials: name.slice(0, 2),
      side: 'ally' as const,
    };
    const controllerIds = userId ? [userId] : [];
    return { character, bars: [], controllerIds, ...more };
  }

  beforeAll(async () => {
    connection = await openTestDatabase({ queryLog: queries });
    dao = new CharactersDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const users = new UsersDao(connection.db);
    const anaId = (await users.insert(newUserPo())).id;
    biaId = (await users.insert(newUserPo({ email: 'bia@mesa.com', name: 'Bia' }))).id;
    caioId = (await users.insert(newUserPo({ email: 'caio@mesa.com', name: 'Caio' }))).id;
    const campaigns = new CampaignsDao(connection.db);
    vharnId = (await campaigns.insert(newCampaignPo({ ownerId: anaId }))).id;
    const quelm = newCampaignPo({ ownerId: caioId, name: 'Quelm', joinCode: 'QELM2345' });
    quelmId = (await campaigns.insert(quelm)).id;
    const members = new CampaignMembersDao(connection.db);
    await members.insert({ campaignId: vharnId, userId: anaId, role: 'master' });
    await members.insert({ campaignId: vharnId, userId: biaId, role: 'player' });
    await members.insert({ campaignId: vharnId, userId: caioId, role: 'player' });
    await members.insert({ campaignId: quelmId, userId: caioId, role: 'master' });
  });

  afterAll(() => connection.close());

  async function insertLyra(): Promise<string> {
    const lyra = newCharacter(vharnId, biaId, 'Lyra', { bars: [PV, MANA] });
    return (await runInTransaction(connection.db, (tx) => new CharactersDao(tx).insert(lyra)))
      .character.id;
  }

  describe('insert and reads', () => {
    it('insert returns Lyra with her bars by position, her controller and the role of Bia', async () => {
      const lyra = newCharacter(vharnId, biaId, 'Lyra', { bars: [PV, MANA] });

      const row = await runInTransaction(connection.db, (tx) => new CharactersDao(tx).insert(lyra));

      expect(row.character).toMatchObject({ campaignId: vharnId, userId: biaId, name: 'Lyra' });
      expect(row.bars.map(({ label, position }) => [label, position])).toEqual([
        ['PV', 0],
        ['Mana', 1],
      ]);
      expect(row.controllerIds).toEqual([biaId]);
      expect(row.holderRole).toBe('player');
    });

    it('listOfCampaign brings every character of Vharn, oldest first, and none of Quelm', async () => {
      await insertLyra();
      await dao.insert(newCharacter(vharnId, caioId, 'Bram'));
      await dao.insert(newCharacter(quelmId, caioId, 'Sombra'));

      const rows = await dao.listOfCampaign(vharnId);

      expect(rows.map(({ character }) => character.name)).toEqual(['Lyra', 'Bram']);
      expect(rows[0]?.bars.map(({ label }) => label)).toEqual(['PV', 'Mana']);
      expect(rows[1]?.bars).toEqual([]);
    });

    it('findInCampaign finds Lyra at Vharn and nothing when asked at Quelm', async () => {
      const lyraId = await insertLyra();

      expect((await dao.findInCampaign(vharnId, lyraId))?.character.name).toBe('Lyra');
      expect(await dao.findInCampaign(quelmId, lyraId)).toBeUndefined();
    });

    it('findManyInCampaign leaves out the asked character of another table', async () => {
      const lyraId = await insertLyra();
      const sombra = await dao.insert(newCharacter(quelmId, caioId, 'Sombra'));

      const rows = await dao.findManyInCampaign(vharnId, [lyraId, sombra.character.id]);

      expect(rows.map(({ character }) => character.id)).toEqual([lyraId]);
      expect(await dao.findManyInCampaign(vharnId, [])).toEqual([]);
    });

    it('findOfUser finds the character of Bia at Vharn and none of hers at Quelm', async () => {
      const lyraId = await insertLyra();

      expect((await dao.findOfUser(vharnId, biaId))?.character.id).toBe(lyraId);
      expect(await dao.findOfUser(quelmId, biaId)).toBeUndefined();
    });

    it('Bia demoted to spectator reads back as the holder spectator', async () => {
      const lyraId = await insertLyra();

      await new CampaignMembersDao(connection.db).updateRole(vharnId, biaId, 'spectator');

      expect((await dao.findInCampaign(vharnId, lyraId))?.holderRole).toBe('spectator');
    });

    it('Bia out of Vharn leaves Lyra stored with her id and no holder role', async () => {
      const lyraId = await insertLyra();
      const ofBia = and(eq(campaignMembers.campaignId, vharnId), eq(campaignMembers.userId, biaId));

      await connection.db.delete(campaignMembers).where(ofBia);

      const row = await dao.findInCampaign(vharnId, lyraId);
      expect([row?.character.userId, row?.holderRole]).toEqual([biaId, null]);
    });
  });

  describe('the conditions of a character', () => {
    async function poisoned(characterId: string): Promise<string> {
      const conditions = new ConditionsDao(connection.db);
      const [envenenado] = await conditions.insertDefinitions(vharnId, DEFAULT_CONDITIONS);
      if (!envenenado) throw new Error('the default conditions were not saved');
      const forever = { remainingRounds: null, appliedRound: null };
      await conditions.apply({ characterId }, envenenado.id, forever);
      return envenenado.name;
    }

    it('every read brings its conditions, the whole table in one query more', async () => {
      const lyra = await insertLyra();
      const name = await poisoned(lyra);
      queries.reset();

      const [listed] = await dao.listOfCampaign(vharnId);

      expect(queries.count).toBe(3);
      expect(listed?.conditions.map((c) => [c.name, c.characterId])).toEqual([[name, lyra]]);
      expect((await dao.findInCampaign(vharnId, lyra))?.conditions).toHaveLength(1);
      expect((await dao.findOfUser(vharnId, biaId))?.conditions).toHaveLength(1);
    });

    it('what a grid wears of it (findManyAtSceneTable) reads no condition', async () => {
      const lyra = await insertLyra();
      await poisoned(lyra);
      const [salao] = await connection.db
        .insert(scenes)
        .values({ campaignId: vharnId, name: 'Salão' })
        .returning();
      queries.reset();

      const [worn] = await dao.findManyAtSceneTable(salao?.id ?? '', [lyra]);

      expect(queries.count).toBe(2);
      expect(worn).not.toHaveProperty('conditions');
    });
  });

  describe('writes', () => {
    it('update is a patch: an absent key stays and null clears only its field', async () => {
      const lyraId = await insertLyra();

      await dao.update(lyraId, { armorClass: 15, noteOne: 'Ferida' });
      await dao.update(lyraId, { noteOne: null, difficultyClass: 13 });

      expect((await dao.findInCampaign(vharnId, lyraId))?.character).toMatchObject({
        armorClass: 15,
        difficultyClass: 13,
        noteOne: null,
        name: 'Lyra',
      });
    });

    it('setBarValues writes the PV of Lyra and leaves the Mana', async () => {
      const lyraId = await insertLyra();
      const before = await dao.findInCampaign(vharnId, lyraId);
      const pvId = before?.bars[0]?.id ?? '';

      await dao.setBarValues(pvId, { current: 18, max: 30, temp: 4 });

      const bars = (await dao.findInCampaign(vharnId, lyraId))?.bars;
      expect(bars?.[0]?.temp).toBe(4);
      expect(bars?.map(({ label, current }) => [label, current])).toEqual([
        ['PV', 18],
        ['Mana', 4],
      ]);
    });

    it('replaceBars puts the given bars in order and drops the old ones', async () => {
      const lyraId = await insertLyra();

      await runInTransaction(connection.db, (tx) =>
        new CharactersDao(tx).replaceBars(lyraId, [MANA]),
      );

      const bars = (await dao.findInCampaign(vharnId, lyraId))?.bars;
      expect(bars?.map(({ label, position }) => [label, position])).toEqual([['Mana', 0]]);
    });

    it('replaceControllers sets who controls Lyra, a repeated id once', async () => {
      const lyraId = await insertLyra();

      await dao.replaceControllers(lyraId, [caioId, biaId, caioId]);

      const controllerIds = (await dao.findInCampaign(vharnId, lyraId))?.controllerIds;
      expect([...(controllerIds ?? [])].sort()).toEqual([biaId, caioId].sort());
    });

    it('setUser(null) leaves Lyra nobody’s: no player and no holder role', async () => {
      const lyraId = await insertLyra();

      await dao.setUser(lyraId, null);

      const row = await dao.findInCampaign(vharnId, lyraId);
      expect([row?.character.userId, row?.holderRole]).toEqual([null, null]);
      expect(await dao.findOfUser(vharnId, biaId)).toBeUndefined();
    });

    it('the CHECK refuses an armor class of 1000', async () => {
      const lyraId = await insertLyra();

      await expect(dao.update(lyraId, { armorClass: 1000 })).rejects.toMatchObject({
        cause: expect.objectContaining({ constraint: 'characters_armor_class_range' }),
      });
    });

    it('a second character of Bia at Vharn is refused by the unique index', async () => {
      await insertLyra();

      await expect(dao.insert(newCharacter(vharnId, biaId, 'Mira'))).rejects.toMatchObject({
        cause: expect.objectContaining({ constraint: 'characters_campaign_user_unique' }),
      });
    });
  });

  describe('version of the characters', () => {
    it('lockVersion reads 0, each bump adds one, and Quelm keeps its own', async () => {
      const bumped = await runInTransaction(connection.db, async (tx) => {
        const locked = new CharactersDao(tx);
        const first = await locked.lockVersion(vharnId);
        return [first, await locked.bumpVersion(vharnId), await locked.bumpVersion(vharnId)];
      });

      expect(bumped).toEqual([0, 1, 2]);
      expect(await dao.versionOf(vharnId)).toBe(2);
      expect(await dao.versionOf(quelmId)).toBe(0);
    });

    it('a table that does not exist has no version to lock or read', async () => {
      const missing = 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b';

      expect(await dao.lockVersion(missing)).toBeUndefined();
      expect(await dao.versionOf(missing)).toBeUndefined();
    });
  });
});
