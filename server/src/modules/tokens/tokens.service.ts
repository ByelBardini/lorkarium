import type {
  ActiveConditionDto,
  AdjustBarCommandDto,
  CreateTokenCommandDto,
  DeleteTokenCommandDto,
  DragTokensCommandDto,
  MoveTokenCommandDto,
  MoveTokensCommandDto,
  SetTokenLayerCommandDto,
  UpdateTokenCommandDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { toCampaignAccessBo } from '../campaigns/campaigns.mapper';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import type { ScenesDao } from '../scenes/scenes.dao';
import type { ScenePo } from '../scenes/scenes.po';
import { CombatBo } from '../combat/combat.bo';
import type { CombatDao } from '../combat/combat.dao';
import { toCombatDto, toCombatState } from '../combat/combat.mapper';
import type { ConditionsDao } from '../conditions/conditions.dao';
import { toActiveConditionDto } from '../conditions/conditions.mapper';
import { TokenAccessBo } from './token-access.bo';
import { TokenRulesBo } from './token-rules.bo';
import type { TokenRow, TokensDao } from './tokens.dao';
import { BarNotFoundError, TokenNotFoundError } from './tokens.error';
import { toBarInputsPo, toTokenDto, toTokenUpdatePo } from './tokens.mapper';

type Envelope = 'actionId' | 'campaignId';
export type CreateToken = Omit<CreateTokenCommandDto, Envelope>;
export type UpdateToken = Omit<UpdateTokenCommandDto, Envelope>;
export type MoveToken = Omit<MoveTokenCommandDto, Envelope>;
export type AdjustBar = Omit<AdjustBarCommandDto, Envelope>;
export type DeleteToken = Omit<DeleteTokenCommandDto, Envelope>;
export type SetTokenLayer = Omit<SetTokenLayerCommandDto, Envelope>;
export type MoveTokens = Omit<MoveTokensCommandDto, Envelope>;
export type DragTokens = Omit<DragTokensCommandDto, Envelope>;
type GroupCell = Readonly<{ tokenId: string; cell: Readonly<{ col: number; row: number }> | null }>;

/** The DAOs a transaction hands out, bound to the open `tx`. */
export type TokenWriteDaos = Readonly<{
  scenes: Pick<ScenesDao, 'findActiveOf' | 'lockActiveOf' | 'bumpVersion'>;
  tokens: Pick<
    TokensDao,
    | 'insert'
    | 'findInScene'
    | 'findManyInScene'
    | 'move'
    | 'moveMany'
    | 'setLayer'
    | 'setBarCurrent'
    | 'update'
    | 'delete'
  >;
  conditions: Pick<ConditionsDao, 'listOfTokens'>;
  combat: Pick<CombatDao, 'findOfScene' | 'setTurn'>;
}>;

export type TokenTransactionRunner = <T>(work: (daos: TokenWriteDaos) => Promise<T>) => Promise<T>;

export type TokensServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership' | 'listMembers'>;
  transaction: TokenTransactionRunner;
  publisher: BoardPublisherPort;
  clock: ClockPort;
  /** `BAR_VALUE_LIMIT`, handed to the rule. */
  barLimit: number;
}>;

type Locked = Readonly<{ daos: TokenWriteDaos; scene: ScenePo }>;
type Saved<T> = Readonly<{ value: T; version: number }>;

/** The token use cases: each locks the scene, decides, saves, bumps the version and, only after
 *  the commit, publishes (whole to the privileged, redacted to the rest). Returns the version.
 *
 *  Example: `const version = await tokensService.move(user.id, campaignId, { tokenId, col, row })` */
export class TokensService {
  constructor(private readonly deps: TokensServiceDeps) {}

