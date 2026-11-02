import { controlVeilOf, cutsOf, type TokenVeil } from '../tokens/token-veil.mapper';
import { combatEventSeenBy, turnChangedSeenBy } from './combat-veil.mapper';
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
import type { CharacterPublisherPort } from '../characters/character-publisher.port';
import type { CharactersDao } from '../characters/characters.dao';
import {
  inLockedGridWithCharacters,
  requireCharactersLock,
} from '../characters/locked-characters-grid';
import type { ActiveConditionRow, ConditionsDao } from '../conditions/conditions.dao';
import { holderIdOf, holderIdOfRow, type ConditionHolder } from '../conditions/conditions.po';
import { toActiveConditionDto } from '../conditions/conditions.mapper';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { gridEventBase, inLockedGrid, type SavedInScene } from '../scenes/locked-scene';
import type { ScenesDao } from '../scenes/scenes.dao';
import type { ScenePo } from '../scenes/scenes.po';
import { publishCharactersChange } from '../tokens/character-writes';
import { charactersIn } from '../tokens/linked-token';
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
  scenes: Pick<ScenesDao, 'lockInCampaign' | 'bumpVersion'>;
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
  conditions: Pick<ConditionsDao, 'listOfHolders' | 'decrementRemaining' | 'deleteActive'>;
  /** A linked token's conditions live on its character: its lock, version and reread. */
  characters: Pick<CharactersDao, 'lockVersion' | 'bumpVersion' | 'findManyInCampaign'>;
}>;

export type CombatTransactionRunner = <T>(
  work: (daos: CombatWriteDaos) => Promise<T>,
) => Promise<T>;

export type CombatServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: CombatTransactionRunner;
  publisher: BoardPublisherPort;
  /** Where the conditions a turn counts down on a character are told: the character, whole. */
  characterPublisher: CharacterPublisherPort;
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
  /** The hidden tokens of the scene: the events cut them for who may not see them. */
  veil: TokenVeil;
}>;

/** What a combat transaction saved, with the veil of the scene it read. */
type Veiled<Saved> = Saved & Readonly<{ veil: TokenVeil }>;

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
    const event = { ...gridEventBase(campaignId, saved, this.deps.clock), combat: saved.value };
    this.deps.publisher.combatStarted(event, cutsOf(event, saved.veil, combatEventSeenBy));
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
   *  character's (the characters are locked before the grid), which goes out whole as
   *  `character:changed`; `combat:turnChanged` carries only the unlinked tokens' changes. */
  async nextTurn(userId: string, campaignId: string, command: TurnCommand): Promise<number> {
    const access = await this.accessOf(userId, campaignId);
    const address = { campaignId, sceneId: command.sceneId, access };
    const saved = await inLockedGridWithCharacters(
      this.deps.transaction,
      address,
      async (locked) => {
        const { daos, row, bo, tokens, veil } = await this.combatIn(locked, access);
        const turn = bo.nextTurn(command.fromCombatantId);
        const ended = row?.combatants.find(({ id }) => id === turn.endedTurnOf);
        const { loose, characterIds } = holdersOf(tokens, ended?.tokenIds ?? []);
        if (characterIds.length > 0) requireCharactersLock(locked);
        await saveTurn(daos, row, turn);
        const holders = holdersToTick(loose, characterIds);
        const ticks = await tickConditions(daos, holders, row?.combat.round ?? turn.round);
        const conditionChanges = loose.map((tokenId) => changeOf(tokenId, ticks));
        const characters = await charactersIn(daos, campaignId, characterIds);
        const value = { combat: turnedCombat(row, turn), conditionChanges, characters, veil };
        return { value, grid: true, characters: characterIds.length > 0 };
      },
    );
    const { combat, conditionChanges, characters, veil } = saved.value;
    const outlet = { publisher: this.deps.characterPublisher, clock: this.deps.clock };
    publishCharactersChange(outlet, campaignId, saved.characters, characters);
    if (saved.grid)
      this.publishTurn(campaignId, { ...saved.grid, value: { combat, conditionChanges }, veil });
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
    const event = { ...gridEventBase(campaignId, saved, this.deps.clock), combat: saved.value };
    this.deps.publisher.combatUpdated(event, cutsOf(event, saved.veil, combatEventSeenBy));
    return saved.version;
  }

  private async inCombat<T>(
    userId: string,
    campaignId: string,
    sceneId: string | undefined,
    work: (locked: InCombat) => Promise<T>,
  ): Promise<Veiled<SavedInScene<T>>> {
    const access = await this.accessOf(userId, campaignId);
    const address = { campaignId, sceneId, access };
    let veil: TokenVeil = { tokens: [] };
    const saved = await inLockedGrid(this.deps.transaction, address, async (locked) => {
      const inCombat = await this.combatIn(locked, access);
      veil = inCombat.veil;
      return work(inCombat);
    });
    return { ...saved, veil };
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
    return { daos, scene, tokens, row, bo, roster, veil: controlVeilOf(tokens) };
  }

  private async accessOf(userId: string, campaignId: string): Promise<CampaignAccessBo> {
    const membership = await this.deps.members.findMembership(campaignId, userId);
    const access = toCampaignAccessBo(campaignId, userId, membership);
    access.requireMember();
    return access;
  }

  private publishTurn(campaignId: string, saved: Veiled<SavedInScene<TurnChange>>): void {
    const event = { ...gridEventBase(campaignId, saved, this.deps.clock), ...saved.value };
    this.deps.publisher.combatTurnChanged(event, cutsOf(event, saved.veil, turnChangedSeenBy));
  }
}

