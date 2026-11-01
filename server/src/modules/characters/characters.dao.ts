import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { campaignMembers, type CampaignMemberPo } from '../campaigns/campaign-members.po';
import { campaigns } from '../campaigns/campaigns.po';
import { ConditionsDao, type ActiveConditionRow } from '../conditions/conditions.dao';
import { scenes } from '../scenes/scenes.po';
import type { BarValuesPo } from '../tokens/tokens.po';
import {
  characterBars,
  characterControllers,
  characters,
  type CharacterBarInputPo,
  type CharacterBarPo,
  type CharacterChangesPo,
  type CharacterLookChangesPo,
  type CharacterPo,
  type NewCharacterPo,
} from './characters.po';

/** What a linked token wears of its character: the character, its bars by position, who
 *  controls it, and the role its player has at the table now (`null` = nobody's, or its player
 *  left). */
export type WornCharacterRow = Readonly<{
  character: CharacterPo;
  bars: readonly CharacterBarPo[];
  controllerIds: readonly string[];
  holderRole: CampaignMemberPo['role'] | null;
}>;

/** A character whole: what its tokens wear and its active conditions (every `character:changed`
 *  carries them). */
export type CharacterRow = WornCharacterRow &
  Readonly<{ conditions: readonly ActiveConditionRow[] }>;

/** A character to insert: its bars in order (their position) and its controllers. */
export type NewCharacterRow = Readonly<{
  character: NewCharacterPo;
  bars: readonly CharacterBarInputPo[];
  controllerIds: readonly string[];
}>;

// The membership of the character's player, if they are still at its table.
const holderMembership = and(
  eq(campaignMembers.campaignId, characters.campaignId),
  eq(campaignMembers.userId, characters.userId),
);

// Spelled out with the table names: the subquery reads the outer row of `characters`.
const CONTROLLER_IDS = sql<string[]>`coalesce((${sql.raw(
  `select array_agg(c.user_id::text order by c.user_id) from character_controllers AS c where c.character_id = "characters"."id"`,
)}), '{}')`;

/** The characters of a table. Every read filters by the campaign (§2.6); writes spanning tables
 *  (insert, replace) must run on a DAO built with a `tx`.
 *
 *  Example: `await new CharactersDao(tx).findInCampaign(vharnId, lyraId)` */
export class CharactersDao {
  private readonly conditions: ConditionsDao;

  constructor(private readonly db: DatabaseExecutor) {
    this.conditions = new ConditionsDao(db);
  }

  /** Every character of the table, oldest first, the stored ones included. */
  async listOfCampaign(campaignId: string): Promise<CharacterRow[]> {
    return this.rowsWhere(eq(characters.campaignId, campaignId));
  }

  /** The asked characters found at the table (an id of another table is left out), in bulk: the
   *  characters of the tokens linked in one grid.
   *
   *  Example: `await dao.findManyInCampaign(vharnId, [lyraId, bramId])` */
  async findManyInCampaign(
    campaignId: string,
    characterIds: readonly string[],
  ): Promise<CharacterRow[]> {
    if (characterIds.length === 0) return [];
    const asked = inArray(characters.id, [...characterIds]);
    return this.rowsWhere(and(eq(characters.campaignId, campaignId), asked));
  }

  /** The asked characters of the table `sceneId` belongs to (an id of another table is left
   *  out), in bulk: what the tokens of one grid read to wear their characters, without the
   *  campaign at hand (§2.6 by the scene's own table). Without their conditions: a grid reads
   *  those with its tokens' own, in one query.
   *
   *  Example: `await dao.findManyAtSceneTable(estradaId, [lyraId])` */
  async findManyAtSceneTable(
    sceneId: string,
    characterIds: readonly string[],
  ): Promise<WornCharacterRow[]> {
    if (characterIds.length === 0) return [];
    const table = this.db
      .select({ id: scenes.campaignId })
      .from(scenes)
      .where(eq(scenes.id, sceneId));
    const asked = inArray(characters.id, [...characterIds]);
    return this.wornWhere(and(inArray(characters.campaignId, table), asked));
  }

  async findInCampaign(campaignId: string, characterId: string): Promise<CharacterRow | undefined> {
    const [row] = await this.findManyInCampaign(campaignId, [characterId]);
    return row;
  }

  /** The character of a player at a table (one at most), stored ones included. */
  async findOfUser(campaignId: string, userId: string): Promise<CharacterRow | undefined> {
    const ofUser = and(eq(characters.campaignId, campaignId), eq(characters.userId, userId));
    const [row] = await this.rowsWhere(ofUser);
    return row;
  }

  /** Several statements (character, bars, controllers): run it on the `tx` DAO. */
  async insert(row: NewCharacterRow): Promise<CharacterRow> {
    const [saved] = await this.db.insert(characters).values(row.character).returning();
    if (!saved) throw new Error(`insert into characters returned no row for ${row.character.name}`);
    await this.replaceBars(saved.id, row.bars);
    await this.replaceControllers(saved.id, row.controllerIds);
    return this.requireRow(saved);
  }

