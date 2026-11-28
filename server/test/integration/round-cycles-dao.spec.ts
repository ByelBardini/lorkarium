import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { DatabaseConnection } from '../../src/database/database';
import { assets } from '../../src/modules/assets/assets.po';
import { characters } from '../../src/modules/characters/characters.po';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { AssetsDao } from '../../src/modules/assets/assets.dao';
import { CampaignMembersDao } from '../../src/modules/campaigns/campaign-members.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { tokens as tokensTable } from '../../src/modules/tokens/tokens.po';
import { CharactersDao } from '../../src/modules/characters/characters.dao';
import { CombatDao } from '../../src/modules/combat/combat.dao';
import {
  RoundCyclesDao,
  type RoundCycleRow,
  type RoundCycleWrite,
} from '../../src/modules/round-cycles/round-cycles.dao';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { TokensDao } from '../../src/modules/tokens/tokens.dao';
import { newAssetPo } from '../support/assets-factories';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const CHECK_VIOLATION = '23514';

describe('RoundCyclesDao on Postgres', () => {
  let connection: DatabaseConnection;
  let cycles: RoundCyclesDao;
  let vharnId: string;
  let quelmId: string;
  let ownerId: string;
  let lyraUserId: string;
  let sceneId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
    cycles = new RoundCyclesDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const users = new UsersDao(connection.db);
    ownerId = (await users.insert(newUserPo())).id;
    lyraUserId = (await users.insert(newUserPo({ email: 'lyra@mesa.com' }))).id;
    const campaigns = new CampaignsDao(connection.db);
    vharnId = (await campaigns.insert(newCampaignPo({ ownerId }))).id;
    quelmId = (
      await campaigns.insert(newCampaignPo({ ownerId, name: 'Quelm', joinCode: 'QELM2345' }))
    ).id;
    sceneId = (await new ScenesDao(connection.db).insert({ campaignId: vharnId })).id;
  });

  afterAll(() => connection.close());

  const moon = (overrides: Partial<RoundCycleWrite> = {}): RoundCycleWrite => ({
    name: 'Fases da Lua',
    visibility: 'some',
    announce: true,
    holderCharacterId: null,
    holderTokenId: null,
    phases: ['Lua Nova', 'Crescente', 'Lua Cheia', 'Minguante'].map((name) => ({
      name,
      icon: 'game-icons:cycle',
      imageAssetId: null,
    })),
    members: [{ userId: lyraUserId, canSee: true, canChoose: true }],
    ...overrides,
  });

  const phaseNames = (row: RoundCycleRow | undefined): string[] =>
    (row?.phases ?? []).map(({ name }) => name);

  async function characterOf(campaignId: string, name: string): Promise<string> {
    const character = { campaignId, userId: null, name, initials: 'LY', side: 'ally' as const };
    const row = await new CharactersDao(connection.db).insert({
      character,
      bars: [],
      controllerIds: [],
    });
    return row.character.id;
  }

  async function tokenIn(name: string): Promise<string> {
    const token = {
      sceneId,
      name,
      initials: name.slice(0, 2).toUpperCase(),
      side: 'enemy',
      width: 1,
      height: 1,
      col: 0,
      row: 0,
    } as const;
    const tokens = new TokensDao(connection.db);
    return (await tokens.insert({ token, bars: [], controllerIds: [] })).token.id;
  }

  async function combatId(): Promise<string> {
    const started = await new CombatDao(connection.db).start(sceneId, [
      { name: 'Bandido', tokenIds: [], initiative: 10 },
    ]);
    return started.combat.id;
  }

  async function errorCodeOf(work: Promise<unknown>): Promise<string | undefined> {
    const error: unknown = await work.then(
      () => undefined,
      (caught: unknown) => caught,
    );
    const cause = (error as { cause?: { code?: string } } | undefined)?.cause;
    return cause?.code ?? (error as { code?: string } | undefined)?.code;
  }

  it('a cycle inserted is read back with its phases in order and its members', async () => {
    const saved = await cycles.insertCycle(vharnId, moon());

    const [listed] = await cycles.listOfCampaign(vharnId);
    expect(listed?.cycle).toMatchObject({
      id: saved.cycle.id,
      name: 'Fases da Lua',
      announce: true,
    });
    expect(phaseNames(listed)).toEqual(['Lua Nova', 'Crescente', 'Lua Cheia', 'Minguante']);
    expect(listed?.members).toEqual([
      { cycleId: saved.cycle.id, userId: lyraUserId, canSee: true, canChoose: true },
    ]);
  });

  it('replacing reorders the kept phases by id, adds the new and deletes the ones left out', async () => {
    const saved = await cycles.insertCycle(vharnId, moon());
    const [nova, crescente] = saved.phases;
    const write = moon({
      name: 'Lua',
      phases: [
        { id: crescente?.id, name: 'Crescente', icon: 'game-icons:cycle', imageAssetId: null },
        { id: nova?.id, name: 'Nova', icon: 'game-icons:cycle', imageAssetId: null },
        { name: 'Eclipse', icon: 'game-icons:cycle', imageAssetId: null },
      ],
      members: [],
    });

    const replaced = await cycles.replaceCycle(vharnId, saved.cycle.id, write);

    expect(replaced?.cycle.name).toBe('Lua');
    expect(phaseNames(replaced)).toEqual(['Crescente', 'Nova', 'Eclipse']);
    expect(replaced?.phases.slice(0, 2).map(({ id }) => id)).toEqual([crescente?.id, nova?.id]);
    expect(replaced?.members).toEqual([]);
  });

  it('a phase id of another cycle in the replace is not taken: it becomes a new phase', async () => {
    const other = await cycles.insertCycle(vharnId, moon({ name: 'Maré' }));
    const saved = await cycles.insertCycle(vharnId, moon());
    const foreignId = other.phases[0]?.id;

    const replaced = await cycles.replaceCycle(vharnId, saved.cycle.id, {
      ...moon(),
      phases: [
        { id: foreignId, name: 'Roubada', icon: 'game-icons:cycle', imageAssetId: null },
        { name: 'Outra', icon: 'game-icons:cycle', imageAssetId: null },
      ],
    });

    expect(replaced?.phases.map(({ id }) => id)).not.toContain(foreignId);
    expect(phaseNames(await cycles.findInCampaign(vharnId, other.cycle.id))[0]).toBe('Lua Nova');
  });

  it('deleting a cycle removes it and its phases; the count drops', async () => {
    const saved = await cycles.insertCycle(vharnId, moon());
    expect(await cycles.countOfCampaign(vharnId)).toBe(1);

    expect(await cycles.deleteCycle(vharnId, saved.cycle.id)).toBe(true);

    expect(await cycles.listOfCampaign(vharnId)).toEqual([]);
    expect(await cycles.countOfCampaign(vharnId)).toBe(0);
  });

  it('a cycle of table A is not found, replaced nor deleted through table B', async () => {
    const saved = await cycles.insertCycle(vharnId, moon());

    expect(await cycles.findInCampaign(quelmId, saved.cycle.id)).toBeUndefined();
    expect(await cycles.replaceCycle(quelmId, saved.cycle.id, moon({ name: 'X' }))).toBeUndefined();
    expect(await cycles.deleteCycle(quelmId, saved.cycle.id)).toBe(false);
    expect(await cycles.listOfCampaign(quelmId)).toEqual([]);
    expect((await cycles.findInCampaign(vharnId, saved.cycle.id))?.cycle.name).toBe('Fases da Lua');
  });

  it('deleting the holder character deletes its cycle', async () => {
    const lyra = await characterOf(vharnId, 'Lyra');
    await cycles.insertCycle(vharnId, moon({ holderCharacterId: lyra }));
    expect(await cycles.countOfCampaign(vharnId)).toBe(1);

    await connection.db.delete(characters).where(eq(characters.id, lyra));

    expect(await cycles.listOfCampaign(vharnId)).toEqual([]);
  });

  it('deleting the phase image leaves the phase with no image', async () => {
    const asset = await new AssetsDao(connection.db).insert(newAssetPo({ campaignId: vharnId }));
    const phases = moon().phases.map((phase, i) =>
      i === 0 ? { ...phase, imageAssetId: asset.id } : phase,
    );
    const saved = await cycles.insertCycle(vharnId, moon({ phases }));

    await connection.db.delete(assets).where(eq(assets.id, asset.id));

    const [first] = (await cycles.findInCampaign(vharnId, saved.cycle.id))?.phases ?? [];
    expect(first?.imageAssetId).toBeNull();
  });

  it('two holders at once are refused by the CHECK', async () => {
    const lyra = await characterOf(vharnId, 'Lyra');
    const kraken = await tokenIn('Kraken');
    const both = moon({ holderCharacterId: lyra, holderTokenId: kraken });

    expect(await errorCodeOf(cycles.insertCycle(vharnId, both))).toBe(CHECK_VIOLATION);
  });

  it('a member who chooses without seeing is refused by the CHECK', async () => {
    const blind = moon({ members: [{ userId: lyraUserId, canSee: false, canChoose: true }] });

    expect(await errorCodeOf(cycles.insertCycle(vharnId, blind))).toBe(CHECK_VIOLATION);
  });

  it('the players of the table are read, and nobody of another table', async () => {
    const members = new CampaignMembersDao(connection.db);
    await members.insert({ campaignId: vharnId, userId: ownerId, role: 'master' });
    await members.insert({ campaignId: vharnId, userId: lyraUserId, role: 'player' });

    expect(await cycles.playerIdsOf(vharnId)).toEqual([lyraUserId]);
    expect(await cycles.playerIdsOf(quelmId)).toEqual([]);
  });

  it('a loose token of the table holds; a linked one or one of another table does not', async () => {
    const kraken = await tokenIn('Kraken');

    expect(await cycles.looseTokenInCampaign(vharnId, kraken)).toBe(true);
    expect(await cycles.looseTokenInCampaign(quelmId, kraken)).toBe(false);
    const lyra = await characterOf(vharnId, 'Lyra');
    await connection.db
      .update(tokensTable)
      .set({ characterId: lyra })
      .where(eq(tokensTable.id, kraken));
    expect(await cycles.looseTokenInCampaign(vharnId, kraken)).toBe(false);
  });

  describe('in a combat', () => {
    it('started cycles are read with the grid and round of their combat', async () => {
      const saved = await cycles.insertCycle(vharnId, moon());
      const combat = await combatId();
      const nova = saved.phases[0]?.id ?? null;

      await cycles.startCycles(combat, [{ cycleId: saved.cycle.id, currentPhaseId: nova }]);

      expect(await cycles.combatStatesOfCampaign(vharnId)).toEqual([
        {
          combatId: combat,
          cycleId: saved.cycle.id,
          sceneId,
          round: 1,
          currentPhaseId: nova,
          chosenPhaseId: null,
        },
      ]);
      expect(await cycles.combatStatesOfCampaign(quelmId)).toEqual([]);
    });

    it('a choice is kept, and the turn writes each current phase and clears the choices', async () => {
      const saved = await cycles.insertCycle(vharnId, moon());
      const combat = await combatId();
      const [nova, crescente, cheia] = saved.phases.map(({ id }) => id);
      await cycles.startCycles(combat, [{ cycleId: saved.cycle.id, currentPhaseId: nova ?? null }]);

      expect(await cycles.setChosen(combat, saved.cycle.id, cheia ?? null)).toBe(true);
      expect((await cycles.combatStatesOfCampaign(vharnId))[0]?.chosenPhaseId).toBe(cheia);

      await cycles.turnAll(combat, [
        { cycleId: saved.cycle.id, currentPhaseId: crescente ?? null },
      ]);

      const [state] = await cycles.combatStatesOfCampaign(vharnId);
      expect([state?.currentPhaseId, state?.chosenPhaseId]).toEqual([crescente, null]);
    });

    it('a choice for a cycle not in the combat changes nothing', async () => {
      const saved = await cycles.insertCycle(vharnId, moon());
      const combat = await combatId();

      expect(await cycles.setChosen(combat, saved.cycle.id, null)).toBe(false);
    });

    it('deleting the current phase leaves the combat state on no phase', async () => {
      const saved = await cycles.insertCycle(vharnId, moon());
      const combat = await combatId();
      const [nova, ...rest] = saved.phases;
      await cycles.startCycles(combat, [
        { cycleId: saved.cycle.id, currentPhaseId: nova?.id ?? null },
      ]);

      await cycles.replaceCycle(vharnId, saved.cycle.id, {
        ...moon(),
        phases: rest.map(({ id, name }) => ({
          id,
          name,
          icon: 'game-icons:cycle',
          imageAssetId: null,
        })),
      });

      expect((await cycles.combatStatesOfCampaign(vharnId))[0]?.currentPhaseId).toBeNull();
    });

    it('removing cycles from a combat takes only those out', async () => {
      const moonCycle = await cycles.insertCycle(vharnId, moon());
      const tide = await cycles.insertCycle(vharnId, moon({ name: 'Maré' }));
      const combat = await combatId();
      await cycles.startCycles(combat, [
        { cycleId: moonCycle.cycle.id, currentPhaseId: null },
        { cycleId: tide.cycle.id, currentPhaseId: null },
      ]);

      await cycles.removeCycles(combat, [tide.cycle.id]);

      const left = await cycles.combatStatesOfCampaign(vharnId);
      expect(left.map(({ cycleId }) => cycleId)).toEqual([moonCycle.cycle.id]);
    });
  });
});