function controllersIn(tokens: readonly TokenControlPo[]): (tokenId: string) => readonly string[] {
  return (tokenId) => tokens.find((token) => token.tokenId === tokenId)?.controllerIds ?? [];
}

// Whose conditions a turn counts down: the unlinked tokens' own, the linked ones' character's
// (each once).
function holdersOf(
  tokens: readonly TokenControlPo[],
  tokenIds: readonly string[],
): Readonly<{ loose: string[]; characterIds: string[] }> {
  const characterOf = (id: string) => tokens.find((t) => t.tokenId === id)?.characterId ?? null;
  const loose = tokenIds.filter((tokenId) => characterOf(tokenId) === null);
  const characterIds = tokenIds.flatMap((tokenId) => characterOf(tokenId) ?? []);
  return { loose, characterIds: [...new Set(characterIds)] };
}

function holdersToTick(
  loose: readonly string[],
  characterIds: readonly string[],
): ConditionHolder[] {
  const tokens = loose.map((tokenId) => ({ tokenId }));
  return [...tokens, ...characterIds.map((characterId) => ({ characterId }))];
}

function changeOf(
  tokenId: string,
  ticks: ReadonlyMap<string, readonly ActiveConditionRow[]>,
): ConditionChangeDto {
  return { tokenId, conditions: (ticks.get(tokenId) ?? []).map(toActiveConditionDto) };
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

// The end of the turn of `holders` in `round`: their conditions count down, the ones at their
// last round go — one read, one UPDATE and one DELETE for the whole entry. What each holder keeps,
// by its id.
async function tickConditions(
  daos: CombatWriteDaos,
  holders: readonly ConditionHolder[],
  round: number,
): Promise<ReadonlyMap<string, readonly ActiveConditionRow[]>> {
  if (holders.length === 0) return new Map();
  const active = await daos.conditions.listOfHolders(holders);
  const ticks = holders.map((holder) => {
    const holderId = holderIdOf(holder);
    const own = active.filter((condition) => holderIdOfRow(condition) === holderId);
    return { holderId, own, ...tickAtTurnEnd(own, round) };
  });
  const counted = ticks.flatMap(({ own, kept }) => countedDown(own, kept));
  await daos.conditions.decrementRemaining(counted);
  await daos.conditions.deleteActive(ticks.flatMap(({ expired }) => expired.map(({ id }) => id)));
  return new Map(ticks.map(({ holderId, kept }) => [holderId, kept]));
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
