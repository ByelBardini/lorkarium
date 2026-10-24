import type {
  EndCombatCommandDto,
  AddCombatantsCommandDto,
  CombatDto,
  ConditionChangeDto,
  MoveInTieCommandDto,
  RegroupTokensCommandDto,
  RemoveCombatantCommandDto,
  RenameCombatantCommandDto,
  SetInitiativeCommandDto,
  StartCombatCommandDto,
  TurnCommandDto,
} from '@lorkarium/contracts';
import { orderCombatants, tickAtTurnEnd, type TurnState } from '@lorkarium/game-core';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { toCampaignAccessBo } from '../campaigns/campaigns.mapper';
import type { ConditionsDao } from '../conditions/conditions.dao';
import { toActiveConditionDto } from '../conditions/conditions.mapper';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { gridEventBase, inLockedGrid, type SavedInScene } from '../scenes/locked-scene';
import {
  inLockedGridWithCast,
  requireCastLock,
  savedEventBase,
  type SavedVersion,
} from '../scenes/locked-cast';
import type { ScenesDao } from '../scenes/scenes.dao';
import type { ScenePo } from '../scenes/scenes.po';
import type { TokenControlPo, TokensDao } from '../tokens/tokens.dao';
import { CombatBo } from './combat.bo';
import { CombatRosterBo, type RosterChange } from './combat-roster.bo';
import type { CombatDao, CombatRow } from './combat.dao';
import { toCombatDto, toCombatState } from './combat.mapper';

type Envelope = 'actionId' | 'campaignId';
export type StartCombat = Omit<StartCombatCommandDto, Envelope>;
export type EndCombat = Omit<EndCombatCommandDto, Envelope>;
export type AddCombatants = Omit<AddCombatantsCommandDto, Envelope>;
export type RemoveCombatant = Omit<RemoveCombatantCommandDto, Envelope>;
export type RegroupTokens = Omit<RegroupTokensCommandDto, Envelope>;
export type RenameCombatant = Omit<RenameCombatantCommandDto, Envelope>;
export type MoveInTie = Omit<MoveInTieCommandDto, Envelope>;
export type SetInitiative = Omit<SetInitiativeCommandDto, Envelope>;
export type TurnCommand = Omit<TurnCommandDto, Envelope>;

/** The DAOs a transaction hands out, bound to the open `tx`. */
export type CombatWriteDaos = Readonly<{
  scenes: Pick<ScenesDao, 'lockInCampaign' | 'lockCastOf' | 'bumpVersion'>;
  tokens: Pick<TokensDao, 'controlOfScene'>;
  combat: Pick<
    CombatDao,
    | 'start'
    | 'findOfScene'
    | 'addCombatants'
    | 'linkTokens'
    | 'unlinkTokens'
    | 'removeCombatants'
    | 'rename'
    | 'setInitiative'
    | 'setTieOrders'
    | 'setTurn'
    | 'end'
  >;
  conditions: Pick<ConditionsDao, 'listOfTokens' | 'decrementRemaining' | 'deleteActive'>;
}>;

export type CombatTransactionRunner = <T>(
  work: (daos: CombatWriteDaos) => Promise<T>,
) => Promise<T>;

export type CombatServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: CombatTransactionRunner;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

/** What a combat command sees inside its transaction. */
type InCombat = Readonly<{
  daos: CombatWriteDaos;
  scene: ScenePo;
  /** The tokens of the scene and who controls each: no bar, no other column of the token. */
  tokens: readonly TokenControlPo[];
  row: CombatRow | undefined;
  bo: CombatBo;
  roster: CombatRosterBo;
}>;

type TurnChange = Readonly<{ combat: CombatDto; conditionChanges: ConditionChangeDto[] }>;

/** The combat of each grid (spec §3.5): every command locks the grid it names, decides by the rule, saves,
 *  bumps the version and, after the commit, publishes. Turns and the conditions that count down at
 *  the end of a turn go out together, in one version.
 *
 *  Example: `await combatService.nextTurn(user.id, campaignId, { fromCombatantId })` */
