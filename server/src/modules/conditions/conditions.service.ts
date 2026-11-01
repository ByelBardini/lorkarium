import {
  cutsOf,
  entriesSeenBy,
  tokenSeenBy,
  veilOf,
  type TokenVeil,
} from '../tokens/token-veil.mapper';
import type {
  ApplyConditionCommandDto,
  ApplyConditionsCommandDto,
  ConditionsAppliedDto,
  DefineConditionCommandDto,
  RemoveConditionCommandDto,
  SetConditionRoundsCommandDto,
  SetConditionStacksCommandDto,
} from '@lorkarium/contracts';
import type { AssetsDao } from '../assets/assets.dao';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { toCampaignAccessBo } from '../campaigns/campaigns.mapper';
import type { CharacterPublisherPort } from '../characters/character-publisher.port';
import type { CharacterRow, CharactersDao } from '../characters/characters.dao';
import {
  inLockedGridWithCharacters,
  requireCharactersLock,
  type CharactersAndGridChange,
  type LockedGridMaybeCharacters,
  type SavedInCharactersAndGrid,
} from '../characters/locked-characters-grid';
import type { BoardPublisherPort, GridEvent } from '../scenes/board-publisher.port';
import { charactersEventBase, inLockedCharacters } from '../characters/locked-characters';
import { gridEventBase, type SavedVersion } from '../scenes/locked-scene';
import type { ScenesDao } from '../scenes/scenes.dao';
import type { ScenePo } from '../scenes/scenes.po';
import { publishCharactersChange } from '../tokens/character-writes';
import { charactersIn } from '../tokens/linked-token';
import type { TokenRow, TokensDao } from '../tokens/tokens.dao';
import { TokenNotFoundError } from '../tokens/tokens.error';
import { requireAssetsOf } from '../tokens/token-transaction';
import { ConditionRulesBo } from './condition-rules.bo';
import type { CombatDao } from '../combat/combat.dao';
import type { ActiveConditionRow, ConditionDuration, ConditionsDao } from './conditions.dao';
import { ConditionNotFoundError } from './conditions.error';
import { holderIdOf, type ConditionDefinitionPo, type ConditionHolder } from './conditions.po';
import {
  holderOfToken,
  toActiveConditionDto,
  toConditionDefinitionDto,
  toNewConditionDefinition,
  toTokenConditionDto,
} from './conditions.mapper';

type Envelope = 'actionId' | 'campaignId';
export type DefineCondition = Omit<DefineConditionCommandDto, Envelope>;
export type ApplyCondition = Omit<ApplyConditionCommandDto, Envelope>;
export type ApplyConditions = Omit<ApplyConditionsCommandDto, Envelope>;
export type RemoveCondition = Omit<RemoveConditionCommandDto, Envelope>;
export type SetConditionRounds = Omit<SetConditionRoundsCommandDto, Envelope>;
export type SetConditionStacks = Omit<SetConditionStacksCommandDto, Envelope>;

/** The DAOs a transaction hands out, bound to the open `tx`. */
export type ConditionWriteDaos = Readonly<{
  scenes: Pick<ScenesDao, 'lockInCampaign' | 'bumpVersion'>;
  tokens: Pick<TokensDao, 'findInScene' | 'findManyInScene'>;
  combat: Pick<CombatDao, 'findOfScene'>;
  conditions: Pick<
    ConditionsDao,
    | 'findDefinitionByName'
    | 'insertDefinition'
    | 'insertDefinitions'
    | 'listDefinitions'
    | 'updateDefinition'
    | 'deleteDefinition'
    | 'findDefinitionInCampaign'
    | 'apply'
    | 'remove'
    | 'setRounds'
    | 'stacksOf'
    | 'findActiveOf'
    | 'setStacks'
    | 'capStacks'
  >;
  /** A definition's image must be an asset of the table. */
  assets: Pick<AssetsDao, 'findManyInCampaign'>;
  /** A linked token's conditions live on its character: its lock, version and reread. */
  characters: Pick<CharactersDao, 'lockVersion' | 'bumpVersion' | 'findManyInCampaign'>;
}>;

export type ConditionTransactionRunner = <T>(
  work: (daos: ConditionWriteDaos) => Promise<T>,
) => Promise<T>;

export type ConditionsServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: ConditionTransactionRunner;
  publisher: BoardPublisherPort;
  /** Where a condition on a linked token is told: its character, whole, to the table. */
  characterPublisher: CharacterPublisherPort;
  clock: ClockPort;
}>;

type Locked = LockedGridMaybeCharacters<ConditionWriteDaos>;

/** Where one command on one token landed: the token of the grid (its event, under its veil), or
 *  the character it wears (`character`, reread after the write, goes out whole). */
