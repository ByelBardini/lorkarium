import type {
  ApplyConditionCommandDto,
  ApplyConditionsCommandDto,
  DefineConditionCommandDto,
  RemoveConditionCommandDto,
  SetConditionRoundsCommandDto,
  SetConditionStacksCommandDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { toCampaignAccessBo } from '../campaigns/campaigns.mapper';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { gridEventBase, type GridEventBase } from '../scenes/locked-scene';
import {
  inLockedCast,
  inLockedGridWithCast,
  savedEventBase,
  type CastAndGridChange,
  type LockedGridMaybeCast,
  type SavedInCastAndGrid,
  type SavedVersion,
} from '../scenes/locked-cast';
import { stateHolderIn, type StateHolder } from '../tokens/linked-token';
import type { ScenesDao } from '../scenes/scenes.dao';
import type { ScenePo } from '../scenes/scenes.po';
import type { TokenRow, TokensDao } from '../tokens/tokens.dao';
import { TokenNotFoundError } from '../tokens/tokens.error';
import { ConditionRulesBo } from './condition-rules.bo';
import type { CombatDao } from '../combat/combat.dao';
import type { ActiveConditionRow, ConditionDuration, ConditionsDao } from './conditions.dao';
import { ConditionNotFoundError } from './conditions.error';
import type { ConditionDefinitionPo } from './conditions.po';
import {
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
  scenes: Pick<ScenesDao, 'lockInCampaign' | 'lockCastOf' | 'bumpVersion'>;
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
    | 'findActiveOnToken'
    | 'setStacks'
    | 'capStacks'
  >;
}>;

export type ConditionTransactionRunner = <T>(
  work: (daos: ConditionWriteDaos) => Promise<T>,
) => Promise<T>;

export type ConditionsServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: ConditionTransactionRunner;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

type Locked = LockedGridMaybeCast<ConditionWriteDaos>;
/** A condition as saved and the token that holds it (a linked token's anchor). */
type Held<T> = Readonly<{ tokenId: string; saved: T }>;

const RULES = new ConditionRulesBo();

/** The conditions of a table: the master adds to the list; any member who acts (master or
 *  player, never the spectator) applies, adjusts and removes them on any token of the grid the
 *  command names — a condition is a marker everyone sees, the table corrects itself (spec §3.7).
 *  Persisted, version bumped, then published to who has that grid open (the list itself, to the
 *  cast: every member). Editing and deleting the list is `ConditionCatalogService`'s.
 *
 *  Example: `await conditionsService.apply(user.id, campaignId, { tokenId, conditionId, rounds: 2 })` */
export class ConditionsService {
  constructor(private readonly deps: ConditionsServiceDeps) {}

  async define(userId: string, campaignId: string, command: DefineCondition): Promise<number> {
    const access = await this.accessOf(userId, campaignId);
    access.requireMaster('define a condition');
    // The list is the table's: it stays on the cast whatever grid the command names.
    const outcome = await inLockedCast(this.deps.transaction, campaignId, async ({ daos }) => {
      const existing = await daos.conditions.findDefinitionByName(campaignId, command.name);
      if (RULES.defineOrReuse(existing).kind === 'reuse') return { value: null, changed: false };
      const fields = toNewConditionDefinition(command);
      const created = await daos.conditions.insertDefinition(campaignId, fields);
      return { value: created, changed: true };
    });
    if (!outcome.value) return outcome.version;
    const definition = toConditionDefinitionDto(outcome.value);
    const base = gridEventBase(campaignId, outcome, this.deps.clock);
    this.deps.publisher.conditionDefined({ ...base, definition });
    return outcome.version;
  }

  /** On a linked token the condition lands on its anchor: an event of the cast, every grid.
   *  Applying a stacking condition the token already has adds a stack and renews the duration. */
  async apply(userId: string, campaignId: string, command: ApplyCondition): Promise<number> {
    const access = await this.accessOf(userId, campaignId);
    const saved = await this.inSharedGrid(access, command.sceneId, async (locked) => {
      const { daos, scene } = locked;
      const token = await tokenInScene(daos, scene, command.tokenId);
      const known = await knownDefinition(daos, campaignId, command.conditionId);
      const duration = await durationIn(daos, scene, command.rounds);
      const holder = stateHolderIn(locked, token);
      const [applied] = await applyTo(daos, [holder.tokenId], known, duration);
      if (!applied) throw new Error(`apply of ${known.id} on ${holder.tokenId} saved nothing`);
      return heldBy(holder, applied);
    });
    this.publishOne(campaignId, saved);
    return saved.version;
  }

  /** All or nothing: one token missing from the grid refuses the whole group, one version. */
  /** A group mixing linked and unlinked tokens: the anchors' conditions go out as an event of
   *  the cast, the others' as one of the grid. */
  async applyMany(userId: string, campaignId: string, command: ApplyConditions): Promise<number> {
    const access = await this.accessOf(userId, campaignId);
    const saved = await this.inGrid(access, command.sceneId, async (locked) => {
      const { daos, scene } = locked;
      const tokens = await tokensInScene(daos, scene, command.tokenIds);
      const known = await knownDefinition(daos, campaignId, command.conditionId);
      const duration = await durationIn(daos, scene, command.rounds);
      const holders = tokens.map((row) => stateHolderIn(locked, row));
      const holderIds = holders.map((holder) => holder.tokenId);
      const applied = await applyTo(daos, holderIds, known, duration);
      const inCast = (index: number): boolean => holders[index]?.inCast ?? false;
      const grid = applied.filter((_, index) => !inCast(index));
      const cast = applied.filter((_, index) => inCast(index));
      return { value: { grid, cast }, grid: grid.length > 0, cast: cast.length > 0 };
    });
    this.publishApplied(campaignId, saved.cast, saved.value.cast);
    this.publishApplied(campaignId, saved.grid, saved.value.grid);
    return saved.version;
  }

  async remove(userId: string, campaignId: string, command: RemoveCondition): Promise<number> {
    const access = await this.accessOf(userId, campaignId);
    const { activeConditionId } = command;
    const saved = await this.inSharedGrid(access, command.sceneId, async (locked) => {
      const token = await tokenInScene(locked.daos, locked.scene, command.tokenId);
      const holder = stateHolderIn(locked, token);
      const removed = await locked.daos.conditions.remove(holder.tokenId, activeConditionId);
      if (!removed) throw new ConditionNotFoundError(campaignId, activeConditionId);
      return heldBy(holder, removed);
    });
    const { tokenId } = saved.value;
    this.deps.publisher.conditionRemoved({
      ...this.baseOf(campaignId, saved),
      tokenId,
      activeConditionId,
    });
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
    const saved = await this.inSharedGrid(access, command.sceneId, async (locked) => {
      const token = await tokenInScene(locked.daos, locked.scene, command.tokenId);
      const rounds = RULES.durationOf(command.rounds);
      const { activeConditionId } = command;
      const holder = stateHolderIn(locked, token);
      const conditions = locked.daos.conditions;
      const changed = await conditions.setRounds(holder.tokenId, activeConditionId, rounds);
      if (!changed) throw new ConditionNotFoundError(campaignId, activeConditionId);
      return heldBy(holder, changed);
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
    const saved = await this.inSharedGrid(access, command.sceneId, async (locked) => {
      const token = await tokenInScene(locked.daos, locked.scene, command.tokenId);
      const holder = stateHolderIn(locked, token);
      const changed = await stacksSetOn(locked.daos, campaignId, holder.tokenId, command);
      return heldBy(holder, changed);
    });
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
    work: (locked: Locked) => Promise<CastAndGridChange<T>>,
  ): Promise<SavedInCastAndGrid<T>> {
    const address = { campaignId: access.campaignIdOf(), sceneId, access };
    return inLockedGridWithCast(this.deps.transaction, address, work);
  }

  // A command on one token touches one scene: the grid, or the cast for a linked token.
  private inSharedGrid<T>(
    access: CampaignAccessBo,
    sceneId: string | undefined,
    work: (locked: Locked) => Promise<Readonly<{ held: Held<T>; inCast: boolean }>>,
  ): Promise<SavedInCastAndGrid<Held<T>>> {
    return this.inGrid(access, sceneId, async (locked) => {
      const { held, inCast } = await work(locked);
      return { value: held, grid: !inCast, cast: inCast };
    });
  }

  private baseOf(campaignId: string, saved: SavedInCastAndGrid<unknown>): GridEventBase {
    const touched = saved.cast ?? saved.grid;
    if (!touched) throw new Error('a condition command touched neither its grid nor the cast');
    return savedEventBase(campaignId, touched, this.deps.clock);
  }

  private publishOne(
    campaignId: string,
    saved: SavedInCastAndGrid<Held<ActiveConditionRow>>,
  ): void {
    const { tokenId, saved: row } = saved.value;
    const condition = toActiveConditionDto(row);
    this.deps.publisher.conditionApplied({ ...this.baseOf(campaignId, saved), tokenId, condition });
  }

  private publishApplied(
    campaignId: string,
    saved: SavedVersion | null,
    applied: readonly ActiveConditionRow[],
  ): void {
    if (!saved || applied.length === 0) return;
    const base = savedEventBase(campaignId, saved, this.deps.clock);
    this.deps.publisher.conditionsApplied({ ...base, applied: applied.map(toTokenConditionDto) });
  }
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
  tokenIds: readonly string[],
  known: ConditionDefinitionPo,
  duration: ConditionDuration,
): Promise<ActiveConditionRow[]> {
  const current = await daos.conditions.stacksOf(tokenIds, known.id);
  const applied: ActiveConditionRow[] = [];
  for (const tokenId of tokenIds) {
    const stacks = RULES.stacksAfterApply(current.get(tokenId) ?? null, known.maxStacks);
    applied.push(await daos.conditions.apply(tokenId, known.id, duration, stacks));
  }
  return applied;
}

async function stacksSetOn(
  daos: ConditionWriteDaos,
  campaignId: string,
  holderTokenId: string,
  command: SetConditionStacks,
): Promise<ActiveConditionRow> {
  const { activeConditionId, stacks } = command;
  const active = await daos.conditions.findActiveOnToken(holderTokenId, activeConditionId);
  if (!active) throw new ConditionNotFoundError(campaignId, activeConditionId);
  RULES.requireStacksWithin(active, stacks);
  const changed = await daos.conditions.setStacks(holderTokenId, activeConditionId, stacks);
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

function heldBy<T>(holder: StateHolder, saved: T): Readonly<{ held: Held<T>; inCast: boolean }> {
  return { held: { tokenId: holder.tokenId, saved }, inCast: holder.inCast };
}