  async create(userId: string, campaignId: string, command: CreateToken): Promise<number> {
    const access = await this.accessOf(userId, campaignId);
    access.requireMaster('create a token');
    const memberIds = await this.memberIdsOf(campaignId);
    const saved = await this.inScene(campaignId, async ({ daos, scene }) => {
      const rules = this.rulesFor(scene, memberIds);
      const { col, row } = rules.place(command, command.size);
      const token = {
        sceneId: scene.id,
        ...tokenFieldsOf(command),
        col,
        row,
        layer: command.layer,
      };
      const controllerIds = rules.controllers(command.controllerIds);
      const bars = toBarInputsPo(command.bars);
      return withConditions(daos, await daos.tokens.insert({ token, bars, controllerIds }));
    });
    this.publishChange('token:created', campaignId, saved);
    return saved.version;
  }

  async update(userId: string, campaignId: string, command: UpdateToken): Promise<number> {
    const access = await this.accessOf(userId, campaignId);
    access.requireMaster('edit a token');
    const memberIds = await this.memberIdsOf(campaignId);
    const saved = await this.inScene(campaignId, async ({ daos, scene }) => {
      const found = await tokenIn(daos, scene, campaignId, command.tokenId);
      const rules = this.rulesFor(scene, memberIds);
      rules.place(found.token, command.size);
      const update = toTokenUpdatePo(command, rules.controllers(command.controllerIds));
      await daos.tokens.update(found.token.id, update);
      return withConditions(daos, await tokenIn(daos, scene, campaignId, command.tokenId));
    });
    this.publishChange('token:updated', campaignId, saved);
    return saved.version;
  }

  async move(userId: string, campaignId: string, command: MoveToken): Promise<number> {
    const access = await this.accessOf(userId, campaignId);
    const saved = await this.inScene(campaignId, async ({ daos, scene }) => {
      const found = await tokenIn(daos, scene, campaignId, command.tokenId);
      tokenAccessOf(access, found).requireMove('move', found.token.layer);
      const { col, row } = this.rulesFor(scene, []).place(command, found.token.size);
      await daos.tokens.move(found.token.id, col, row);
      return { col, row };
    });
    const { col, row } = saved.value;
    const at = this.now();
    this.deps.publisher.tokenMoved({
      campaignId,
      version: saved.version,
      at,
      tokenId: command.tokenId,
      col,
      row,
    });
    return saved.version;
  }

  /** Moves 1 to 64 tokens at once, all or nothing, in one version; each must be movable by
   *  the requester (control and layer) and fit the scene.
   *
   *  Example: `await tokensService.moveMany(user.id, campaignId, { moves: [{ tokenId, col, row }] })` */
  async moveMany(userId: string, campaignId: string, command: MoveTokens): Promise<number> {
    const access = await this.accessOf(userId, campaignId);
    const cells = command.moves.map(({ tokenId, col, row }) => ({ tokenId, cell: { col, row } }));
    const saved = await this.inScene(campaignId, async (locked) => {
      await this.placeGroup(locked, access, cells, 'move');
      await locked.daos.tokens.moveMany(command.moves);
    });
    const at = this.now();
    const moves = command.moves.map(({ tokenId, col, row }) => ({ tokenId, col, row }));
    this.deps.publisher.tokensMoved({ campaignId, version: saved.version, at, moves });
    return saved.version;
  }

  /** The drag preview of a group, checked like `moveMany` but neither saved nor versioned, and
   *  published to the table except the dragger's connection.
   *
   *  Example: `await tokensService.dragMany(user.id, campaignId, { drags }, socket.id)` */
  async dragMany(
    userId: string,
    campaignId: string,
    command: DragTokens,
    connectionId: string,
  ): Promise<number> {
    const access = await this.accessOf(userId, campaignId);
    const version = await this.deps.transaction(async (daos) => {
      const scene = activeScene(campaignId, await daos.scenes.findActiveOf(campaignId));
      await this.placeGroup({ daos, scene }, access, command.drags, 'drag');
      return scene.version;
    });
    const drags = command.drags.map(({ tokenId, cell }) => ({ tokenId, cell }));
    this.deps.publisher.tokensDragged({ campaignId, at: this.now(), drags }, connectionId);
    return version;
  }