type Landed<T> = Readonly<{
  saved: T;
  tokenId: string;
  veil: TokenVeil;
  character: CharacterRow | null;
}>;

type AppliedMany = Readonly<{
  grid: ActiveConditionRow[];
  characters: CharacterRow[];
  veil: TokenVeil;
}>;

const RULES = new ConditionRulesBo();

/** The conditions of a table: the master adds to the list; any member who acts (master or
 *  player, never the spectator) applies, adjusts and removes them on any token of the grid the
 *  command names — a condition is a marker everyone sees, the table corrects itself (spec §3.7).
 *  On a linked token the condition lives on its character (every grid shows it), in the
 *  characters' version. Persisted, version bumped, then published (the list itself, on the table
 *  stream, to every member). Editing and deleting the list is `ConditionCatalogService`'s.
 *
 *  Example: `await conditionsService.apply(user.id, campaignId, { tokenId, conditionId, rounds: 2 })` */
export class ConditionsService {
  constructor(private readonly deps: ConditionsServiceDeps) {}

  async define(userId: string, campaignId: string, command: DefineCondition): Promise<number> {
    const access = await this.accessOf(userId, campaignId);
    access.requireMaster('define a condition');
    // The list is the table's: it rides the table stream whatever grid the command names.
    const outcome = await inLockedCharacters(
      this.deps.transaction,
      campaignId,
      async ({ daos }) => {
        await requireAssetsOf(daos, campaignId, [command.imageAssetId]);
        const existing = await daos.conditions.findDefinitionByName(campaignId, command.name);
        if (RULES.defineOrReuse(existing).kind === 'reuse') return { value: null, changed: false };
        const fields = toNewConditionDefinition(command);
        const created = await daos.conditions.insertDefinition(campaignId, fields);
        return { value: created, changed: true };
      },
    );
    if (!outcome.value) return outcome.version;
    const definition = toConditionDefinitionDto(outcome.value);
    const base = charactersEventBase(campaignId, outcome.version, this.deps.clock);
    this.deps.publisher.conditionDefined({ ...base, definition });
    return outcome.version;
  }

  /** On a linked token the condition lands on its character: `character:changed`, every grid.
   *  Applying a stacking condition the holder already has adds a stack and renews the duration. */
  async apply(userId: string, campaignId: string, command: ApplyCondition): Promise<number> {
    const access = await this.accessOf(userId, campaignId);
    const saved = await this.onHolderOf(access, command, async ({ daos, scene }, holder) => {
      const known = await knownDefinition(daos, campaignId, command.conditionId);
      const duration = await durationIn(daos, scene, command.rounds);
      const [applied] = await applyTo(daos, [holder], known, duration);
      if (!applied) throw new Error(`apply of ${known.id} on ${holderIdOf(holder)} saved nothing`);
      return applied;
    });
    this.publishOne(campaignId, saved);
    return saved.version;
  }

  /** All or nothing: one token missing from the grid refuses the whole group. A group mixing
   *  linked and unlinked tokens goes out as one `character:changed` (the characters' version)
   *  and one `condition:appliedMany` of the grid (its version). */
  async applyMany(userId: string, campaignId: string, command: ApplyConditions): Promise<number> {
    const access = await this.accessOf(userId, campaignId);
    const saved = await this.inGrid(access, command.sceneId, async (locked) => {
      const { daos, scene } = locked;
      const tokens = await tokensInScene(daos, scene, command.tokenIds);
      const known = await knownDefinition(daos, campaignId, command.conditionId);
      const duration = await durationIn(daos, scene, command.rounds);
      const holders = uniqueHolders(tokens.map((row) => holderIn(locked, row)));
      const applied = await applyTo(daos, holders, known, duration);
      const grid = applied.filter(({ tokenId }) => tokenId !== null);
      const characters = await charactersIn(daos, campaignId, characterIdsOf(holders));
      const veil = veilOf(tokens.filter(({ token }) => token.characterId === null));
      const value = { grid, characters, veil };
      return { value, grid: grid.length > 0, characters: characters.length > 0 };
    });
    this.publishMany(campaignId, saved);
    return saved.version;
  }

  async remove(userId: string, campaignId: string, command: RemoveCondition): Promise<number> {
    const access = await this.accessOf(userId, campaignId);
    const { activeConditionId } = command;
    const saved = await this.onHolderOf(access, command, async ({ daos }, holder) => {
      const removed = await daos.conditions.remove(holder, activeConditionId);
      if (!removed) throw new ConditionNotFoundError(campaignId, activeConditionId);
    });
    const { tokenId, veil, character } = saved.value;
    if (character) return this.publishCharacter(campaignId, saved, character);
    if (!saved.grid) throw new Error(`condition:remove on ${tokenId} touched neither holder`);
    const event = { ...gridEventBase(campaignId, saved.grid, this.deps.clock), tokenId };
    const removed = { ...event, activeConditionId };
    this.deps.publisher.conditionRemoved(removed, cutsOf(removed, veil, tokenSeenBy));
    return saved.version;
  }

