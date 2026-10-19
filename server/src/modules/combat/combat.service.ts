import type {
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
import type { ScenesDao } from '../scenes/scenes.dao';
import type { ScenePo } from '../scenes/scenes.po';
import type { TokenRow, TokensDao } from '../tokens/tokens.dao';
import { CombatBo } from './combat.bo';
import { CombatRosterBo, type RosterChange } from './combat-roster.bo';
import type { CombatDao, CombatRow } from './combat.dao';
import { toCombatDto, toCombatState } from './combat.mapper';

type Envelope = 'actionId' | 'campaignId';
export type StartCombat = Omit<StartCombatCommandDto, Envelope>;
export type AddCombatants = Omit<AddCombatantsCommandDto, Envelope>;
export type RemoveCombatant = Omit<RemoveCombatantCommandDto, Envelope>;
export type RegroupTokens = Omit<RegroupTokensCommandDto, Envelope>;
export type RenameCombatant = Omit<RenameCombatantCommandDto, Envelope>;
export type MoveInTie = Omit<MoveInTieCommandDto, Envelope>;
export type SetInitiative = Omit<SetInitiativeCommandDto, Envelope>;
export type TurnCommand = Omit<TurnCommandDto, Envelope>;

/** The DAOs a transaction hands out, bound to the open `tx`. */
export type CombatWriteDaos = Readonly<{
  scenes: Pick<ScenesDao, 'lockActiveOf' | 'bumpVersion'>;
  tokens: Pick<TokensDao, 'listOfScene'>;
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
  conditions: Pick<ConditionsDao, 'listOfTokens' | 'setRemaining' | 'deleteActive'>;
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
  tokens: readonly TokenRow[];
  row: CombatRow | undefined;
  bo: CombatBo;
  roster: CombatRosterBo;
}>;

type Committed<T> = Readonly<{ value: T; version: number }>;
type TurnChange = Readonly<{ combat: CombatDto; conditionChanges: ConditionChangeDto[] }>;

/** The combat of a table (spec §3.5): every command locks the scene, decides by the rule, saves,
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
      async ({ daos, scene, tokens, roster }) => {
        const entries = roster.start(command.entries, idsOf(tokens));
        const started = await daos.combat.start(scene.id, entries);
        const first = orderCombatants(started.combatants)[0]?.id ?? null;
        await daos.combat.setTurn(started.combat.id, 1, first);
        return combatOf(daos, scene);
      },
    );
    this.deps.publisher.combatStarted({
      ...this.base(campaignId, saved.version),
      combat: saved.value,
    });
    return saved.version;
  }

  async end(userId: string, campaignId: string): Promise<number> {
    const saved = await this.inCombat(userId, campaignId, async ({ daos, bo }) => {
      await daos.combat.end(bo.end().id);
    });
    this.deps.publisher.combatEnded(this.base(campaignId, saved.version));
    return saved.version;
  }

  addCombatants(userId: string, campaignId: string, command: AddCombatants): Promise<number> {
    return this.updated(userId, campaignId, async ({ daos, tokens, row, roster }) => {
      const entries = roster.addCombatants(command.entries, idsOf(tokens));
      await daos.combat.addCombatants(combatIdOf(row), entries);
    });
  }

  removeCombatant(userId: string, campaignId: string, command: RemoveCombatant): Promise<number> {
    return this.updated(userId, campaignId, async ({ daos, row, roster }) => {
      const turn = roster.removeCombatant(command.combatantId);
      await daos.combat.removeCombatants(combatIdOf(row), [command.combatantId]);
      await saveTurn(daos, row, turn);
    });
  }

  regroupTokens(userId: string, campaignId: string, command: RegroupTokens): Promise<number> {
    return this.updated(userId, campaignId, async ({ daos, tokens, row, roster }) => {
      const change = roster.regroup(command.tokenIds, command.target, idsOf(tokens));
      await applyRoster(daos, combatIdOf(row), change);
    });
  }

  renameCombatant(userId: string, campaignId: string, command: RenameCombatant): Promise<number> {
    return this.updated(userId, campaignId, async ({ daos, roster }) => {
      const name = roster.rename(command.combatantId, command.name);
      await daos.combat.rename(command.combatantId, name);
    });
  }

  moveInTie(userId: string, campaignId: string, command: MoveInTie): Promise<number> {
    return this.updated(userId, campaignId, async ({ daos, bo }) => {
      await daos.combat.setTieOrders(bo.moveInTie(command.combatantId, command.direction));
    });
  }

  setInitiative(userId: string, campaignId: string, command: SetInitiative): Promise<number> {
    return this.updated(userId, campaignId, async ({ daos, bo }) => {
      const value = bo.setInitiative(command.combatantId, command.initiative);
      await daos.combat.setInitiative(command.combatantId, value);
    });
  }

  async nextTurn(userId: string, campaignId: string, command: TurnCommand): Promise<number> {
    const saved = await this.inCombat(userId, campaignId, async ({ daos, scene, row, bo }) => {
      const turn = bo.nextTurn(command.fromCombatantId);
      await saveTurn(daos, row, turn);
      const ended = row?.combatants.find(({ id }) => id === turn.endedTurnOf);
      const round = row?.combat.round ?? turn.round;
      const conditionChanges: ConditionChangeDto[] = [];
      for (const tokenId of ended?.tokenIds ?? [])
        conditionChanges.push(await tickConditions(daos, tokenId, round));
      return { combat: await combatOf(daos, scene), conditionChanges };
    });
    this.publishTurn(campaignId, saved);
    return saved.version;
  }

  async previousTurn(userId: string, campaignId: string, command: TurnCommand): Promise<number> {
    const saved = await this.inCombat(userId, campaignId, async ({ daos, scene, row, bo }) => {
      await saveTurn(daos, row, bo.previousTurn(command.fromCombatantId));
      return { combat: await combatOf(daos, scene), conditionChanges: [] };
    });
    this.publishTurn(campaignId, saved);
    return saved.version;
  }

  // A change to the combat that everyone sees as `combat:updated`.
  private async updated(
    userId: string,
    campaignId: string,
    work: (locked: InCombat) => Promise<void>,
  ): Promise<number> {
    const saved = await this.inCombat(userId, campaignId, async (locked) => {
      await work(locked);
      return combatOf(locked.daos, locked.scene);
    });
    this.deps.publisher.combatUpdated({
      ...this.base(campaignId, saved.version),
      combat: saved.value,
    });
    return saved.version;
  }

  private async inCombat<T>(
    userId: string,
    campaignId: string,
    work: (locked: InCombat) => Promise<T>,
  ): Promise<Committed<T>> {
    const access = await this.accessOf(userId, campaignId);
    return this.deps.transaction(async (daos) => {
      const scene = await daos.scenes.lockActiveOf(campaignId);
      if (!scene)
        throw new Error(`campaign ${campaignId} has no active scene; every campaign has one`);
      const tokens = await daos.tokens.listOfScene(scene.id);
      const row = await daos.combat.findOfScene(scene.id);
      const state = row ? toCombatState(row, controllersIn(tokens)) : null;
      const bo = new CombatBo(access, state);
      const roster = new CombatRosterBo(access, state);
      const value = await work({ daos, scene, tokens, row, bo, roster });
      return { value, version: await daos.scenes.bumpVersion(scene.id) };
    });
  }

  private async accessOf(userId: string, campaignId: string): Promise<CampaignAccessBo> {
    const membership = await this.deps.members.findMembership(campaignId, userId);
    const access = toCampaignAccessBo(campaignId, userId, membership);
    access.requireMember();
    return access;
  }

  private publishTurn(campaignId: string, saved: Committed<TurnChange>): void {
    this.deps.publisher.combatTurnChanged({
      ...this.base(campaignId, saved.version),
      ...saved.value,
    });
  }

  private base(
    campaignId: string,
    version: number,
  ): Readonly<{ campaignId: string; version: number; at: string }> {
    return { campaignId, version, at: this.deps.clock.now().toISOString() };
  }
}

function controllersIn(tokens: readonly TokenRow[]): (tokenId: string) => readonly string[] {
  return (tokenId) => tokens.find(({ token }) => token.id === tokenId)?.controllerIds ?? [];
}

function idsOf(tokens: readonly TokenRow[]): string[] {
  return tokens.map(({ token }) => token.id);
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

// The end of `tokenId`'s turn in `round`: its conditions count down, the ones at their last round go.
async function tickConditions(
  daos: CombatWriteDaos,
  tokenId: string,
  round: number,
): Promise<ConditionChangeDto> {
  const active = await daos.conditions.listOfTokens([tokenId]);
  const { kept, expired } = tickAtTurnEnd(active, round);
  for (const condition of kept) {
    if (condition.remainingRounds !== null)
      await daos.conditions.setRemaining(condition.id, condition.remainingRounds);
  }
  await daos.conditions.deleteActive(expired.map(({ id }) => id));
  return { tokenId, conditions: kept.map(toActiveConditionDto) };
}