  /** Moves 1 to 64 tokens of the active scene to one layer, all or nothing, in one version.
   *
   *  Example: `await tokensService.setLayer(user.id, campaignId, { tokenIds, layer: 'objects' })` */
  async setLayer(userId: string, campaignId: string, command: SetTokenLayer): Promise<number> {
    const access = await this.accessOf(userId, campaignId);
    access.requireMaster('change the layer of tokens');
    const saved = await this.inScene(campaignId, async ({ daos, scene }) => {
      await tokensIn(daos, scene, campaignId, command.tokenIds);
      await daos.tokens.setLayer(command.tokenIds, command.layer);
    });
    const { tokenIds, layer } = command;
    const at = this.now();
    this.deps.publisher.tokenLayerChanged({
      campaignId,
      version: saved.version,
      at,
      tokenIds: [...tokenIds],
      layer,
    });
    return saved.version;
  }

  async adjustBar(userId: string, campaignId: string, command: AdjustBar): Promise<number> {
    const access = await this.accessOf(userId, campaignId);
    const saved = await this.inScene(campaignId, async ({ daos, scene }) => {
      const found = await tokenIn(daos, scene, campaignId, command.tokenId);
      tokenAccessOf(access, found).requireControl('adjust a bar of');
      const bar = found.bars.find(({ id }) => id === command.barId);
      if (!bar) throw new BarNotFoundError(command.tokenId, command.barId);
      const current = this.rulesFor(scene, []).adjustBar(bar.current, command.change);
      await daos.tokens.setBarCurrent(bar.id, current);
      return withConditions(daos, await tokenIn(daos, scene, campaignId, command.tokenId));
    });
    this.publishChange('token:updated', campaignId, saved);
    return saved.version;
  }

  async delete(userId: string, campaignId: string, command: DeleteToken): Promise<number> {
    const access = await this.accessOf(userId, campaignId);
    access.requireMaster('delete a token');
    const saved = await this.inScene(campaignId, async ({ daos, scene }) => {
      const found = await tokenIn(daos, scene, campaignId, command.tokenId);
      await passTurnIfLeaving(daos, scene, access, found);
      await daos.tokens.delete(found.token.id);
      const combat = await daos.combat.findOfScene(scene.id);
      return combat ? toCombatDto(combat) : null;
    });
    const at = this.now();
    this.deps.publisher.tokenDeleted({
      campaignId,
      version: saved.version,
      at,
      tokenId: command.tokenId,
      combat: saved.value,
    });
    return saved.version;
  }

  private async accessOf(userId: string, campaignId: string): Promise<CampaignAccessBo> {
    const membership = await this.deps.members.findMembership(campaignId, userId);
    const access = toCampaignAccessBo(campaignId, userId, membership);
    access.requireMember();
    return access;
  }

  private async memberIdsOf(campaignId: string): Promise<string[]> {
    return (await this.deps.members.listMembers(campaignId)).map(({ userId }) => userId);
  }

  // Lock → work → bump, in one transaction; the caller publishes after it resolved (committed).
  private async inScene<T>(
    campaignId: string,
    work: (locked: Locked) => Promise<T>,
  ): Promise<Saved<T>> {
    return this.deps.transaction(async (daos) => {
      const scene = activeScene(campaignId, await daos.scenes.lockActiveOf(campaignId));
      const value = await work({ daos, scene });
      return { value, version: await daos.scenes.bumpVersion(scene.id) };
    });
  }