  /** Only the rounds left change: re-applying would stamp the current round and make the
   *  condition last one round longer. */
  async setRounds(
    userId: string,
    campaignId: string,
    command: SetConditionRounds,
  ): Promise<number> {
    const access = await this.accessOf(userId, campaignId);
    const { activeConditionId } = command;
    const saved = await this.onHolderOf(access, command, async ({ daos }, holder) => {
      const rounds = RULES.durationOf(command.rounds);
      const changed = await daos.conditions.setRounds(holder, activeConditionId, rounds);
      if (!changed) throw new ConditionNotFoundError(campaignId, activeConditionId);
      return changed;
    });
    this.publishOne(campaignId, saved);
    return saved.version;
  }

  /** Only the stacks change (rounds and applied round stay), within the definition's
   *  `maxStacks`: above it → INVALID_STACKS. Same who as `setRounds`.
   *
   *  Example: `await conditionsService.setStacks(user.id, campaignId, { tokenId, activeConditionId, stacks: 2 })` */
  async setStacks(
    userId: string,
    campaignId: string,
    command: SetConditionStacks,
  ): Promise<number> {
    const access = await this.accessOf(userId, campaignId);
    const saved = await this.onHolderOf(access, command, ({ daos }, holder) =>
      stacksSetOn(daos, campaignId, holder, command),
    );
    this.publishOne(campaignId, saved);
    return saved.version;
  }

  private async accessOf(userId: string, campaignId: string): Promise<CampaignAccessBo> {
    const membership = await this.deps.members.findMembership(campaignId, userId);
    const access = toCampaignAccessBo(campaignId, userId, membership);
    access.requireMember();
    return access;
  }

  private inGrid<T>(
    access: CampaignAccessBo,
    sceneId: string | undefined,
    work: (locked: Locked) => Promise<CharactersAndGridChange<T>>,
  ): Promise<SavedInCharactersAndGrid<T>> {
    const address = { campaignId: access.campaignIdOf(), sceneId, access };
    return inLockedGridWithCharacters(this.deps.transaction, address, work);
  }

  // A command on one token touches one part: the grid, or the character a linked token wears.
  private onHolderOf<T>(
    access: CampaignAccessBo,
    command: Readonly<{ sceneId?: string; tokenId: string }>,
    write: (locked: Locked, holder: ConditionHolder) => Promise<T>,
  ): Promise<SavedInCharactersAndGrid<Landed<T>>> {
    return this.inGrid(access, command.sceneId, async (locked) => {
      const token = await tokenInScene(locked.daos, locked.scene, command.tokenId);
      const holder = holderIn(locked, token);
      const saved = await write(locked, holder);
      const tokenId = token.token.id;
      if ('tokenId' in holder) {
        const value = { saved, tokenId, veil: veilOf([token]), character: null };
        return { value, grid: true, characters: false };
      }
      const campaignId = locked.scene.campaignId;
      const [character] = await charactersIn(locked.daos, campaignId, [holder.characterId]);
      const value = { saved, tokenId, veil: NO_HIDDEN, character: character ?? null };
      return { value, grid: false, characters: true };
    });
  }

  private publishOne(
    campaignId: string,
    saved: SavedInCharactersAndGrid<Landed<ActiveConditionRow>>,
  ): void {
    const { tokenId, saved: row, veil, character } = saved.value;
    if (character) {
      this.publishCharacter(campaignId, saved, character);
      return;
    }
    if (!saved.grid) throw new Error(`a condition command on ${tokenId} touched neither holder`);
    const base = gridEventBase(campaignId, saved.grid, this.deps.clock);
    const event = { ...base, tokenId, condition: toActiveConditionDto(row) };
    this.deps.publisher.conditionApplied(event, cutsOf(event, veil, tokenSeenBy));
  }

  private publishCharacter(
    campaignId: string,
    saved: SavedInCharactersAndGrid<unknown>,
    character: CharacterRow,
  ): number {
    publishCharactersChange(this.outlet(), campaignId, saved.characters, [character]);
    return saved.version;
  }

  private publishMany(campaignId: string, saved: SavedInCharactersAndGrid<AppliedMany>): void {
    const { grid, characters, veil } = saved.value;
    publishCharactersChange(this.outlet(), campaignId, saved.characters, characters);
    this.publishApplied(campaignId, saved.grid, grid, veil);
  }

