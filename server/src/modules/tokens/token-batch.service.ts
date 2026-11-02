import { cutsOf, veilOf, type TokenVeil } from './token-veil.mapper';
import { combatVeilOf, publishVeiledLights, veiledWriteOf } from './token-veil';
import { creationCutsOf } from './token-hidden.mapper';
import { deletedSeenBy } from '../combat/combat-veil.mapper';
import type {
  AddPlayersCommandDto,
  CreateTokensCommandDto,
  DeleteTokensCommandDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { gridEventBase, inLockedGrid, type CreatedInScene } from '../scenes/locked-scene';
import type { CharacterRow } from '../characters/characters.dao';
import {
  inLockedCharactersAndGrid,
  type CharactersAndGridChange,
  type LockedGridMaybeCharacters,
} from '../characters/locked-characters-grid';
import type { CombatDto } from '@lorkarium/contracts';
import type { Cell, TokenBox } from '@lorkarium/game-core';
import { orderedMembers } from '../campaigns/campaigns.mapper';
import { placeCharacters } from './character-placement.bo';
import { identityOf } from './linked-token';
import type { NewTokenRow, TokenRow } from './tokens.dao';
import type { ScenePo } from '../scenes/scenes.po';
import { TokenRulesBo } from './token-rules.bo';
import {
  audiencesOf,
  authorshipOf,
  combatOf,
  joinPastedToCombat,
  newTokenRowOf,
  requireAssetsOf,
  leaveCombat,
  tokensIn,
  withConditions,
  type TokenRightsReader,
  type TokenTransactionRunner,
  type TokenWithConditions,
  type TokenWriteDaos,
} from './token-transaction';
import { lookAssetIdsOf } from './token-aura.mapper';
import { toAuthoredToken } from './tokens.mapper';

type Envelope = 'actionId' | 'campaignId';
export type CreateTokens = Omit<CreateTokensCommandDto, Envelope>;
export type DeleteTokens = Omit<DeleteTokensCommandDto, Envelope>;
export type AddPlayers = Omit<AddPlayersCommandDto, Envelope>;

/** What "Adicionar jogadores" answers: the version, the tokens made (in the order of the players)
 *  and the players skipped because they have no character (every player gets one on becoming a
 *  player, so it is usually empty). */
export type PlayersAdded = Readonly<{
  version: number;
  createdIds: string[];
  skippedMemberIds: string[];
}>;

export type TokenBatchServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership' | 'listMembers'>;
  transaction: TokenTransactionRunner;
  publisher: BoardPublisherPort;
  clock: ClockPort;
  /** `BAR_VALUE_LIMIT`, handed to the rule. */
  barLimit: number;
  /** `TOKENS_PER_SCENE_MAX`, handed to the rule. */
  tokenLimit: number;
  /** The table settings a player's paste and batch delete read (the master's never do). */
  tokenRights: TokenRightsReader;
}>;

/** The token batches of a paste and of its undo (the master, or a player by the table settings,
 *  on their own tokens), on the grid the command names:
 *  all or nothing in one version,
 *  published once after the commit.
 *
 *  Example: `const version = await tokenBatch.createMany(user.id, campaignId, { tokens })` */
export class TokenBatchService {
  constructor(private readonly deps: TokenBatchServiceDeps) {}