  // Every token found, movable by the requester and fitting where it goes, before any write.
  private async placeGroup(
    { daos, scene }: Locked,
    access: CampaignAccessBo,
    cells: readonly GroupCell[],
    action: 'move' | 'drag',
  ): Promise<void> {
    const tokenIds = cells.map(({ tokenId }) => tokenId);
    const rows = await tokensIn(daos, scene, access.campaignIdOf(), tokenIds);
    const rules = this.rulesFor(scene, []);
    rows.forEach((row, index) => {
      tokenAccessOf(access, row).requireMove(action, row.token.layer);
      const cell = cells[index]?.cell;
      if (cell) rules.place(cell, row.token.size);
    });
  }

  private rulesFor(scene: ScenePo, memberIds: readonly string[]): TokenRulesBo {
    const sceneSize = { widthCells: scene.widthCells, heightCells: scene.heightCells };
    return new TokenRulesBo({ scene: sceneSize, memberIds, barLimit: this.deps.barLimit });
  }

  private publishChange(
    name: 'token:created' | 'token:updated',
    campaignId: string,
    saved: Saved<TokenWithConditions>,
  ): void {
    const base = { campaignId, version: saved.version, at: this.now() };
    this.deps.publisher.tokenChanged({
      name,
      campaignId,
      controllerIds: saved.value.row.controllerIds,
      privileged: {
        ...base,
        token: toTokenDto(saved.value.row, 'privileged', saved.value.conditions),
      },
      others: { ...base, token: toTokenDto(saved.value.row, 'others', saved.value.conditions) },
    });
  }

  private now(): string {
    return this.deps.clock.now().toISOString();
  }
}

function activeScene(campaignId: string, scene: ScenePo | undefined): ScenePo {
  if (scene) return scene;
  throw new Error(`campaign ${campaignId} has no active scene; every campaign has one`);
}

type TokenWithConditions = Readonly<{ row: TokenRow; conditions: ActiveConditionDto[] }>;

async function withConditions(daos: TokenWriteDaos, row: TokenRow): Promise<TokenWithConditions> {
  const active = await daos.conditions.listOfTokens([row.token.id]);
  return { row, conditions: active.map(toActiveConditionDto) };
}

// A combatant on turn whose token is deleted hands the turn on, in the same transaction.
async function passTurnIfLeaving(
  daos: TokenWriteDaos,
  scene: ScenePo,
  access: CampaignAccessBo,
  leaving: TokenRow,
): Promise<void> {
  const combat = await daos.combat.findOfScene(scene.id);
  if (!combat) return;
  const state = toCombatState(combat, () => []);
  const turn = new CombatBo(access, state).turnWithoutToken(leaving.token.id);
  if (turn) await daos.combat.setTurn(combat.combat.id, turn.round, turn.currentId);
}

async function tokenIn(
  daos: TokenWriteDaos,
  scene: ScenePo,
  campaignId: string,
  tokenId: string,
): Promise<TokenRow> {
  const found = await daos.tokens.findInScene(scene.id, tokenId);
  if (!found) throw new TokenNotFoundError(campaignId, tokenId);
  return found;
}

// Every id must be on the scene: the first one missing (another table's too) refuses them all.
async function tokensIn(
  daos: TokenWriteDaos,
  scene: ScenePo,
  campaignId: string,
  tokenIds: readonly string[],
): Promise<TokenRow[]> {
  const found = await daos.tokens.findManyInScene(scene.id, tokenIds);
  const byId = new Map(found.map((row) => [row.token.id, row]));
  return tokenIds.map((tokenId) => {
    const row = byId.get(tokenId);
    if (!row) throw new TokenNotFoundError(campaignId, tokenId);
    return row;
  });
}

function tokenAccessOf(access: CampaignAccessBo, row: TokenRow): TokenAccessBo {
  return new TokenAccessBo(access, { tokenId: row.token.id, controllerIds: row.controllerIds });
}

function tokenFieldsOf(
  command: CreateToken,
): Pick<CreateToken, 'name' | 'initials' | 'side' | 'size'> {
  const { name, initials, side, size } = command;
  return { name, initials, side, size };
}