  /** Writes only the keys in `changes` (a patch: absent stays, `null` clears): the card fields,
   *  or what a linked token writes on it (identity, look, aura). */
  async update(
    characterId: string,
    changes: CharacterChangesPo & CharacterLookChangesPo,
  ): Promise<void> {
    await this.db
      .update(characters)
      .set({ ...changes, updatedAt: sql`now()` })
      .where(eq(characters.id, characterId));
  }

  async setBarValues(barId: string, { current, max }: BarValuesPo): Promise<void> {
    await this.db.update(characterBars).set({ current, max }).where(eq(characterBars.id, barId));
  }

  /** The bars of one character, replaced whole, in the order given (their position). */
  async replaceBars(characterId: string, bars: readonly CharacterBarInputPo[]): Promise<void> {
    await this.db.delete(characterBars).where(eq(characterBars.characterId, characterId));
    if (bars.length === 0) return;
    const rows = bars.map((bar, position) => ({ ...bar, characterId, position }));
    await this.db.insert(characterBars).values(rows);
  }

  /** Who controls one character, replaced whole. */
  async replaceControllers(characterId: string, userIds: readonly string[]): Promise<void> {
    const ofCharacter = eq(characterControllers.characterId, characterId);
    await this.db.delete(characterControllers).where(ofCharacter);
    if (userIds.length === 0) return;
    const rows = [...new Set(userIds)].map((userId) => ({ characterId, userId }));
    await this.db.insert(characterControllers).values(rows);
  }

  /** The sheet the card and the dock open first; `null` = none. The sheet must be the
   *  character's (the composite key keeps it at the table).
   *
   *  Example: `await dao.setMainSheet(lyraId, sheetId)` */
  async setMainSheet(characterId: string, sheetId: string | null): Promise<void> {
    await this.db
      .update(characters)
      .set({ mainSheetId: sheetId, updatedAt: sql`now()` })
      .where(eq(characters.id, characterId));
  }

  /** The player of a character: `null` when they leave the table (it stays, nobody's). */
  async setUser(characterId: string, userId: string | null): Promise<void> {
    await this.db
      .update(characters)
      .set({ userId, updatedAt: sql`now()` })
      .where(eq(characters.id, characterId));
  }

  /** Locks the table's row for the characters' version and reads it; `undefined` = no table.
   *  NO KEY UPDATE, not UPDATE: an insert that only references the table (a token, a drawing)
   *  takes KEY SHARE on it and must not wait for a character command.
   *
   *  Example: `const version = await new CharactersDao(tx).lockVersion(vharnId)` */
  async lockVersion(campaignId: string): Promise<number | undefined> {
    const [row] = await this.db
      .select({ version: campaigns.charactersVersion })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .for('no key update');
    return row?.version;
  }

  /** The characters' version of the table plus one, saved and returned. */
  async bumpVersion(campaignId: string): Promise<number> {
    const [row] = await this.db
      .update(campaigns)
      .set({ charactersVersion: sql`${campaigns.charactersVersion} + 1` })
      .where(eq(campaigns.id, campaignId))
      .returning({ version: campaigns.charactersVersion });
    if (!row) throw new Error(`bump of characters_version found no campaign ${campaignId}`);
    return row.version;
  }

  /** The characters' version of the table, unlocked (a sync); `undefined` = no table. */
  async versionOf(campaignId: string): Promise<number | undefined> {
    const [row] = await this.db
      .select({ version: campaigns.charactersVersion })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));
    return row?.version;
  }

  private async requireRow(saved: CharacterPo): Promise<CharacterRow> {
    const row = await this.findInCampaign(saved.campaignId, saved.id);
    if (!row) throw new Error(`character ${saved.id} vanished right after its insert`);
    return row;
  }

  // Three statements: what `wornWhere` reads, then the conditions of all of them.
  private async rowsWhere(where: SQL | undefined): Promise<CharacterRow[]> {
    const worn = await this.wornWhere(where);
    if (worn.length === 0) return [];
    const ids = worn.map(({ character }) => character.id);
    const conditions = await this.conditions.listOfCharacters(ids);
    return worn.map((row) => ({
      ...row,
      conditions: conditions.filter(({ characterId }) => characterId === row.character.id),
    }));
  }

  // Two statements: the characters with their controllers and holder, then all their bars.
  private async wornWhere(where: SQL | undefined): Promise<WornCharacterRow[]> {
    const found = await this.db
      .select({
        character: characters,
        holderRole: campaignMembers.role,
        controllerIds: CONTROLLER_IDS,
      })
      .from(characters)
      .leftJoin(campaignMembers, holderMembership)
      .where(where)
      .orderBy(asc(characters.createdAt), asc(characters.id));
    if (found.length === 0) return [];
    const bars = await this.barsOf(found.map(({ character }) => character.id));
    return found.map(({ character, holderRole, controllerIds }) => ({
      character,
      bars: bars.filter((bar) => bar.characterId === character.id),
      controllerIds,
      holderRole,
    }));
  }

  private async barsOf(characterIds: readonly string[]): Promise<CharacterBarPo[]> {
    return this.db
      .select()
      .from(characterBars)
      .where(inArray(characterBars.characterId, [...characterIds]))
      .orderBy(asc(characterBars.position));
  }
}