  /** Creates 1 to 64 tokens; one outside the scene or with a stranger as controller refuses all.
   *  A copy whose original is in the combat joins that entry, in the same version. */
  async createMany(
    userId: string,
    campaignId: string,
    command: CreateTokens,
  ): Promise<CreatedInScene> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const copies = await this.copiesOf(access, command.tokens);
    const members = await this.deps.members.listMembers(campaignId);
    const memberIds = members.map((member) => member.userId);
    const address = { campaignId, sceneId: command.sceneId, access };
    const saved = await inLockedGrid(this.deps.transaction, address, async ({ daos, scene }) => {
      const rules = this.rulesFor(scene, memberIds);
      const rows = copies.map((token) => newTokenRowOf(scene.id, rules, token, userId));
      rules.admit(await daos.tokens.countOfScene(scene.id), rows.length);
      await requireAssetsOf(daos, campaignId, copies.flatMap(lookAssetIdsOf));
      const created = await daos.tokens.insertMany(rows);
      const pasted = created.map(({ token }, index) => ({
        tokenId: token.id,
        combatantId: copies[index]?.combatantId,
      }));
      await joinPastedToCombat(daos, scene, access, pasted);
      // A token just created carries no condition: nothing to read back for it.
      const withAll: TokenWithConditions[] = created.map((row) => ({ row, conditions: [] }));
      const combat = await combatOf(daos, scene);
      const veil = await combatVeilOf(daos, scene.id, created, combat);
      const { lights } = await veiledWriteOf(daos, scene.id, created);
      return { tokens: withAll, combat, veil, lights };
    });
    const { sceneId, version } = saved;
    const { combat, veil, lights } = saved.value;
    const at = this.now();
    const tokens = saved.value.tokens.map(audiencesOf);
    const creation = { campaignId, sceneId, version, at, tokens, combat };
    this.deps.publisher.tokensCreated(creation, creationCutsOf(creation, veil));
    publishVeiledLights(this.deps.publisher, { campaignId, sceneId, at }, lights);
    const createdIds = saved.value.tokens.map(({ row }) => row.token.id);
    return { version: saved.version, createdIds };
  }

  /** Deletes 1 to 64 tokens; `expect` (undoing a paste) must still match where each one is, and
   *  the turn passes past every deleted combatant in the same transaction. */
  async deleteMany(userId: string, campaignId: string, command: DeleteTokens): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const authorship = await authorshipOf(this.deps.tokenRights, access);
    const { tokenIds } = command;
    const address = { campaignId, sceneId: command.sceneId, access };
    const saved = await inLockedGrid(this.deps.transaction, address, async ({ daos, scene }) => {
      const rows = await tokensIn(daos, scene, campaignId, tokenIds);
      authorship.requireDelete(rows.map(toAuthoredToken));
      const rules = this.rulesFor(scene, []);
      for (const { token } of rows) {
        const expected = command.expect?.find(({ tokenId }) => tokenId === token.id);
        rules.requireAt(token.id, expected, token);
      }
      await leaveCombat(daos, scene, access, tokenIds);
      await daos.tokens.deleteMany(scene.id, tokenIds);
      const combat = await combatOf(daos, scene);
      const veil = await combatVeilOf(daos, scene.id, rows, combat);
      const { lights } = await veiledWriteOf(daos, scene.id, rows);
      return { combat, veil, lights };
    });
    const { sceneId, version } = saved;
    const { combat, veil, lights } = saved.value;
    const at = this.now();
    const event = { campaignId, sceneId, version, at, tokenIds: [...tokenIds], combat };
    this.deps.publisher.tokensDeleted(event, cutsOf(event, veil, deletedSeenBy));
    publishVeiledLights(this.deps.publisher, { campaignId, sceneId, at }, lights);
    return saved.version;
  }

  /** Puts in the grid a token linked to the character of each player who is not there yet, in
   *  the free cells around `center`: the character's size, the Tokens layer, facing right,
   *  without sight nor light. The characters are locked before the grid and read, never changed.
   *  One `token:createdMany` (each audience its own); nobody to place answers zero created and
   *  bumps nothing. A grid without room is NO_FREE_CELLS. */
  async addPlayers(userId: string, campaignId: string, command: AddPlayers): Promise<PlayersAdded> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.requireMaster('add the players to a grid');
    const players = orderedMembers(await this.deps.members.listMembers(campaignId))
      .filter(({ role }) => role === 'player')
      .map(({ userId: playerId }) => playerId);
    const address = { campaignId, sceneId: command.sceneId, access };
    const saved = await inLockedCharactersAndGrid(this.deps.transaction, address, (locked) =>
      this.placePlayers(locked, players, command.center),
    );
    const { tokens, skippedMemberIds, combat, veil } = saved.value;
    if (saved.grid) {
      const base = gridEventBase(campaignId, saved.grid, this.deps.clock);
      const creation = { ...base, tokens: tokens.map(audiencesOf), combat };
      this.deps.publisher.tokensCreated(creation, creationCutsOf(creation, veil));
    }
    const createdIds = tokens.map(({ row }) => row.token.id);
    return { version: saved.version, createdIds, skippedMemberIds };
  }

  private async placePlayers(
    { daos, scene }: LockedGridMaybeCharacters<TokenWriteDaos>,
    players: readonly string[],
    center: AddPlayers['center'],
  ): Promise<CharactersAndGridChange<AddedPlayers>> {
    const { worn, skippedMemberIds } = playersCharactersOf(
      players,
      await daos.characters.listOfCampaign(scene.campaignId),
    );
    const onGrid = await daos.tokens.listOfScene(scene.id);
    const placed = new Set(onGrid.map(({ token }) => token.characterId));
    const missing = worn.filter(({ character }) => !placed.has(character.id));
    if (missing.length === 0) {
      const value = { tokens: [], skippedMemberIds, combat: null, veil: veilOf([]) };
      return { value, grid: false, characters: false };
    }
    const rows = await this.linkedRowsOf(daos, scene, missing, center, onGrid);
    const created = await daos.tokens.insertMany(rows);
    const ids = created.map(({ token }) => token.id);
    const composed = await tokensIn(daos, scene, scene.campaignId, ids);
    const tokens = await Promise.all(composed.map((row) => withConditions(daos, row)));
    const combat = await combatOf(daos, scene);
    const veil = await combatVeilOf(daos, scene.id, composed, combat);
    return { value: { tokens, skippedMemberIds, combat, veil }, grid: true, characters: false };
  }

  private async linkedRowsOf(
    daos: TokenWriteDaos,
    scene: ScenePo,
    characters: readonly CharacterRow[],
    center: AddPlayers['center'],
    onGrid: readonly TokenRow[],
  ): Promise<NewTokenRow[]> {
    const occupied = onGrid.filter(({ token }) => token.layer === 'tokens').map(boxOf);
    const footprints = characters.map(({ character }) => character);
    const cells = placeCharacters({ sceneId: scene.id, scene, center, footprints, occupied });
    this.rulesFor(scene, []).admit(await daos.tokens.countOfScene(scene.id), characters.length);
    return characters.map((character, index) => linkedRowOf(scene.id, character, cells[index]));
  }

  // A player's copies land like their new token, with them in the control; each is a create.
  private async copiesOf(
    access: CampaignAccessBo,
    tokens: CreateTokens['tokens'],
  ): Promise<CreateTokens['tokens']> {
    const authorship = await authorshipOf(this.deps.tokenRights, access);
    return tokens.map((token) => {
      const copy = authorship.copyOf(token);
      authorship.requireCreate(copy);
      return { ...copy, controllerIds: authorship.newControllersOf(copy.controllerIds) };
    });
  }

  private rulesFor(scene: ScenePo, memberIds: readonly string[]): TokenRulesBo {
    const sceneSize = { widthCells: scene.widthCells, heightCells: scene.heightCells };
    const { barLimit, tokenLimit } = this.deps;
    return new TokenRulesBo({ scene: sceneSize, memberIds, barLimit, tokenLimit });
  }

  private now(): string {
    return this.deps.clock.now().toISOString();
  }
}