export class CombatService {
  constructor(private readonly deps: CombatServiceDeps) {}

  async start(userId: string, campaignId: string, command: StartCombat): Promise<number> {
    const saved = await this.inCombat(
      userId,
      campaignId,
      command.sceneId,
      async ({ daos, scene, tokens, roster }) => {
        const entries = roster.start(command.entries, idsOf(tokens));
        const started = await daos.combat.start(scene.id, entries);
        const first = orderCombatants(started.combatants)[0]?.id ?? null;
        await daos.combat.setTurn(started.combat.id, 1, first);
        return combatOf(daos, scene);
      },
    );
    this.deps.publisher.combatStarted({
      ...gridEventBase(campaignId, saved, this.deps.clock),
      combat: saved.value,
    });
    return saved.version;
  }

  async end(userId: string, campaignId: string, command: EndCombat = {}): Promise<number> {
    const saved = await this.inCombat(userId, campaignId, command.sceneId, async ({ daos, bo }) => {
      await daos.combat.end(bo.end().id);
    });
    this.deps.publisher.combatEnded(gridEventBase(campaignId, saved, this.deps.clock));
    return saved.version;
  }

  addCombatants(userId: string, campaignId: string, command: AddCombatants): Promise<number> {
    return this.updated(
      userId,
      campaignId,
      command.sceneId,
      async ({ daos, tokens, row, roster }) => {
        const entries = roster.addCombatants(command.entries, idsOf(tokens));
        await daos.combat.addCombatants(combatIdOf(row), entries);
      },
    );
  }

  removeCombatant(userId: string, campaignId: string, command: RemoveCombatant): Promise<number> {
    return this.updated(userId, campaignId, command.sceneId, async ({ daos, row, roster }) => {
      const turn = roster.removeCombatant(command.combatantId);
      await daos.combat.removeCombatants(combatIdOf(row), [command.combatantId]);
      await saveTurn(daos, row, turn);
    });
  }

  regroupTokens(userId: string, campaignId: string, command: RegroupTokens): Promise<number> {
    return this.updated(
      userId,
      campaignId,
      command.sceneId,
      async ({ daos, tokens, row, roster }) => {
        const change = roster.regroup(command.tokenIds, command.target, idsOf(tokens));
        await applyRoster(daos, combatIdOf(row), change);
      },
    );
  }

  renameCombatant(userId: string, campaignId: string, command: RenameCombatant): Promise<number> {
    return this.updated(userId, campaignId, command.sceneId, async ({ daos, roster }) => {
      const name = roster.rename(command.combatantId, command.name);
      await daos.combat.rename(command.combatantId, name);
    });
  }

  moveInTie(userId: string, campaignId: string, command: MoveInTie): Promise<number> {
    return this.updated(userId, campaignId, command.sceneId, async ({ daos, bo }) => {
      await daos.combat.setTieOrders(bo.moveInTie(command.combatantId, command.direction));
    });
  }

  setInitiative(userId: string, campaignId: string, command: SetInitiative): Promise<number> {
    return this.updated(userId, campaignId, command.sceneId, async ({ daos, bo }) => {
      const value = bo.setInitiative(command.combatantId, command.initiative);
      await daos.combat.setInitiative(command.combatantId, value);
    });
  }