  private publishApplied(
    campaignId: string,
    saved: SavedVersion | null,
    applied: readonly ActiveConditionRow[],
    veil: TokenVeil,
  ): void {
    if (!saved || applied.length === 0) return;
    const base = gridEventBase(campaignId, saved, this.deps.clock);
    const event = { ...base, applied: applied.map(toTokenConditionDto) };
    this.deps.publisher.conditionsApplied(event, cutsOf(event, veil, APPLIED_SEEN_BY));
  }

  private outlet(): Readonly<{ publisher: CharacterPublisherPort; clock: ClockPort }> {
    return { publisher: this.deps.characterPublisher, clock: this.deps.clock };
  }
}

// The holder of a token's conditions; a linked one needs the characters locked (the run starts
// again with them otherwise, see `requireCharactersLock`).
function holderIn(locked: Locked, row: TokenRow): ConditionHolder {
  const holder = holderOfToken(row.token);
  if ('characterId' in holder) requireCharactersLock(locked);
  return holder;
}

function characterIdsOf(holders: readonly ConditionHolder[]): string[] {
  return holders.flatMap((holder) => ('characterId' in holder ? [holder.characterId] : []));
}

function uniqueHolders(holders: readonly ConditionHolder[]): ConditionHolder[] {
  const byId = new Map(holders.map((holder) => [holderIdOf(holder), holder]));
  return [...byId.values()];
}

// Stamped with the combat round so the end of the holder's turn in this round does not count it.
async function durationIn(
  daos: ConditionWriteDaos,
  scene: ScenePo,
  rounds: number,
): Promise<ConditionDuration> {
  const combat = await daos.combat.findOfScene(scene.id);
  return { remainingRounds: RULES.durationOf(rounds), appliedRound: combat?.combat.round ?? null };
}

async function knownDefinition(
  daos: ConditionWriteDaos,
  campaignId: string,
  conditionId: string,
): Promise<ConditionDefinitionPo> {
  const known = await daos.conditions.findDefinitionInCampaign(campaignId, conditionId);
  if (!known) throw new ConditionNotFoundError(campaignId, conditionId);
  return known;
}

// One read for every holder: each lands one stack above what it had, up to the cap.
async function applyTo(
  daos: ConditionWriteDaos,
  holders: readonly ConditionHolder[],
  known: ConditionDefinitionPo,
  duration: ConditionDuration,
): Promise<ActiveConditionRow[]> {
  const current = await daos.conditions.stacksOf(holders, known.id);
  const applied: ActiveConditionRow[] = [];
  for (const holder of holders) {
    const had = current.get(holderIdOf(holder)) ?? null;
    const stacks = RULES.stacksAfterApply(had, known.maxStacks);
    applied.push(await daos.conditions.apply(holder, known.id, duration, stacks));
  }
  return applied;
}

async function stacksSetOn(
  daos: ConditionWriteDaos,
  campaignId: string,
  holder: ConditionHolder,
  command: SetConditionStacks,
): Promise<ActiveConditionRow> {
  const { activeConditionId, stacks } = command;
  const active = await daos.conditions.findActiveOf(holder, activeConditionId);
  if (!active) throw new ConditionNotFoundError(campaignId, activeConditionId);
  RULES.requireStacksWithin(active, stacks);
  const changed = await daos.conditions.setStacks(holder, activeConditionId, stacks);
  if (!changed) throw new ConditionNotFoundError(campaignId, activeConditionId);
  return changed;
}

async function tokensInScene(
  daos: ConditionWriteDaos,
  scene: ScenePo,
  tokenIds: readonly string[],
): Promise<TokenRow[]> {
  const found = await daos.tokens.findManyInScene(scene.id, tokenIds);
  const byId = new Map(found.map((row) => [row.token.id, row]));
  return tokenIds.map((tokenId) => {
    const row = byId.get(tokenId);
    if (!row) throw new TokenNotFoundError(scene.campaignId, tokenId);
    return row;
  });
}

async function tokenInScene(
  daos: ConditionWriteDaos,
  scene: ScenePo,
  tokenId: string,
): Promise<TokenRow> {
  const token = await daos.tokens.findInScene(scene.id, tokenId);
  if (!token) throw new TokenNotFoundError(scene.campaignId, tokenId);
  return token;
}

// A character's condition goes out with the character, out of any token's veil.
const NO_HIDDEN: TokenVeil = { tokens: [] };
const APPLIED_SEEN_BY = entriesSeenBy<GridEvent<ConditionsAppliedDto>>('applied');