type AddedPlayers = Readonly<{
  tokens: TokenWithConditions[];
  skippedMemberIds: string[];
  combat: CombatDto | null;
  veil: TokenVeil;
}>;

function boxOf({ token }: TokenRow): TokenBox {
  return { col: token.col, row: token.row, width: token.width, height: token.height };
}

// A token of the character: its identity and size, facing right, without sight nor light.
function linkedRowOf(sceneId: string, worn: CharacterRow, at: Cell | undefined): NewTokenRow {
  const { character } = worn;
  if (!at) throw new Error(`no cell was placed for character ${character.id}`);
  const { width, height } = character;
  const placed = { col: at.col, row: at.row, width, height, layer: 'tokens' as const, facing: 0 };
  const token = { sceneId, ...identityOf(character), ...placed, characterId: character.id };
  return { token, bars: [], controllerIds: [] };
}

/** The players' characters in the order of the players, and the players without one. */
type PlayersCharacters = Readonly<{ worn: CharacterRow[]; skippedMemberIds: string[] }>;

function playersCharactersOf(
  players: readonly string[],
  characters: readonly CharacterRow[],
): PlayersCharacters {
  const byUser = new Map(characters.map((row) => [row.character.userId, row]));
  const worn = players.flatMap((playerId) => byUser.get(playerId) ?? []);
  const skippedMemberIds = players.filter((playerId) => !byUser.has(playerId));
  return { worn, skippedMemberIds };
}