  /** The tokens of the entry that played count down their conditions; a linked token's are its
   *  anchor's (the cast is locked before the grid), and go out to the cast as
   *  `condition:changedMany`. */
  async nextTurn(userId: string, campaignId: string, command: TurnCommand): Promise<number> {
    const access = await this.accessOf(userId, campaignId);
    const address = { campaignId, sceneId: command.sceneId, access };
    const saved = await inLockedGridWithCast(this.deps.transaction, address, async (locked) => {
      const { daos, row, bo, tokens } = await this.combatIn(locked, access);
      const turn = bo.nextTurn(command.fromCombatantId);
      const ended = row?.combatants.find(({ id }) => id === turn.endedTurnOf);
      const { loose, anchors } = holdersOf(tokens, ended?.tokenIds ?? []);
      if (anchors.length > 0) requireCastLock(locked);
      await saveTurn(daos, row, turn);
      const round = row?.combat.round ?? turn.round;
      const conditionChanges = await tickConditions(daos, loose, round);
      const anchorChanges = await tickConditions(daos, anchors, round);
      const combat = turnedCombat(row, turn);
      const value = { combat, conditionChanges, anchorChanges };
      return { value, grid: true, cast: anchors.length > 0 };
    });
    const { combat, conditionChanges, anchorChanges } = saved.value;
    this.publishAnchors(campaignId, saved.cast, anchorChanges);
    if (saved.grid)
      this.publishTurn(campaignId, { ...saved.grid, value: { combat, conditionChanges } });
    return saved.version;
  }

  async previousTurn(userId: string, campaignId: string, command: TurnCommand): Promise<number> {
    const saved = await this.inCombat(
      userId,
      campaignId,
      command.sceneId,
      async ({ daos, row, bo }) => {
        const turn = bo.previousTurn(command.fromCombatantId);
        await saveTurn(daos, row, turn);
        return { combat: turnedCombat(row, turn), conditionChanges: [] };
      },
    );
    this.publishTurn(campaignId, saved);
    return saved.version;
  }

  // A change to the combat that everyone sees as `combat:updated`.
  private async updated(
    userId: string,
    campaignId: string,
    sceneId: string | undefined,
    work: (locked: InCombat) => Promise<void>,
  ): Promise<number> {
    const saved = await this.inCombat(userId, campaignId, sceneId, async (locked) => {
      await work(locked);
      return combatOf(locked.daos, locked.scene);
    });
    this.deps.publisher.combatUpdated({
      ...gridEventBase(campaignId, saved, this.deps.clock),
      combat: saved.value,
    });
    return saved.version;
  }

  private async inCombat<T>(
    userId: string,
    campaignId: string,
    sceneId: string | undefined,
    work: (locked: InCombat) => Promise<T>,
  ): Promise<SavedInScene<T>> {
    const access = await this.accessOf(userId, campaignId);
    const address = { campaignId, sceneId, access };
    return inLockedGrid(this.deps.transaction, address, async (locked) =>
      work(await this.combatIn(locked, access)),
    );
  }

  private async combatIn(
    { daos, scene }: Readonly<{ daos: CombatWriteDaos; scene: ScenePo }>,
    access: CampaignAccessBo,
  ): Promise<InCombat> {
    const tokens = await daos.tokens.controlOfScene(scene.id);
    const row = await daos.combat.findOfScene(scene.id);
    const state = row ? toCombatState(row, controllersIn(tokens)) : null;
    const bo = new CombatBo(access, state);
    const roster = new CombatRosterBo(access, state);
    return { daos, scene, tokens, row, bo, roster };
  }

  private publishAnchors(
    campaignId: string,
    cast: SavedVersion | null,
    changes: ConditionChangeDto[],
  ): void {
    if (!cast) return;
    const base = savedEventBase(campaignId, cast, this.deps.clock);
    this.deps.publisher.conditionsChanged({ ...base, changes });
  }

  private async accessOf(userId: string, campaignId: string): Promise<CampaignAccessBo> {
    const membership = await this.deps.members.findMembership(campaignId, userId);
    const access = toCampaignAccessBo(campaignId, userId, membership);
    access.requireMember();
    return access;
  }

  private publishTurn(campaignId: string, saved: SavedInScene<TurnChange>): void {
    this.deps.publisher.combatTurnChanged({
      ...gridEventBase(campaignId, saved, this.deps.clock),
      ...saved.value,
    });
  }
}

function controllersIn(tokens: readonly TokenControlPo[]): (tokenId: string) => readonly string[] {
  return (tokenId) => tokens.find((token) => token.tokenId === tokenId)?.controllerIds ?? [];
}

