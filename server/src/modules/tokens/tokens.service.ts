import type {
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
import { memberAccessOf } from '../campaigns/member-access';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import {
  activeSceneOf,
  inLockedScene,
  type LockedScene,
  type SavedInScene,
} from '../scenes/locked-scene';
import type { ScenePo } from '../scenes/scenes.po';
import { TokenRulesBo } from './token-rules.bo';
import {
  audiencesOf,
  combatOf,
  newTokenRowOf,
  passTurnIfLeaving,
  requireAssetsOf,
  tokenAccessOf,
  tokenIn,
  tokensIn,
  withConditions,
  type TokenTransactionRunner,
  type TokenWithConditions,
  type TokenWriteDaos,
} from './token-transaction';
import type { TokenRow } from './tokens.dao';
import { BarNotFoundError } from './tokens.error';
import { toTokenUpdatePo } from './tokens.mapper';

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

export type TokensServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership' | 'listMembers'>;
  transaction: TokenTransactionRunner;
  publisher: BoardPublisherPort;
  clock: ClockPort;
  /** `BAR_VALUE_LIMIT`, handed to the rule. */
  barLimit: number;
}>;

type Locked = LockedScene<TokenWriteDaos>;

/** The token use cases: each locks the scene, decides, saves, bumps the version and, only after
 *  the commit, publishes (whole to the privileged, redacted to the rest). Returns the version.
 *
 *  Example: `const version = await tokensService.move(user.id, campaignId, { tokenId, col, row })` */
export class TokensService {
  constructor(private readonly deps: TokensServiceDeps) {}

  async create(userId: string, campaignId: string, command: CreateToken): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.requireMaster('create a token');
    const memberIds = await this.memberIdsOf(campaignId);
    const saved = await this.inScene(campaignId, async ({ daos, scene }) => {
      const row = newTokenRowOf(scene.id, this.rulesFor(scene, memberIds), command);
      await requireAssetsOf(daos, campaignId, [command.imageAssetId]);
      return withConditions(daos, await daos.tokens.insert(row));
    });
    this.publishChange('token:created', campaignId, saved);
    return saved.version;
  }

  async update(userId: string, campaignId: string, command: UpdateToken): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.requireMaster('edit a token');
    const memberIds = await this.memberIdsOf(campaignId);
    const saved = await this.inScene(campaignId, async ({ daos, scene }) => {
      const found = await tokenIn(daos, scene, campaignId, command.tokenId);
      const rules = this.rulesFor(scene, memberIds);
      rules.place(found.token, command);
      const update = toTokenUpdatePo(command, rules.controllers(command.controllerIds));
      await requireAssetsOf(daos, campaignId, [command.imageAssetId]);
      await daos.tokens.update(found.token.id, update);
      return withConditions(daos, await tokenIn(daos, scene, campaignId, command.tokenId));
    });
    this.publishChange('token:updated', campaignId, saved);
    return saved.version;
  }

  async move(userId: string, campaignId: string, command: MoveToken): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const saved = await this.inScene(campaignId, async ({ daos, scene }) => {
      const found = await tokenIn(daos, scene, campaignId, command.tokenId);
      tokenAccessOf(access, found).requireMove('move', found.token.layer);
      const { col, row } = this.rulesFor(scene, []).place(command, found.token);
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
   *  the requester (control and layer), fit the scene and, when the move carries `expect`
   *  (an undo), still be on that cell — else STALE_UNDO.
   *
   *  Example: `await tokensService.moveMany(user.id, campaignId, { moves: [{ tokenId, col, row }] })` */
  async moveMany(userId: string, campaignId: string, command: MoveTokens): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const cells = command.moves.map(({ tokenId, col, row }) => ({ tokenId, cell: { col, row } }));
    const moves = command.moves.map(({ tokenId, col, row }) => ({ tokenId, col, row }));
    const saved = await this.inScene(campaignId, async (locked) => {
      const rows = await this.placeGroup(locked, access, cells, 'move');
      const rules = this.rulesFor(locked.scene, []);
      rows.forEach((row, index) => {
        rules.requireAt(row.token.id, command.moves[index]?.expect, row.token);
      });
      await locked.daos.tokens.moveMany(moves);
    });
    const at = this.now();
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
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const version = await this.deps.transaction(async (daos) => {
      const scene = activeSceneOf(campaignId, await daos.scenes.findActiveOf(campaignId));
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
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
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
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
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
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.requireMaster('delete a token');
    const saved = await this.inScene(campaignId, async ({ daos, scene }) => {
      const found = await tokenIn(daos, scene, campaignId, command.tokenId);
      await passTurnIfLeaving(daos, scene, access, [found.token.id]);
      await daos.tokens.delete(found.token.id);
      return combatOf(daos, scene);
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

  private async memberIdsOf(campaignId: string): Promise<string[]> {
    return (await this.deps.members.listMembers(campaignId)).map(({ userId }) => userId);
  }

  private inScene<T>(
    campaignId: string,
    work: (locked: Locked) => Promise<T>,
  ): Promise<SavedInScene<T>> {
    return inLockedScene(this.deps.transaction, campaignId, work);
  }

  // Every token found, movable by the requester and fitting where it goes, before any write.
  private async placeGroup(
    { daos, scene }: Locked,
    access: CampaignAccessBo,
    cells: readonly GroupCell[],
    action: 'move' | 'drag',
  ): Promise<TokenRow[]> {
    const tokenIds = cells.map(({ tokenId }) => tokenId);
    const rows = await tokensIn(daos, scene, access.campaignIdOf(), tokenIds);
    const rules = this.rulesFor(scene, []);
    rows.forEach((row, index) => {
      tokenAccessOf(access, row).requireMove(action, row.token.layer);
      const cell = cells[index]?.cell;
      if (cell) rules.place(cell, row.token);
    });
    return rows;
  }

  private rulesFor(scene: ScenePo, memberIds: readonly string[]): TokenRulesBo {
    const sceneSize = { widthCells: scene.widthCells, heightCells: scene.heightCells };
    return new TokenRulesBo({ scene: sceneSize, memberIds, barLimit: this.deps.barLimit });
  }

  private publishChange(
    name: 'token:created' | 'token:updated',
    campaignId: string,
    saved: SavedInScene<TokenWithConditions>,
  ): void {
    const base = { campaignId, version: saved.version, at: this.now() };
    const { controllerIds, privileged, others } = audiencesOf(saved.value);
    this.deps.publisher.tokenChanged({
      name,
      campaignId,
      controllerIds,
      privileged: { ...base, token: privileged },
      others: { ...base, token: others },
    });
  }

  private now(): string {
    return this.deps.clock.now().toISOString();
  }
}