// The ids whose conditions a turn counts down: the unlinked tokens' own, the linked ones' anchor.
function holdersOf(
  tokens: readonly TokenControlPo[],
  tokenIds: readonly string[],
): Readonly<{ loose: string[]; anchors: string[] }> {
  const anchorOf = (tokenId: string) => tokens.find((t) => t.tokenId === tokenId)?.anchorTokenId;
  const loose = tokenIds.filter((tokenId) => !anchorOf(tokenId));
  const anchors = tokenIds.flatMap((tokenId) => anchorOf(tokenId) ?? []);
  return { loose, anchors };
}

function idsOf(tokens: readonly TokenControlPo[]): string[] {
  return tokens.map(({ tokenId }) => tokenId);
}

// The combat as saved by `saveTurn`, without reading it again: only the turn changed.
function turnedCombat(row: CombatRow | undefined, turn: TurnState): CombatDto {
  if (!row) throw new Error('the combat rule let a turn through without a combat');
  const { round, currentId: currentCombatantId } = turn;
  return toCombatDto({ ...row, combat: { ...row.combat, round, currentCombatantId } });
}

function combatIdOf(row: CombatRow | undefined): string {
  if (!row) throw new Error('the combat rule let a command through without a combat');
  return row.combat.id;
}

// Unlink first, so a token split into an entry of its own is not first linked and then unlinked.
async function applyRoster(
  daos: CombatWriteDaos,
  combatId: string,
  change: RosterChange,
): Promise<void> {
  await daos.combat.unlinkTokens(change.unlink);
  await daos.combat.removeCombatants(combatId, change.remove);
  await daos.combat.addCombatants(combatId, change.create);
  for (const { combatantId, tokenIds } of change.link)
    await daos.combat.linkTokens(combatantId, tokenIds);
  if (change.turn) await daos.combat.setTurn(combatId, change.turn.round, change.turn.currentId);
}

async function saveTurn(
  daos: CombatWriteDaos,
  row: CombatRow | undefined,
  turn: TurnState,
): Promise<void> {
  await daos.combat.setTurn(combatIdOf(row), turn.round, turn.currentId);
}

async function combatOf(daos: CombatWriteDaos, scene: ScenePo): Promise<CombatDto> {
  const row = await daos.combat.findOfScene(scene.id);
  if (!row) throw new Error(`the combat of scene ${scene.id} vanished inside its own transaction`);
  return toCombatDto(row);
}

// The end of the turn of `tokenIds` in `round`: their conditions count down, the ones at their
// last round go — one read, one UPDATE and one DELETE for the whole entry.
async function tickConditions(
  daos: CombatWriteDaos,
  tokenIds: readonly string[],
  round: number,
): Promise<ConditionChangeDto[]> {
  if (tokenIds.length === 0) return [];
  const active = await daos.conditions.listOfTokens(tokenIds);
  const ticks = tokenIds.map((tokenId) => {
    const own = active.filter((condition) => condition.tokenId === tokenId);
    return { tokenId, own, ...tickAtTurnEnd(own, round) };
  });
  const counted = ticks.flatMap(({ own, kept }) => countedDown(own, kept));
  await daos.conditions.decrementRemaining(counted);
  await daos.conditions.deleteActive(ticks.flatMap(({ expired }) => expired.map(({ id }) => id)));
  return ticks.map(({ tokenId, kept }) => ({
    tokenId,
    conditions: kept.map(toActiveConditionDto),
  }));
}

// The ids whose duration the tick lowered (the rest kept theirs: untimed or applied this round).
function countedDown<T extends Readonly<{ id: string; remainingRounds: number | null }>>(
  before: readonly T[],
  after: readonly T[],
): string[] {
  const was = new Map(before.map(({ id, remainingRounds }) => [id, remainingRounds]));
  return after
    .filter(({ id, remainingRounds }) => was.get(id) !== remainingRounds)
    .map(({ id }) => id);
}
